"""CAWS backend - Community Action With Students."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query, Header, Response, Request, Cookie, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import logging
import uuid
import base64
import asyncio
import math
import requests
import bcrypt
import jwt as pyjwt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import email_service  # imported after load_dotenv so env vars are set

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
APP_NAME = os.environ.get('APP_NAME', 'caws')

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="CAWS API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============ Object Storage ============
_storage_key = None

def init_storage(force: bool = False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        _storage_key = resp.json()["storage_key"]
        return _storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    for attempt in range(2):
        key = init_storage(force=attempt > 0)
        if not key:
            raise HTTPException(status_code=503, detail="Storage unavailable")
        try:
            resp = requests.put(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key, "Content-Type": content_type},
                data=data, timeout=120
            )
            resp.raise_for_status()
            return resp.json()
        except requests.exceptions.HTTPError as e:
            # Retry once with a freshly-obtained storage key (self-heal stale keys)
            if attempt == 0 and e.response is not None and e.response.status_code in (401, 403, 500):
                logger.warning(f"Storage PUT failed ({e.response.status_code}); refreshing storage key and retrying")
                continue
            logger.error(f"Storage PUT failed permanently: {e}")
            raise HTTPException(status_code=502, detail="Storage upload failed")
    raise HTTPException(status_code=502, detail="Storage upload failed")

def get_object(path: str) -> tuple:
    for attempt in range(2):
        key = init_storage(force=attempt > 0)
        if not key:
            raise HTTPException(status_code=503, detail="Storage unavailable")
        try:
            resp = requests.get(
                f"{STORAGE_URL}/objects/{path}",
                headers={"X-Storage-Key": key}, timeout=60
            )
            resp.raise_for_status()
            return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
        except requests.exceptions.HTTPError as e:
            if attempt == 0 and e.response is not None and e.response.status_code in (401, 403, 500):
                logger.warning(f"Storage GET failed ({e.response.status_code}); refreshing storage key and retrying")
                continue
            logger.error(f"Storage GET failed permanently: {e}")
            raise HTTPException(status_code=502, detail="Storage fetch failed")
    raise HTTPException(status_code=502, detail="Storage fetch failed")

# ============ Auth Utilities ============
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "iat": datetime.now(timezone.utc)
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

async def get_current_user(request: Request, creds: HTTPAuthorizationCredentials = Depends(security)):
    """Auth resolver: accepts either (a) Emergent Google session_token via cookie or Bearer,
    or (b) legacy JWT via Bearer. Session tokens are opaque; JWTs decode successfully."""
    # 1) Try session_token from cookie
    session_token = request.cookies.get("session_token")
    # 2) Or from Authorization: Bearer <token>
    bearer = creds.credentials if creds else None

    # Prefer session_token cookie first
    for token in filter(None, [session_token, bearer]):
        # Session lookup
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if session:
            exp = session.get("expires_at")
            if isinstance(exp, str):
                try: exp = datetime.fromisoformat(exp)
                except Exception: exp = None
            if exp:
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp < datetime.now(timezone.utc):
                    continue
            user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0, "password_hash": 0})
            if user:
                return user
        # JWT fallback
        try:
            payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except pyjwt.PyJWTError:
            continue
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if user:
            return user
    raise HTTPException(status_code=401, detail="Not authenticated")

def require_role(*roles: str):
    async def checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return checker

# ============ Models ============
class RegisterStudent(BaseModel):
    name: str
    email: EmailStr
    password: str
    school: Optional[str] = None

class RegisterNGO(BaseModel):
    email: EmailStr
    password: str
    org_name: str
    mission: str
    category_tags: List[str] = []
    ein: Optional[str] = ""
    location: str
    contact_name: str
    contact_phone: Optional[str] = None
    website: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class OpportunityCreate(BaseModel):
    title: str
    description: str
    cause: str
    location: Optional[str] = None
    address: Optional[str] = None
    room: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    is_remote: bool = False
    hours_estimate: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    slots: int = 10

class ApplicationCreate(BaseModel):
    opportunity_id: str
    message: Optional[str] = None

class HourLogCreate(BaseModel):
    opportunity_id: str
    hours: float
    date: str
    description: str

class ReviewCreate(BaseModel):
    opportunity_id: str
    rating: int
    comment: str
    hours_accurate: Optional[bool] = None

class StatsConfig(BaseModel):
    students_mode: Literal["live", "custom"] = "live"
    students_custom: int = 0
    nonprofits_mode: Literal["live", "custom"] = "live"
    nonprofits_custom: int = 0
    hours_mode: Literal["live", "custom"] = "live"
    hours_custom: int = 0

class NearbyConfig(BaseModel):
    radius_miles: int = 25

class StudentProfileUpdate(BaseModel):
    bio: Optional[str] = None
    interests: Optional[List[str]] = None
    availability: Optional[str] = None
    visibility: Optional[Literal["public", "ngos_only", "private"]] = None
    accent_color: Optional[str] = None
    avatar_file_id: Optional[str] = None
    cover_file_id: Optional[str] = None
    pinned_opportunity_id: Optional[str] = None

class StudentReviewCreate(BaseModel):
    rating: int
    comment: str

class MessageCreate(BaseModel):
    body: str

class ChangePassword(BaseModel):
    current_password: str
    new_password: str

class ReportCreate(BaseModel):
    conversation_id: str
    reason: Optional[str] = ""

def now_iso():
    return datetime.now(timezone.utc).isoformat()

# ============ Geo helpers ============
def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.8  # Earth radius in miles
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def _geocode_sync(query: str):
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1, "countrycodes": "us"},
            headers={"User-Agent": "CAWS-Volunteering/1.0 (contact: hello@caws.example)"},
            timeout=10
        )
        r.raise_for_status()
        data = r.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        logger.warning(f"Geocode failed for '{query}': {e}")
    return None

async def geocode_opportunity(opp_id: str, query: str):
    """Background: geocode address and store lat/lng on the opportunity."""
    coords = await asyncio.to_thread(_geocode_sync, query)
    if coords:
        await db.opportunities.update_one(
            {"id": opp_id},
            {"$set": {"lat": coords[0], "lng": coords[1]}}
        )
        logger.info(f"Geocoded opp {opp_id}: {coords}")

# ============ Auth Routes ============
def make_verify_token() -> str:
    return uuid.uuid4().hex + uuid.uuid4().hex  # 64-char opaque token

@api_router.post("/auth/register/student")
async def register_student(body: RegisterStudent):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    verify_token = make_verify_token()
    doc = {
        "id": user_id,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "role": "student",
        "name": body.name,
        "school": body.school,
        "email_verified": False,
        "verify_token": verify_token,
        "created_at": now_iso()
    }
    await db.users.insert_one(doc)
    asyncio.create_task(email_service.send_verification_email(doc["email"], body.name, verify_token))
    token = create_token(user_id, "student")
    return {"token": token, "user": {"id": user_id, "email": doc["email"], "role": "student", "name": body.name, "email_verified": False}}

@api_router.post("/auth/register/ngo")
async def register_ngo(body: RegisterNGO):
    if await db.users.find_one({"email": body.email.lower()}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    ngo_id = str(uuid.uuid4())
    verify_token = make_verify_token()
    user_doc = {
        "id": user_id,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "role": "ngo",
        "name": body.contact_name,
        "ngo_id": ngo_id,
        "email_verified": False,
        "verify_token": verify_token,
        "created_at": now_iso()
    }
    ngo_doc = {
        "id": ngo_id,
        "user_id": user_id,
        "org_name": body.org_name,
        "mission": body.mission,
        "category_tags": body.category_tags,
        "ein": body.ein,
        "location": body.location,
        "contact_name": body.contact_name,
        "contact_phone": body.contact_phone,
        "website": body.website,
        "status": "pending",
        "legitimacy_doc_path": None,
        "reliability_score": 100,
        "created_at": now_iso()
    }
    await db.users.insert_one(user_doc)
    await db.ngos.insert_one(ngo_doc)
    asyncio.create_task(email_service.send_verification_email(user_doc["email"], body.contact_name, verify_token))
    token = create_token(user_id, "ngo")
    return {"token": token, "user": {"id": user_id, "email": user_doc["email"], "role": "ngo", "name": body.contact_name, "ngo_id": ngo_id, "ngo_status": "pending", "email_verified": False}}

@api_router.post("/auth/verify-email")
async def verify_email(token: str = Query(...)):
    user = await db.users.find_one({"verify_token": token})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"email_verified": True}, "$unset": {"verify_token": ""}}
    )
    asyncio.create_task(email_service.send_welcome_email(user["email"], user.get("name") or ""))
    return {"ok": True, "email": user["email"]}

@api_router.post("/auth/resend-verification")
async def resend_verification(user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if full.get("email_verified"):
        return {"ok": True, "already_verified": True}
    verify_token = make_verify_token()
    await db.users.update_one({"id": user["id"]}, {"$set": {"verify_token": verify_token}})
    asyncio.create_task(email_service.send_verification_email(full["email"], full.get("name") or "", verify_token))
    return {"ok": True}

@api_router.get("/auth/my-verify-link")
async def my_verify_link(user: dict = Depends(get_current_user)):
    """Return the verification link for the current user. Useful when email delivery is
    blocked (e.g., Resend sandbox to unverified recipients). Authenticated-only."""
    full = await db.users.find_one({"id": user["id"]})
    if full.get("email_verified"):
        return {"already_verified": True}
    token = full.get("verify_token")
    if not token:
        token = make_verify_token()
        await db.users.update_one({"id": user["id"]}, {"$set": {"verify_token": token}})
    base = os.environ.get("APP_PUBLIC_URL", "").rstrip("/")
    return {"verify_url": f"{base}/verify-email?token={token}", "email": full["email"]}

# ============ Google Auth (Emergent-managed) ============
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

class GoogleSessionRequest(BaseModel):
    session_id: str

@api_router.post("/auth/google-session")
async def google_session(body: GoogleSessionRequest, response: Response):
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    try:
        r = requests.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id}, timeout=10)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.error(f"Emergent session exchange failed: {e}")
        raise HTTPException(status_code=401, detail="Google authentication failed")

    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=400, detail="No email returned from Google")

    # Upsert user
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["id"]
        # Attach google data if missing; never downgrade role
        set_fields = {"picture": data.get("picture"), "email_verified": True}
        if not existing.get("auth_provider"):
            set_fields["auth_provider"] = "google"
        if not existing.get("name") and data.get("name"):
            set_fields["name"] = data["name"]
        await db.users.update_one({"id": user_id}, {"$set": set_fields})
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    else:
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "role": "student",  # Google signups default to student; NGO signup remains form-based
            "auth_provider": "google",
            "email_verified": True,
            "created_at": now_iso(),
        }
        await db.users.insert_one(user)
        asyncio.create_task(email_service.send_welcome_email(email, user["name"]))

    # Store session_token from Emergent (7-day session)
    session_token = data.get("session_token")
    if not session_token:
        raise HTTPException(status_code=500, detail="No session token from provider")
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": now_iso(),
    })

    # Set httpOnly cookie
    response.set_cookie(
        key="session_token", value=session_token,
        max_age=7 * 24 * 60 * 60, path="/",
        httponly=True, secure=True, samesite="none",
    )

    payload = {"id": user_id, "email": email, "role": user["role"],
               "name": user.get("name"), "picture": user.get("picture"),
               "email_verified": True, "auth_provider": "google"}
    if user["role"] == "ngo":
        ngo = await db.ngos.find_one({"id": user.get("ngo_id")}, {"_id": 0})
        payload["ngo_id"] = user.get("ngo_id")
        payload["ngo_status"] = ngo["status"] if ngo else "pending"
    return {"user": payload}

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}

@api_router.post("/auth/login")
async def login(body: LoginRequest):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["role"])
    payload = {"id": user["id"], "email": user["email"], "role": user["role"], "name": user.get("name")}
    if user["role"] == "ngo":
        ngo = await db.ngos.find_one({"id": user["ngo_id"]}, {"_id": 0})
        payload["ngo_id"] = user["ngo_id"]
        payload["ngo_status"] = ngo["status"] if ngo else "pending"
    return {"token": token, "user": payload}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    payload = {"id": user["id"], "email": user["email"], "role": user["role"], "name": user.get("name"),
               "picture": user.get("picture"), "auth_provider": user.get("auth_provider", "password"),
               "email_verified": bool(user.get("email_verified", False))}
    if user["role"] == "ngo":
        ngo = await db.ngos.find_one({"id": user["ngo_id"]}, {"_id": 0})
        payload["ngo_id"] = user["ngo_id"]
        payload["ngo_status"] = ngo["status"] if ngo else "pending"
    return payload

# ============ File Upload ============
@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    if ext not in ["pdf", "png", "jpg", "jpeg", "webp"]:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")
    result = put_object(path, data, file.content_type or "application/octet-stream")
    file_id = str(uuid.uuid4())
    await db.files.insert_one({
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result.get("size", len(data)),
        "user_id": user["id"],
        "is_deleted": False,
        "created_at": now_iso()
    })
    return {"file_id": file_id, "path": result["path"]}

@api_router.get("/files/{file_id}")
async def download_file(file_id: str, auth: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    # Auth via header or query
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, ct = get_object(record["storage_path"])
    return Response(content=data, media_type=record.get("content_type") or ct)

# ============ NGO Routes ============
@api_router.post("/ngo/upload-legitimacy")
async def upload_ngo_doc(file: UploadFile = File(...), user: dict = Depends(require_role("ngo"))):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    if ext not in ["pdf", "png", "jpg", "jpeg"]:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    path = f"{APP_NAME}/ngo-docs/{user['ngo_id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")
    result = put_object(path, data, file.content_type or "application/octet-stream")
    file_id = str(uuid.uuid4())
    await db.files.insert_one({
        "id": file_id, "storage_path": result["path"], "original_filename": file.filename,
        "content_type": file.content_type, "user_id": user["id"], "is_deleted": False, "created_at": now_iso()
    })
    await db.ngos.update_one({"id": user["ngo_id"]}, {"$set": {"legitimacy_doc_id": file_id}})
    return {"file_id": file_id}

@api_router.get("/ngo/me")
async def ngo_me(user: dict = Depends(require_role("ngo"))):
    ngo = await db.ngos.find_one({"id": user["ngo_id"]}, {"_id": 0})
    return ngo

@api_router.get("/ngos/{ngo_id}")
async def get_ngo(ngo_id: str):
    ngo = await db.ngos.find_one({"id": ngo_id, "status": "approved"}, {"_id": 0})
    if not ngo:
        raise HTTPException(status_code=404, detail="NGO not found")
    return ngo

# ============ Opportunities ============
def build_location_str(o: dict) -> str:
    """Compose a human display string from structured parts."""
    parts = []
    if o.get("address"):
        parts.append(o["address"] + (f", {o['room']}" if o.get("room") else ""))
    if o.get("city") and o.get("state"):
        parts.append(f"{o['city']}, {o['state']}")
    elif o.get("state"):
        parts.append(o["state"])
    if o.get("zip_code"):
        parts.append(o["zip_code"])
    return " · ".join(parts) if parts else (o.get("location") or "")

@api_router.post("/opportunities")
async def create_opportunity(body: OpportunityCreate, user: dict = Depends(require_role("ngo"))):
    ngo = await db.ngos.find_one({"id": user["ngo_id"]})
    if not ngo or ngo["status"] != "approved":
        raise HTTPException(status_code=403, detail="NGO not approved yet")
    opp_id = str(uuid.uuid4())
    payload = body.model_dump()
    # Derive display location if structured parts provided
    display = build_location_str(payload)
    if display:
        payload["location"] = display
    elif not payload.get("location"):
        payload["location"] = "Remote" if payload.get("is_remote") else ""
    doc = {
        "id": opp_id,
        "ngo_id": user["ngo_id"],
        "ngo_name": ngo["org_name"],
        **payload,
        "status": "open",
        "created_at": now_iso()
    }
    await db.opportunities.insert_one(doc)
    # Fire-and-forget geocoding for physical opportunities
    if not payload.get("is_remote"):
        query_parts = [payload.get("address") or "", payload.get("city") or "",
                       payload.get("state") or "", payload.get("zip_code") or ""]
        query = ", ".join([p for p in query_parts if p]).strip(", ")
        if query:
            asyncio.create_task(geocode_opportunity(opp_id, query))
    doc.pop("_id", None)
    return doc

@api_router.get("/opportunities")
async def list_opportunities(cause: Optional[str] = None, location: Optional[str] = None,
                             state: Optional[str] = None,
                             remote: Optional[bool] = None, max_hours: Optional[int] = None,
                             ngo_id: Optional[str] = None,
                             near_lat: Optional[float] = None, near_lng: Optional[float] = None,
                             nearby_only: bool = False):
    q = {"status": "open"}
    if cause: q["cause"] = cause
    if state: q["state"] = state
    if location: q["location"] = {"$regex": location, "$options": "i"}
    if remote is not None: q["is_remote"] = remote
    if max_hours: q["hours_estimate"] = {"$lte": max_hours}
    if ngo_id: q["ngo_id"] = ngo_id
    items = await db.opportunities.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

    # Attach distance and optionally filter/sort by nearness
    if near_lat is not None and near_lng is not None:
        cfg = await db.config.find_one({"id": "nearby"}, {"_id": 0}) or {}
        radius = int(cfg.get("radius_miles", 25))
        annotated = []
        for o in items:
            if o.get("lat") is not None and o.get("lng") is not None:
                d = round(haversine_miles(near_lat, near_lng, o["lat"], o["lng"]), 1)
                o["distance_miles"] = d
            annotated.append(o)
        if nearby_only:
            annotated = [o for o in annotated if o.get("is_remote") or (o.get("distance_miles") is not None and o["distance_miles"] <= radius)]
        # Sort: remote first? No — sort by distance ascending, unknown/remote last
        annotated.sort(key=lambda o: o.get("distance_miles") if o.get("distance_miles") is not None else 999999)
        return annotated
    return items

@api_router.get("/opportunities/{opp_id}")
async def get_opportunity(opp_id: str):
    opp = await db.opportunities.find_one({"id": opp_id}, {"_id": 0})
    if not opp:
        raise HTTPException(status_code=404, detail="Not found")
    return opp

@api_router.get("/ngo/opportunities")
async def my_opportunities(user: dict = Depends(require_role("ngo"))):
    items = await db.opportunities.find({"ngo_id": user["ngo_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.delete("/opportunities/{opp_id}")
async def delete_opportunity(opp_id: str, user: dict = Depends(require_role("ngo"))):
    opp = await db.opportunities.find_one({"id": opp_id})
    if not opp or opp["ngo_id"] != user["ngo_id"]:
        raise HTTPException(status_code=404, detail="Not found")
    await db.opportunities.update_one({"id": opp_id}, {"$set": {"status": "closed"}})
    return {"ok": True}

# ============ Applications ============
@api_router.post("/applications")
async def apply(body: ApplicationCreate, user: dict = Depends(require_role("student"))):
    opp = await db.opportunities.find_one({"id": body.opportunity_id})
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    existing = await db.applications.find_one({"opportunity_id": body.opportunity_id, "student_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400, detail="Already applied")
    app_id = str(uuid.uuid4())
    doc = {
        "id": app_id, "opportunity_id": body.opportunity_id, "opportunity_title": opp["title"],
        "student_id": user["id"], "student_name": user.get("name"), "student_email": user["email"],
        "ngo_id": opp["ngo_id"], "message": body.message, "status": "pending",
        "created_at": now_iso()
    }
    await db.applications.insert_one(doc)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "message": f"Application submitted for {opp['title']}",
        "read": False, "created_at": now_iso()
    })
    doc.pop("_id", None)
    return doc

@api_router.get("/applications/mine")
async def my_applications(user: dict = Depends(require_role("student"))):
    items = await db.applications.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/applications/ngo")
async def ngo_applications(user: dict = Depends(require_role("ngo"))):
    items = await db.applications.find({"ngo_id": user["ngo_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.patch("/applications/{app_id}/status")
async def update_application_status(app_id: str, status_val: str = Query(...), user: dict = Depends(require_role("ngo"))):
    if status_val not in ["accepted", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    appl = await db.applications.find_one({"id": app_id})
    if not appl or appl["ngo_id"] != user["ngo_id"]:
        raise HTTPException(status_code=404, detail="Not found")
    await db.applications.update_one({"id": app_id}, {"$set": {"status": status_val, "updated_at": now_iso()}})
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": appl["student_id"],
        "message": f"Your application for {appl['opportunity_title']} was {status_val}",
        "read": False, "created_at": now_iso()
    })
    # Email notification
    opp = await db.opportunities.find_one({"id": appl["opportunity_id"]}, {"_id": 0})
    ngo_name = opp["ngo_name"] if opp else ""
    asyncio.create_task(email_service.send_application_status_email(
        appl["student_email"], appl.get("student_name") or "", appl["opportunity_title"], status_val, ngo_name
    ))
    # Reliability score bump
    await update_reliability(appl["ngo_id"])
    return {"ok": True}

# ============ Hours ============
@api_router.post("/hours")
async def log_hours(body: HourLogCreate, user: dict = Depends(require_role("student"))):
    opp = await db.opportunities.find_one({"id": body.opportunity_id})
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    appl = await db.applications.find_one({"opportunity_id": body.opportunity_id, "student_id": user["id"], "status": "accepted"})
    if not appl:
        raise HTTPException(status_code=400, detail="No accepted application for this opportunity")
    # Only one hour log per (student, opportunity)
    existing = await db.hours.find_one({"opportunity_id": body.opportunity_id, "student_id": user["id"]})
    if existing:
        raise HTTPException(status_code=400,
                            detail="You've already submitted hours for this opportunity")
    # Cap at the NGO's declared max for the opportunity
    max_h = opp.get("hours_estimate")
    if max_h is not None and body.hours > float(max_h):
        raise HTTPException(status_code=400,
                            detail=f"Requested hours exceed the maximum of {max_h} set by the nonprofit")
    if body.hours <= 0:
        raise HTTPException(status_code=400, detail="Hours must be greater than zero")
    log_id = str(uuid.uuid4())
    doc = {
        "id": log_id, "opportunity_id": body.opportunity_id, "opportunity_title": opp["title"],
        "ngo_id": opp["ngo_id"], "ngo_name": opp["ngo_name"],
        "student_id": user["id"], "student_name": user.get("name"),
        "hours": body.hours, "date": body.date, "description": body.description,
        "max_hours": float(max_h) if max_h is not None else None,
        "status": "pending", "created_at": now_iso()
    }
    await db.hours.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/hours/mine")
async def my_hours(user: dict = Depends(require_role("student"))):
    items = await db.hours.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/hours/ngo")
async def ngo_hours(user: dict = Depends(require_role("ngo"))):
    items = await db.hours.find({"ngo_id": user["ngo_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.patch("/hours/{log_id}/verify")
async def verify_hours(log_id: str, user: dict = Depends(require_role("ngo"))):
    log = await db.hours.find_one({"id": log_id})
    if not log or log["ngo_id"] != user["ngo_id"]:
        raise HTTPException(status_code=404, detail="Not found")
    if log["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")
    await db.hours.update_one({"id": log_id}, {"$set": {"status": "verified", "verified_at": now_iso()}})
    # Create certificate
    cert_id = str(uuid.uuid4())
    await db.certificates.insert_one({
        "id": cert_id, "hour_log_id": log_id, "student_id": log["student_id"], "student_name": log["student_name"],
        "opportunity_title": log["opportunity_title"], "ngo_name": log["ngo_name"], "hours": log["hours"],
        "date": log["date"], "issued_at": now_iso()
    })
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": log["student_id"],
        "message": f"{log['hours']} hours verified for {log['opportunity_title']}. Certificate ready!",
        "read": False, "created_at": now_iso()
    })
    # Ask the student for a review of the nonprofit (skip if already reviewed)
    already_reviewed = await db.reviews.find_one({
        "opportunity_id": log["opportunity_id"], "student_id": log["student_id"]
    })
    if not already_reviewed:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": log["student_id"],
            "message": f"How was your experience with {log['ngo_name']}? Leave a quick review.",
            "type": "review_request",
            "opportunity_id": log["opportunity_id"],
            "opportunity_title": log["opportunity_title"],
            "ngo_name": log["ngo_name"],
            "hours": log["hours"],
            "read": False,
            "created_at": now_iso()
        })
    # Email
    student = await db.users.find_one({"id": log["student_id"]}, {"_id": 0})
    if student:
        asyncio.create_task(email_service.send_hours_verified_email(
            student["email"], student.get("name") or "", log["opportunity_title"], log["hours"], log["ngo_name"]
        ))
    await update_reliability(user["ngo_id"])
    return {"ok": True, "certificate_id": cert_id}

@api_router.patch("/hours/{log_id}/reject")
async def reject_hours(log_id: str, user: dict = Depends(require_role("ngo"))):
    log = await db.hours.find_one({"id": log_id})
    if not log or log["ngo_id"] != user["ngo_id"]:
        raise HTTPException(status_code=404, detail="Not found")
    await db.hours.update_one({"id": log_id}, {"$set": {"status": "rejected", "verified_at": now_iso()}})
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": log["student_id"],
        "message": f"Hours for {log['opportunity_title']} were not approved",
        "read": False, "created_at": now_iso()
    })
    return {"ok": True}

# ============ Certificates ============
@api_router.get("/certificates/mine")
async def my_certs(user: dict = Depends(require_role("student"))):
    items = await db.certificates.find({"student_id": user["id"]}, {"_id": 0}).sort("issued_at", -1).to_list(200)
    return items

def generate_cert_pdf(cert: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    w, h = letter
    NAVY = HexColor("#0B1D36")
    TEAL = HexColor("#008080")
    GOLD = HexColor("#D4AF37")
    GRAY = HexColor("#5A5A5A")
    # Border
    c.setStrokeColor(NAVY); c.setLineWidth(3)
    c.rect(0.5*inch, 0.5*inch, w-1*inch, h-1*inch)
    c.setStrokeColor(GOLD); c.setLineWidth(1)
    c.rect(0.7*inch, 0.7*inch, w-1.4*inch, h-1.4*inch)
    # Title
    c.setFont("Times-Italic", 18); c.setFillColor(GOLD)
    c.drawCentredString(w/2, h-1.4*inch, "Community Action With Students")
    c.setFont("Times-Bold", 34); c.setFillColor(NAVY)
    c.drawCentredString(w/2, h-2.2*inch, "Certificate of Service")
    c.setFont("Helvetica", 12); c.setFillColor(GRAY)
    c.drawCentredString(w/2, h-2.6*inch, "This certificate is proudly presented to")
    c.setFont("Times-Bold", 26); c.setFillColor(NAVY)
    c.drawCentredString(w/2, h-3.2*inch, cert["student_name"] or "Volunteer")
    c.setFont("Helvetica", 12); c.setFillColor(GRAY)
    txt = f"for volunteering {cert['hours']} hour(s) on"
    c.drawCentredString(w/2, h-3.7*inch, txt)
    c.setFont("Times-Italic", 16); c.setFillColor(TEAL)
    c.drawCentredString(w/2, h-4.1*inch, f"\"{cert['opportunity_title']}\"")
    c.setFont("Helvetica", 12); c.setFillColor(GRAY)
    c.drawCentredString(w/2, h-4.5*inch, f"with {cert['ngo_name']}")
    c.drawCentredString(w/2, h-4.9*inch, f"Service date: {cert['date']}")
    # Footer
    c.setFont("Helvetica", 10); c.setFillColor(GRAY)
    c.drawCentredString(w/2, 1.2*inch, f"Certificate ID: {cert['id']}")
    c.drawCentredString(w/2, 1.0*inch, f"Issued: {cert['issued_at'][:10]}")
    c.setFont("Times-Italic", 11); c.setFillColor(NAVY)
    c.drawCentredString(w/2, 0.85*inch, "— CAWS Verified Service Record —")
    c.save()
    return buf.getvalue()

@api_router.get("/certificates/{cert_id}/download")
async def download_cert(cert_id: str, auth: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    cert = await db.certificates.find_one({"id": cert_id}, {"_id": 0})
    if not cert or cert["student_id"] != payload["sub"]:
        raise HTTPException(status_code=404, detail="Not found")
    pdf = generate_cert_pdf(cert)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="caws-certificate-{cert_id[:8]}.pdf"'})

# ============ Reviews ============
@api_router.post("/reviews")
async def create_review(body: ReviewCreate, user: dict = Depends(require_role("student"))):
    opp = await db.opportunities.find_one({"id": body.opportunity_id})
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    if not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    doc = {
        "id": str(uuid.uuid4()), "opportunity_id": body.opportunity_id, "opportunity_title": opp["title"],
        "ngo_id": opp["ngo_id"], "student_id": user["id"], "student_name": user.get("name"),
        "rating": body.rating, "comment": body.comment,
        "hours_accurate": body.hours_accurate,
        "created_at": now_iso()
    }
    await db.reviews.insert_one(doc)
    # Mark any pending review-request notification for this opp as read
    await db.notifications.update_many(
        {"user_id": user["id"], "type": "review_request", "opportunity_id": body.opportunity_id},
        {"$set": {"read": True}}
    )
    await update_reliability(opp["ngo_id"])
    doc.pop("_id", None)
    return doc

@api_router.get("/reviews/ngo/{ngo_id}")
async def ngo_reviews(ngo_id: str):
    items = await db.reviews.find({"ngo_id": ngo_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return items

@api_router.get("/reviews/mine")
async def my_reviews(user: dict = Depends(require_role("student"))):
    items = await db.reviews.find({"student_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

class NGOUpdate(BaseModel):
    org_name: Optional[str] = None
    mission: Optional[str] = None
    category_tags: Optional[List[str]] = None
    location: Optional[str] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None

@api_router.patch("/ngo/me")
async def update_ngo(body: NGOUpdate, user: dict = Depends(require_role("ngo"))):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.ngos.update_one({"id": user["ngo_id"]}, {"$set": update})
    ngo = await db.ngos.find_one({"id": user["ngo_id"]}, {"_id": 0})
    return ngo

# ============ Notifications ============
@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items

@api_router.patch("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": notif_id, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}

# ============ Reliability ============
async def update_reliability(ngo_id: str):
    total_apps = await db.applications.count_documents({"ngo_id": ngo_id})
    processed_apps = await db.applications.count_documents({"ngo_id": ngo_id, "status": {"$in": ["accepted", "rejected"]}})
    total_hours = await db.hours.count_documents({"ngo_id": ngo_id})
    verified_hours = await db.hours.count_documents({"ngo_id": ngo_id, "status": "verified"})
    reviews = await db.reviews.find({"ngo_id": ngo_id}).to_list(500)
    responsiveness = (processed_apps / total_apps) if total_apps else 1.0
    verification_rate = (verified_hours / total_hours) if total_hours else 1.0
    avg_review = (sum(r["rating"] for r in reviews) / len(reviews) / 5) if reviews else 1.0
    score = int((responsiveness * 0.35 + verification_rate * 0.35 + avg_review * 0.30) * 100)
    await db.ngos.update_one({"id": ngo_id}, {"$set": {"reliability_score": score}})

# ============ Admin ============
@api_router.get("/admin/ngos/pending")
async def pending_ngos(user: dict = Depends(require_role("admin"))):
    items = await db.ngos.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items

@api_router.get("/admin/ngos")
async def all_ngos(user: dict = Depends(require_role("admin"))):
    items = await db.ngos.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items

@api_router.patch("/admin/ngos/{ngo_id}/approve")
async def approve_ngo(ngo_id: str, user: dict = Depends(require_role("admin"))):
    ngo = await db.ngos.find_one({"id": ngo_id})
    if not ngo:
        raise HTTPException(status_code=404, detail="NGO not found")
    await db.ngos.update_one({"id": ngo_id}, {"$set": {"status": "approved"}})
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": ngo["user_id"],
        "message": f"{ngo['org_name']} has been approved. You can now post opportunities!",
        "read": False, "created_at": now_iso()
    })
    ngo_user = await db.users.find_one({"id": ngo["user_id"]}, {"_id": 0})
    if ngo_user:
        asyncio.create_task(email_service.send_ngo_status_email(ngo_user["email"], ngo["org_name"], True))
    return {"ok": True}

@api_router.patch("/admin/ngos/{ngo_id}/reject")
async def reject_ngo(ngo_id: str, user: dict = Depends(require_role("admin"))):
    ngo = await db.ngos.find_one({"id": ngo_id})
    if not ngo:
        raise HTTPException(status_code=404, detail="NGO not found")
    await db.ngos.update_one({"id": ngo_id}, {"$set": {"status": "rejected"}})
    ngo_user = await db.users.find_one({"id": ngo["user_id"]}, {"_id": 0})
    if ngo_user:
        asyncio.create_task(email_service.send_ngo_status_email(ngo_user["email"], ngo["org_name"], False))
    return {"ok": True}

@api_router.get("/admin/stats-config")
async def get_stats_config(user: dict = Depends(require_role("admin"))):
    cfg = await db.config.find_one({"id": "stats"}, {"_id": 0})
    if not cfg:
        cfg = {"id": "stats", **StatsConfig().model_dump()}
        await db.config.insert_one(cfg)
        cfg.pop("_id", None)
    return cfg

@api_router.put("/admin/stats-config")
async def set_stats_config(body: StatsConfig, user: dict = Depends(require_role("admin"))):
    doc = {"id": "stats", **body.model_dump()}
    await db.config.update_one({"id": "stats"}, {"$set": doc}, upsert=True)
    return doc

@api_router.get("/admin/nearby-config")
async def get_nearby_config(user: dict = Depends(require_role("admin"))):
    cfg = await db.config.find_one({"id": "nearby"}, {"_id": 0})
    if not cfg:
        cfg = {"id": "nearby", **NearbyConfig().model_dump()}
        await db.config.insert_one(dict(cfg))
    return cfg

@api_router.put("/admin/nearby-config")
async def set_nearby_config(body: NearbyConfig, user: dict = Depends(require_role("admin"))):
    doc = {"id": "nearby", **body.model_dump()}
    await db.config.update_one({"id": "nearby"}, {"$set": doc}, upsert=True)
    return doc

@api_router.get("/config/nearby")
async def public_nearby_config():
    cfg = await db.config.find_one({"id": "nearby"}, {"_id": 0})
    return cfg or {"radius_miles": 25}

@api_router.get("/admin/users")
async def all_users(user: dict = Depends(require_role("admin"))):
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return items

# ============ Public Stats & Landing ============
@api_router.get("/stats/public")
async def public_stats():
    cfg = await db.config.find_one({"id": "stats"}, {"_id": 0})
    if not cfg:
        cfg = {"id": "stats", **StatsConfig().model_dump()}
        await db.config.insert_one(cfg)
    live_students = await db.users.count_documents({"role": "student"})
    live_ngos = await db.ngos.count_documents({"status": "approved"})
    hrs_docs = await db.hours.find({"status": "verified"}, {"hours": 1, "_id": 0}).to_list(10000)
    live_hours = int(sum(h.get("hours", 0) for h in hrs_docs))
    return {
        "students": cfg["students_custom"] if cfg["students_mode"] == "custom" else live_students,
        "nonprofits": cfg["nonprofits_custom"] if cfg["nonprofits_mode"] == "custom" else live_ngos,
        "hours": cfg["hours_custom"] if cfg["hours_mode"] == "custom" else live_hours,
    }

@api_router.get("/ngos/approved/list")
async def approved_ngos():
    items = await db.ngos.find({"status": "approved"}, {"_id": 0, "ein": 0}).sort("reliability_score", -1).to_list(200)
    return items

# ============ Global Search ============
import re as _re

@api_router.get("/search")
async def global_search(
    q: str = Query("", min_length=0, max_length=100),
    type: Optional[str] = Query(None, regex="^(nonprofits|profiles|opportunities|all)$"),
    limit: int = Query(8, ge=1, le=25),
):
    """
    Global search across nonprofits (approved NGOs), public volunteer profiles,
    and open opportunities. Returns a unified response grouped by type.
    Case-insensitive substring match on key fields.
    """
    query = (q or "").strip()
    if not query:
        return {"query": "", "nonprofits": [], "profiles": [], "opportunities": []}

    kind = (type or "all").lower()
    # Escape regex specials so a user typing "c++" or "." doesn't blow up
    safe = _re.escape(query)
    rx = {"$regex": safe, "$options": "i"}

    nonprofits: List[dict] = []
    profiles: List[dict] = []
    opportunities: List[dict] = []

    if kind in ("nonprofits", "all"):
        cursor = db.ngos.find(
            {
                "status": "approved",
                "$or": [
                    {"org_name": rx},
                    {"mission": rx},
                    {"category_tags": rx},
                    {"location": rx},
                ],
            },
            {"_id": 0, "ein": 0},
        ).sort("reliability_score", -1).limit(limit)
        async for n in cursor:
            nonprofits.append({
                "id": n.get("id"),
                "name": n.get("org_name") or n.get("name"),
                "subtitle": n.get("location") or "",
                "description": (n.get("mission") or "")[:140],
                "logo_file_id": n.get("logo_file_id"),
                "reliability_score": n.get("reliability_score"),
                "category_tags": n.get("category_tags") or [],
                "url": f"/ngos/{n.get('id')}",
            })

    if kind in ("profiles", "all"):
        # Only publicly visible student profiles
        cursor = db.users.find(
            {
                "role": "student",
                "$and": [
                    {"$or": [{"visibility": "public"}, {"visibility": {"$exists": False}}]},
                    {"$or": [
                        {"name": rx},
                        {"school": rx},
                        {"bio": rx},
                        {"interests": rx},
                    ]},
                ],
            },
            {"_id": 0, "password_hash": 0, "email": 0, "verify_token": 0},
        ).limit(limit)
        async for s in cursor:
            profiles.append({
                "id": s.get("id"),
                "name": s.get("name") or "Volunteer",
                "subtitle": s.get("school") or "",
                "description": (s.get("bio") or "")[:140],
                "avatar_file_id": s.get("avatar_file_id"),
                "interests": s.get("interests") or [],
                "url": f"/students/{s.get('id')}",
            })

    if kind in ("opportunities", "all"):
        cursor = db.opportunities.find(
            {
                "status": "open",
                "$or": [
                    {"title": rx},
                    {"description": rx},
                    {"cause": rx},
                    {"location": rx},
                    {"ngo_name": rx},
                ],
            },
            {"_id": 0},
        ).sort("created_at", -1).limit(limit)
        async for o in cursor:
            opportunities.append({
                "id": o.get("id"),
                "name": o.get("title"),
                "subtitle": o.get("ngo_name") or o.get("location") or "",
                "description": (o.get("description") or "")[:140],
                "cause": o.get("cause"),
                "location": o.get("location"),
                "is_remote": o.get("is_remote", False),
                "hours_estimate": o.get("hours_estimate"),
                "url": f"/opportunities/{o.get('id')}",
            })

    return {
        "query": query,
        "nonprofits": nonprofits,
        "profiles": profiles,
        "opportunities": opportunities,
        "total": len(nonprofits) + len(profiles) + len(opportunities),
    }

# ============ Logo ============
@api_router.get("/branding/logo")
async def get_logo():
    doc = await db.branding.find_one({"id": "logo"}, {"_id": 0})
    if not doc:
        return {"data": None}
    return {"data": doc.get("data_b64")}

@api_router.post("/branding/generate-logo")
async def generate_logo(user: dict = Depends(require_role("admin"))):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(api_key=EMERGENT_KEY, session_id=f"caws-logo-{uuid.uuid4()}",
                       system_message="You are a professional logo designer.")
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
        prompt = ("Design a minimalist circular crest logo for 'CAWS - Community Action With Students'. "
                  "Represent unity and community action: interlocked hands or figures forming a circle, "
                  "flat vector style, navy blue (#0B1D36) and gold (#D4AF37) accents on a warm off-white background. "
                  "Clean, professional, academic feel. Round emblem, no text.")
        msg = UserMessage(text=prompt)
        text, images = await chat.send_message_multimodal_response(msg)
        if not images:
            raise HTTPException(status_code=500, detail="No image generated")
        img_b64 = images[0]["data"]
        await db.branding.update_one(
            {"id": "logo"},
            {"$set": {"id": "logo", "data_b64": img_b64, "generated_at": now_iso()}},
            upsert=True
        )
        return {"ok": True}
    except Exception as e:
        logger.error(f"Logo generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ Student Public Profile ============
TIER_BADGES = [
    {"id": "bronze",   "label": "Bronze Volunteer",   "threshold": 1,   "color": "#B87333", "description": "Completed your first verified hour"},
    {"id": "silver",   "label": "Silver Volunteer",   "threshold": 25,  "color": "#A8A9AD", "description": "25+ verified volunteer hours"},
    {"id": "gold",     "label": "Gold Volunteer",     "threshold": 100, "color": "#D4AF37", "description": "100+ verified volunteer hours"},
    {"id": "platinum", "label": "Platinum Volunteer", "threshold": 250, "color": "#0B1D36", "description": "250+ verified volunteer hours"},
    {"id": "diamond",  "label": "Diamond Volunteer",  "threshold": 500, "color": "#4FB6A3", "description": "500+ verified volunteer hours"},
]

CATEGORY_BADGES = {
    "Environment":              {"id": "cat_environment", "label": "Earth Steward",     "icon": "tree"},
    "Animal Welfare":           {"id": "cat_animals",     "label": "Animal Ally",       "icon": "paw"},
    "Health & Wellness":        {"id": "cat_health",      "label": "Health Helper",     "icon": "heart"},
    "Education":                {"id": "cat_education",   "label": "Knowledge Sharer",  "icon": "book"},
    "Community Development":    {"id": "cat_community",   "label": "Community Builder", "icon": "home"},
    "Elderly Care":             {"id": "cat_elderly",     "label": "Elder Companion",   "icon": "users"},
    "Disaster Relief":          {"id": "cat_disaster",    "label": "First Responder",   "icon": "shield"},
    "Arts & Culture":           {"id": "cat_arts",        "label": "Culture Keeper",    "icon": "palette"},
}

async def compute_student_stats(student_id: str) -> dict:
    hours = await db.hours.find({"student_id": student_id, "status": "verified"}, {"_id": 0}).to_list(2000)
    total_hours = sum(h.get("hours", 0) for h in hours)
    # Category breakdown
    opp_ids = list({h["opportunity_id"] for h in hours})
    opps_map = {}
    if opp_ids:
        async for o in db.opportunities.find({"id": {"$in": opp_ids}}, {"_id": 0, "id": 1, "cause": 1}):
            opps_map[o["id"]] = o.get("cause") or "Other"
    breakdown = {}
    ngo_ids_set = set()
    months_set = set()
    category_first_earned = {}
    for h in hours:
        cause = opps_map.get(h["opportunity_id"], "Other")
        breakdown[cause] = breakdown.get(cause, 0) + h["hours"]
        ngo_ids_set.add(h.get("ngo_id"))
        try:
            m = (h.get("verified_at") or h.get("created_at") or "")[:7]
            if m: months_set.add(m)
        except Exception: pass
        earned = h.get("verified_at") or h.get("created_at")
        if cause not in category_first_earned or (earned and earned < category_first_earned[cause]):
            category_first_earned[cause] = earned
    # Badges
    tier_badges = []
    for t in TIER_BADGES:
        if total_hours >= t["threshold"]:
            tier_badges.append({**t})
    category_badges = []
    for cause, first_ts in category_first_earned.items():
        meta = CATEGORY_BADGES.get(cause)
        if meta:
            category_badges.append({**meta, "cause": cause, "earned_at": first_ts, "hours": round(breakdown[cause], 1)})
    # Public reviews received (from NGOs)
    student_reviews = await db.student_reviews.find({"student_id": student_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {
        "total_hours": round(total_hours, 1),
        "hours_by_category": {k: round(v, 1) for k, v in breakdown.items()},
        "months_active": len(months_set),
        "ngo_count": len([x for x in ngo_ids_set if x]),
        "opportunity_count": len(opp_ids),
        "tier_badges": tier_badges,
        "category_badges": sorted(category_badges, key=lambda b: b.get("earned_at") or ""),
        "public_reviews": student_reviews,
    }

@api_router.get("/students/{student_id}")
async def get_student_profile(student_id: str, viewer: Optional[dict] = None):
    """Public student profile. Respects visibility setting."""
    # Get viewer (optional auth)
    creds_header = None
    student = await db.users.find_one({"id": student_id, "role": "student"}, {"_id": 0, "password_hash": 0, "verify_token": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    visibility = student.get("visibility") or "public"
    if visibility == "private":
        raise HTTPException(status_code=403, detail="This profile is private")
    stats = await compute_student_stats(student_id)
    # Pinned opportunity (must be verified/completed)
    pinned = None
    pid = student.get("pinned_opportunity_id")
    if pid:
        opp = await db.opportunities.find_one({"id": pid}, {"_id": 0})
        # Only show if the student actually has verified hours with it
        if opp and any(h for h in await db.hours.find({"student_id": student_id, "opportunity_id": pid, "status": "verified"}).to_list(1)):
            pinned = opp
    return {
        "id": student["id"],
        "name": student.get("name"),
        "school": student.get("school"),
        "bio": student.get("bio"),
        "interests": student.get("interests") or [],
        "availability": student.get("availability"),
        "visibility": visibility,
        "accent_color": student.get("accent_color") or "#008080",
        "avatar_file_id": student.get("avatar_file_id"),
        "cover_file_id": student.get("cover_file_id"),
        "pinned_opportunity": pinned,
        "created_at": student.get("created_at"),
        **stats,
    }

@api_router.patch("/students/me")
async def update_student_profile(body: StudentProfileUpdate, user: dict = Depends(require_role("student"))):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Validate pinned opp is one the student has verified hours with
    if "pinned_opportunity_id" in update and update["pinned_opportunity_id"]:
        has_verified = await db.hours.find_one({
            "student_id": user["id"], "opportunity_id": update["pinned_opportunity_id"], "status": "verified"
        })
        if not has_verified:
            raise HTTPException(status_code=400, detail="Can only pin an opportunity you've completed")
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    return {"ok": True}

@api_router.get("/students/me/completed")
async def my_completed_opportunities(user: dict = Depends(require_role("student"))):
    """List of opportunities the student has verified hours with — used for pinning."""
    hours = await db.hours.find({"student_id": user["id"], "status": "verified"}, {"_id": 0}).to_list(500)
    opp_ids = list({h["opportunity_id"] for h in hours})
    if not opp_ids: return []
    opps = await db.opportunities.find({"id": {"$in": opp_ids}}, {"_id": 0}).to_list(500)
    return opps

# NGO → student public review
@api_router.post("/students/{student_id}/review")
async def review_student(student_id: str, body: StudentReviewCreate, user: dict = Depends(require_role("ngo"))):
    if not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    # NGO must have verified at least one hour log with this student
    has_verified = await db.hours.find_one({
        "student_id": student_id, "ngo_id": user["ngo_id"], "status": "verified"
    })
    if not has_verified:
        raise HTTPException(status_code=403, detail="You can only review students you've worked with")
    existing = await db.student_reviews.find_one({"student_id": student_id, "ngo_id": user["ngo_id"]})
    if existing:
        raise HTTPException(status_code=400, detail="You've already reviewed this student")
    ngo = await db.ngos.find_one({"id": user["ngo_id"]}, {"_id": 0})
    doc = {
        "id": str(uuid.uuid4()),
        "student_id": student_id,
        "ngo_id": user["ngo_id"],
        "ngo_name": ngo["org_name"] if ngo else "",
        "rating": body.rating,
        "comment": body.comment,
        "created_at": now_iso(),
    }
    await db.student_reviews.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/students/me/reviewable")
async def reviewable_students(user: dict = Depends(require_role("ngo"))):
    """List of students the NGO has verified hours for and hasn't reviewed yet."""
    verified = await db.hours.find({"ngo_id": user["ngo_id"], "status": "verified"}, {"_id": 0}).to_list(500)
    already = await db.student_reviews.find({"ngo_id": user["ngo_id"]}, {"_id": 0}).to_list(500)
    reviewed_ids = {r["student_id"] for r in already}
    seen = set()
    result = []
    for h in verified:
        sid = h["student_id"]
        if sid in seen or sid in reviewed_ids: continue
        seen.add(sid)
        result.append({"student_id": sid, "student_name": h.get("student_name"), "opportunity_title": h.get("opportunity_title")})
    return result

