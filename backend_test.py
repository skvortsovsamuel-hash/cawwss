#!/usr/bin/env python3
"""
Backend test script for profile photo upload and accent color bug fix verification.
Tests against public URL: https://preview-migrate.preview.emergentagent.com
"""

import requests
import time
import io
from PIL import Image

BASE_URL = "https://preview-migrate.preview.emergentagent.com"

def create_test_image():
    """Create a small PNG image for testing."""
    img = Image.new('RGB', (10, 10), color='red')
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf

def test_setup():
    """Setup: Register a fresh student."""
    print("\n=== SETUP: Register fresh student ===")
    email = f"photofix.{int(time.time())}@example.com"
    payload = {
        "email": email,
        "password": "testpass123",
        "name": "PhotoFix Tester"
    }
    
    resp = requests.post(f"{BASE_URL}/api/auth/register/student", json=payload)
    print(f"POST /api/auth/register/student → {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ SETUP FAILED: {resp.status_code} {resp.text}")
        return None, None, None
    
    data = resp.json()
    token = data.get("token")
    student_id = data.get("user", {}).get("id")
    
    print(f"✅ Student registered: {email}, ID: {student_id}")
    return token, student_id, email

def test_t1_upload_endpoint(token):
    """T1 — Upload endpoint works (bug fix verification)"""
    print("\n=== T1: Upload endpoint works ===")
    
    img_buf = create_test_image()
    files = {'file': ('test.png', img_buf, 'image/png')}
    headers = {'Authorization': f'Bearer {token}'}
    
    resp = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
    print(f"POST /api/upload → {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        file_id = data.get("file_id")
        path = data.get("path")
        print(f"✅ T1 PASS: Upload succeeded. file_id={file_id}, path={path}")
        return file_id
    else:
        print(f"❌ T1 FAIL: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return None

def test_t2_repeat_upload(token):
    """T2 — Repeat upload 5× in a row (regression against stale-key bug)"""
    print("\n=== T2: Repeat upload 5× in a row ===")
    
    results = []
    for i in range(5):
        img_buf = create_test_image()
        files = {'file': (f'test{i}.png', img_buf, 'image/png')}
        headers = {'Authorization': f'Bearer {token}'}
        
        resp = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        results.append(resp.status_code)
        print(f"  Upload {i+1}/5 → {resp.status_code}")
    
    if all(status == 200 for status in results):
        print(f"✅ T2 PASS: All 5 uploads succeeded. Status codes: {results}")
        return True
    else:
        print(f"❌ T2 FAIL: Not all uploads succeeded. Status codes: {results}")
        return False

def test_t3_save_profile(token, file_id):
    """T3 — Save profile with uploaded avatar + accent color"""
    print("\n=== T3: Save profile with avatar + accent color ===")
    
    payload = {
        "avatar_file_id": file_id,
        "accent_color": "#78af84",
        "bio": "hello"
    }
    headers = {'Authorization': f'Bearer {token}'}
    
    resp = requests.patch(f"{BASE_URL}/api/students/me", json=payload, headers=headers)
    print(f"PATCH /api/students/me → {resp.status_code}")
    
    if resp.status_code == 200:
        data = resp.json()
        print(f"✅ T3 PASS: Profile saved. Response: {data}")
        return True
    else:
        print(f"❌ T3 FAIL: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False

def test_t4_verify_profile(student_id, file_id):
    """T4 — Verify profile reflects the saved fields"""
    print("\n=== T4: Verify profile reflects saved fields ===")
    
    resp = requests.get(f"{BASE_URL}/api/students/{student_id}")
    print(f"GET /api/students/{student_id} → {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ T4 FAIL: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    data = resp.json()
    avatar_file_id = data.get("avatar_file_id")
    accent_color = data.get("accent_color")
    bio = data.get("bio")
    
    print(f"  avatar_file_id: {avatar_file_id} (expected: {file_id})")
    print(f"  accent_color: {accent_color} (expected: #78af84)")
    print(f"  bio: {bio} (expected: hello)")
    
    if avatar_file_id == file_id and accent_color == "#78af84" and bio == "hello":
        print(f"✅ T4 PASS: All fields match")
        return True
    else:
        print(f"❌ T4 FAIL: Fields do not match")
        return False

def test_t5_retrieve_file(file_id, token):
    """T5 — Verify uploaded file is retrievable via /api/files/<id>"""
    print("\n=== T5: Verify uploaded file is retrievable ===")
    
    resp = requests.get(f"{BASE_URL}/api/files/{file_id}?auth={token}")
    print(f"GET /api/files/{file_id}?auth=<token> → {resp.status_code}")
    
    if resp.status_code != 200:
        print(f"❌ T5 FAIL: Expected 200, got {resp.status_code}")
        print(f"Response: {resp.text}")
        return False
    
    content_type = resp.headers.get('Content-Type', '')
    content_length = len(resp.content)
    
    print(f"  Content-Type: {content_type}")
    print(f"  Content-Length: {content_length} bytes")
    
    if content_type.startswith('image/') and content_length > 0:
        print(f"✅ T5 PASS: File retrieved successfully")
        return True
    else:
        print(f"❌ T5 FAIL: Content-Type or length invalid")
        return False

def test_t6_accent_color_palette(token, student_id):
    """T6 — Accent color palette values all persist"""
    print("\n=== T6: Accent color palette values all persist ===")
    
    colors = ["#0e3217", "#407d4e", "#78af84", "#B76E79"]
    headers = {'Authorization': f'Bearer {token}'}
    
    all_pass = True
    for color in colors:
        # PATCH with new color
        payload = {"accent_color": color}
        resp = requests.patch(f"{BASE_URL}/api/students/me", json=payload, headers=headers)
        print(f"  PATCH accent_color={color} → {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"    ❌ PATCH failed")
            all_pass = False
            continue
        
        # GET to verify
        resp = requests.get(f"{BASE_URL}/api/students/{student_id}")
        if resp.status_code != 200:
            print(f"    ❌ GET failed")
            all_pass = False
            continue
        
        data = resp.json()
        saved_color = data.get("accent_color")
        
        if saved_color == color:
            print(f"    ✅ Verified: {saved_color}")
        else:
            print(f"    ❌ Mismatch: expected {color}, got {saved_color}")
            all_pass = False
    
    if all_pass:
        print(f"✅ T6 PASS: All accent colors persisted correctly")
    else:
        print(f"❌ T6 FAIL: Some accent colors did not persist")
    
    return all_pass

def test_t7_regressions():
    """T7 — Regressions (still pass)"""
    print("\n=== T7: Regressions (admin login, search) ===")
    
    # Admin login
    payload = {"email": "admin@caws.org", "password": "admin123"}
    resp = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
    print(f"POST /api/auth/login (admin) → {resp.status_code}")
    
    admin_pass = resp.status_code == 200
    if admin_pass:
        print(f"  ✅ Admin login works")
    else:
        print(f"  ❌ Admin login failed: {resp.text}")
    
    # Search endpoint
    resp = requests.get(f"{BASE_URL}/api/search?q=community")
    print(f"GET /api/search?q=community → {resp.status_code}")
    
    search_pass = resp.status_code == 200
    if search_pass:
        print(f"  ✅ Search endpoint works")
    else:
        print(f"  ❌ Search endpoint failed: {resp.text}")
    
    if admin_pass and search_pass:
        print(f"✅ T7 PASS: Regressions still pass")
        return True
    else:
        print(f"❌ T7 FAIL: Some regressions failed")
        return False

def main():
    print("=" * 80)
    print("BACKEND TEST: Profile Photo Upload & Accent Color Bug Fix Verification")
    print("=" * 80)
    
    # Setup
    token, student_id, email = test_setup()
    if not token or not student_id:
        print("\n❌ SETUP FAILED - Cannot proceed with tests")
        return
    
    # T1: Upload endpoint works
    file_id = test_t1_upload_endpoint(token)
    if not file_id:
        print("\n❌ T1 FAILED - Cannot proceed with dependent tests")
        return
    
    # T2: Repeat upload 5×
    test_t2_repeat_upload(token)
    
    # T3: Save profile with avatar + accent color
    test_t3_save_profile(token, file_id)
    
    # T4: Verify profile reflects saved fields
    test_t4_verify_profile(student_id, file_id)
    
    # T5: Verify uploaded file is retrievable
    test_t5_retrieve_file(file_id, token)
    
    # T6: Accent color palette values all persist
    test_t6_accent_color_palette(token, student_id)
    
    # T7: Regressions
    test_t7_regressions()
    
    print("\n" + "=" * 80)
    print("BACKEND TESTS COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
