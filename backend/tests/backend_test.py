"""CAWS backend API regression + Hours flow tests."""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # Fallback to reading frontend .env if REACT_APP_BACKEND_URL not exported
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"
UNIQUE = uuid.uuid4().hex[:8]


@pytest.fixture(scope="module")
def student():
    email = f"TEST_student_{UNIQUE}@test.com"
    r = requests.post(f"{API}/auth/register/student", json={
        "name": "Test Student", "email": email, "password": "pass1234", "school": "Test HS"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "id": data["user"]["id"], "name": "Test Student"}


@pytest.fixture(scope="module")
def ngo_user():
    email = f"TEST_ngo_{UNIQUE}@test.com"
    r = requests.post(f"{API}/auth/register/ngo", json={
        "email": email, "password": "pass1234",
        "org_name": f"TEST NGO {UNIQUE}", "mission": "Testing", "category_tags": ["Education"],
        "ein": "12-3456789", "location": "Remote", "contact_name": "NGO Owner"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["token"], "id": data["user"]["id"], "ngo_id": data["user"]["ngo_id"]}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@caws.org", "password": "admin123"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- Auth / me endpoints ---
class TestAuthMe:
    def test_student_me(self, student):
        r = requests.get(f"{API}/auth/me", headers=h(student["token"]))
        assert r.status_code == 200
        assert r.json()["role"] == "student"

    def test_ngo_me(self, ngo_user):
        r = requests.get(f"{API}/auth/me", headers=h(ngo_user["token"]))
        assert r.status_code == 200
        assert r.json()["role"] == "ngo"


# --- Empty-state student endpoints (critical for the bug being tested) ---
class TestStudentEmptyState:
    def test_applications_mine_empty(self, student):
        r = requests.get(f"{API}/applications/mine", headers=h(student["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_hours_mine_empty(self, student):
        r = requests.get(f"{API}/hours/mine", headers=h(student["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_certificates_mine_empty(self, student):
        r = requests.get(f"{API}/certificates/mine", headers=h(student["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_reviews_mine_empty(self, student):
        r = requests.get(f"{API}/reviews/mine", headers=h(student["token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# --- Full happy path: register -> approve NGO -> create opp -> apply -> accept -> log hours -> verify -> cert ---
class TestFullFlow:
    def test_admin_approve_ngo(self, admin_token, ngo_user):
        r = requests.patch(f"{API}/admin/ngos/{ngo_user['ngo_id']}/approve", headers=h(admin_token))
        assert r.status_code == 200

    def test_ngo_create_opportunity(self, ngo_user):
        r = requests.post(f"{API}/opportunities", headers=h(ngo_user["token"]), json={
            "title": f"TEST Opp {UNIQUE}", "description": "Help out", "cause": "Education",
            "is_remote": True, "hours_estimate": 5, "slots": 5
        })
        assert r.status_code == 200, r.text
        pytest.opp_id = r.json()["id"]

    def test_student_apply(self, student):
        r = requests.post(f"{API}/applications", headers=h(student["token"]),
                          json={"opportunity_id": pytest.opp_id, "message": "eager"})
        assert r.status_code == 200
        pytest.app_id = r.json()["id"]

    def test_ngo_accept(self, ngo_user):
        r = requests.patch(f"{API}/applications/{pytest.app_id}/status",
                           params={"status_val": "accepted"}, headers=h(ngo_user["token"]))
        assert r.status_code == 200

    def test_student_log_hours(self, student):
        r = requests.post(f"{API}/hours", headers=h(student["token"]), json={
            "opportunity_id": pytest.opp_id, "hours": 3.5, "date": "2026-01-15",
            "description": "Helped tutor"
        })
        assert r.status_code == 200, r.text
        pytest.hour_id = r.json()["id"]

    def test_student_hours_mine_has_item(self, student):
        r = requests.get(f"{API}/hours/mine", headers=h(student["token"]))
        assert r.status_code == 200
        items = r.json()
        assert any(x["id"] == pytest.hour_id for x in items)

    def test_ngo_verify_hours(self, ngo_user):
        r = requests.patch(f"{API}/hours/{pytest.hour_id}/verify", headers=h(ngo_user["token"]))
        assert r.status_code == 200
        assert "certificate_id" in r.json()

    def test_student_cert_appears(self, student):
        r = requests.get(f"{API}/certificates/mine", headers=h(student["token"]))
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_student_verified_hours(self, student):
        r = requests.get(f"{API}/hours/mine", headers=h(student["token"]))
        item = next(x for x in r.json() if x["id"] == pytest.hour_id)
        assert item["status"] == "verified"

    def test_log_hours_without_accepted_app_fails(self, student, ngo_user):
        # Create a 2nd opp not applied to
        r = requests.post(f"{API}/opportunities", headers=h(ngo_user["token"]), json={
            "title": f"TEST Opp2 {UNIQUE}", "description": "x", "cause": "Education",
            "is_remote": True, "hours_estimate": 2, "slots": 2
        })
        opp2 = r.json()["id"]
        r = requests.post(f"{API}/hours", headers=h(student["token"]), json={
            "opportunity_id": opp2, "hours": 1, "date": "2026-01-15", "description": "x"
        })
        assert r.status_code == 400