# ============ Messaging & Settings ============
def _conv_id(a: str, b: str) -> str:
    return "-".join(sorted([a, b]))

async def _peer_info(peer_user_id: str) -> dict:
    u = await db.users.find_one({"id": peer_user_id}, {"_id": 0, "password_hash": 0, "verify_token": 0})
    if not u:
        return {"id": peer_user_id, "name": "Unknown", "role": None}
    info = {"id": u["id"], "name": u.get("name") or u.get("email"), "role": u.get("role"),
            "avatar_file_id": u.get("avatar_file_id")}
    if u.get("role") == "ngo":
        ngo = await db.ngos.find_one({"id": u.get("ngo_id")}, {"_id": 0, "org_name": 1})
        if ngo: info["org_name"] = ngo.get("org_name")
    return info

@api_router.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    convs = await db.conversations.find({"participants": user["id"]}, {"_id": 0}).sort("last_message_at", -1).to_list(200)
    out = []
    for c in convs:
        peer_id = next((p for p in c["participants"] if p != user["id"]), None)
        peer = await _peer_info(peer_id) if peer_id else {}
        unread = await db.messages.count_documents({"conversation_id": c["id"], "recipient_id": user["id"], "read": False})
        out.append({**c, "peer": peer, "unread": unread})
    return out

@api_router.get("/messages/unread-count")
async def unread_message_count(user: dict = Depends(get_current_user)):
    n = await db.messages.count_documents({"recipient_id": user["id"], "read": False})
    return {"unread": n}

@api_router.post("/conversations/with/{peer_id}")
async def open_conversation(peer_id: str, user: dict = Depends(get_current_user)):
    if peer_id == user["id"]:
        raise HTTPException(status_code=400, detail="Can't message yourself")
    peer = await db.users.find_one({"id": peer_id})
    if not peer:
        raise HTTPException(status_code=404, detail="User not found")
    if {user["role"], peer["role"]} != {"student", "ngo"}:
        raise HTTPException(status_code=403, detail="Messaging is between students and nonprofits")
    cid = _conv_id(user["id"], peer_id)
    existing = await db.conversations.find_one({"id": cid}, {"_id": 0})
    if not existing:
        existing = {"id": cid, "participants": sorted([user["id"], peer_id]),
                    "last_message": None, "last_message_at": now_iso(),
                    "created_at": now_iso()}
        await db.conversations.insert_one(dict(existing))
    existing["peer"] = await _peer_info(peer_id)
    return existing

@api_router.get("/conversations/{cid}/messages")
async def list_messages(cid: str, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": cid})
    if not conv or user["id"] not in conv["participants"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    msgs = await db.messages.find({"conversation_id": cid}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    await db.messages.update_many({"conversation_id": cid, "recipient_id": user["id"], "read": False}, {"$set": {"read": True}})
    return msgs

@api_router.post("/conversations/{cid}/messages")
async def send_message(cid: str, body: MessageCreate, user: dict = Depends(get_current_user)):
    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Message is empty")
    conv = await db.conversations.find_one({"id": cid})
    if not conv or user["id"] not in conv["participants"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    peer_id = next(p for p in conv["participants"] if p != user["id"])
    me = await db.users.find_one({"id": user["id"]})
    peer = await db.users.find_one({"id": peer_id})
    peer_blocked = set(peer.get("blocked_users") or [])
    my_blocked = set(me.get("blocked_users") or [])
    if user["id"] in peer_blocked or peer_id in my_blocked:
        raise HTTPException(status_code=403, detail="Messaging is not available between you and this user")
    if peer.get("messaging_allowed", "everyone") == "no_one":
        raise HTTPException(status_code=403, detail="This user is not accepting messages")
    msg = {"id": str(uuid.uuid4()), "conversation_id": cid,
           "sender_id": user["id"], "recipient_id": peer_id,
           "body": body.body.strip(), "read": False, "created_at": now_iso()}
    await db.messages.insert_one(dict(msg))
    await db.conversations.update_one({"id": cid}, {"$set": {"last_message": msg["body"][:200], "last_message_at": msg["created_at"]}})
    return msg

class MessagingPref(BaseModel):
    messaging_allowed: Literal["everyone", "no_one"] = "everyone"
    notify_new_messages: bool = True

class NotifPref(BaseModel):
    notify_new_messages: Optional[bool] = None
    notify_application_updates: Optional[bool] = None
    notify_hours_verified: Optional[bool] = None

@api_router.get("/settings/me")
async def my_settings(user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0, "verify_token": 0})
    blocked_ids = full.get("blocked_users") or []
    blocked_info = []
    for bid in blocked_ids:
        blocked_info.append(await _peer_info(bid))
    logins = await db.login_activity.find({"user_id": user["id"]}, {"_id": 0}).sort("at", -1).to_list(20)
    return {
        "email": full["email"], "role": full["role"],
        "visibility": full.get("visibility", "public"),
        "messaging_allowed": full.get("messaging_allowed", "everyone"),
        "notify_new_messages": full.get("notify_new_messages", True),
        "notify_application_updates": full.get("notify_application_updates", True),
        "notify_hours_verified": full.get("notify_hours_verified", True),
        "blocked_users": blocked_info, "login_activity": logins,
        "email_verified": bool(full.get("email_verified", False)),
    }

@api_router.patch("/settings/messaging")
async def update_messaging(body: MessagingPref, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "messaging_allowed": body.messaging_allowed,
        "notify_new_messages": body.notify_new_messages,
    }})
    return {"ok": True}

@api_router.patch("/settings/visibility")
async def update_visibility(visibility: str = Query(..., regex="^(public|ngos_only|private)$"),
                            user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"visibility": visibility}})
    return {"ok": True}

@api_router.post("/settings/block/{peer_id}")
async def block_user(peer_id: str, user: dict = Depends(get_current_user)):
    if peer_id == user["id"]:
        raise HTTPException(status_code=400, detail="Can't block yourself")
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"blocked_users": peer_id}})
    return {"ok": True}

@api_router.post("/settings/unblock/{peer_id}")
async def unblock_user(peer_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$pull": {"blocked_users": peer_id}})
    return {"ok": True}

@api_router.post("/settings/change-password")
async def change_password(body: ChangePassword, user: dict = Depends(get_current_user)):
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be 6+ characters")
    full = await db.users.find_one({"id": user["id"]})
    if not full.get("password_hash") or not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}

@api_router.delete("/settings/account")
async def delete_account(user: dict = Depends(get_current_user)):
    await db.users.delete_one({"id": user["id"]})
    if user.get("ngo_id"):
        await db.ngos.delete_one({"id": user["ngo_id"]})
    await db.user_sessions.delete_many({"user_id": user["id"]})
    return {"ok": True}

@api_router.post("/reports")
async def create_report(body: ReportCreate, user: dict = Depends(get_current_user)):
    conv = await db.conversations.find_one({"id": body.conversation_id})
    if not conv or user["id"] not in conv["participants"]:
        raise HTTPException(status_code=404, detail="Conversation not found")
    peer_id = next(p for p in conv["participants"] if p != user["id"])
    doc = {"id": str(uuid.uuid4()), "conversation_id": body.conversation_id,
           "reporter_id": user["id"], "reported_id": peer_id,
           "reason": body.reason, "status": "open", "created_at": now_iso()}
    await db.reports.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/admin/reports")
async def admin_reports(user: dict = Depends(require_role("admin"))):
    reports = await db.reports.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in reports:
        r["reporter"] = await _peer_info(r["reporter_id"])
        r["reported"] = await _peer_info(r["reported_id"])
        msgs = await db.messages.find({"conversation_id": r["conversation_id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
        r["recent_messages"] = msgs
    return reports

@api_router.patch("/admin/reports/{report_id}/resolve")
async def resolve_report(report_id: str, user: dict = Depends(require_role("admin"))):
    await db.reports.update_one({"id": report_id}, {"$set": {"status": "resolved", "resolved_at": now_iso()}})
    return {"ok": True}


# ============ Startup / Seed ============
@app.on_event("startup")
async def startup():
    init_storage()
    # Seed admin
    admin = await db.users.find_one({"email": "admin@caws.org"})
    if not admin:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": "admin@caws.org",
            "password_hash": hash_password("admin123"), "role": "admin",
            "name": "CAWS Admin", "created_at": now_iso()
        })
        logger.info("Seeded admin user: admin@caws.org / admin123")
    # Ensure stats config exists
    if not await db.config.find_one({"id": "stats"}):
        await db.config.insert_one({"id": "stats", **StatsConfig().model_dump()})

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown():
    client.close()
