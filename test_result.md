#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  App imported from another Emergent account (CAWSS-main.zip). Missing .env files caused
  backend/frontend to fail on startup. After creating .env with correct MONGO_URL, DB_NAME,
  JWT_SECRET, EMERGENT_LLM_KEY and setting REACT_APP_BACKEND_URL / APP_PUBLIC_URL to the
  actual preview host (https://preview-migrate.preview.emergentagent.com), user reported
  axios "Network Error" from the frontend. Need to verify backend endpoints are reachable
  via the public /api path so the frontend can call them without Network Errors.

backend:
  - task: "Backend reachable via public preview URL under /api prefix"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Recreated /app/backend/.env with MONGO_URL, DB_NAME=caws_database, JWT_SECRET,
          EMERGENT_LLM_KEY, APP_NAME=CAWS, CORS_ORIGINS=*, and APP_PUBLIC_URL pointing to
          https://preview-migrate.preview.emergentagent.com. Installed all requirements
          plus resend (added to requirements.txt). Supervisor shows backend RUNNING.
          Local curl to /api/opportunities returned 200 and /api/auth/login with seeded
          admin (admin@caws.org/admin123) returned a JWT successfully. Needs testing
          agent to confirm end-to-end via the public URL that all core endpoints work
          (auth, opportunities list, NGOs list, auth/me with Bearer token) so the
          frontend Network Errors are resolved.

  - task: "EIN made optional on NGO registration"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Changed RegisterNGO pydantic model field `ein: str` to `ein: Optional[str] = ""`
          so EIN is no longer a required field on POST /api/auth/register/ngo. Frontend
          Signup form input also had `required` attribute removed and shows "(optional)"
          label. Locally verified via curl: registering an NGO WITHOUT the `ein` key in
          the JSON body succeeds and returns a token + user with role=ngo. Needs testing
          agent to verify from the public preview URL:
            1. POST /api/auth/register/ngo WITHOUT `ein` field → 200 with token + user
            2. POST /api/auth/register/ngo WITH `ein` field → 200 with token + user
            3. Ensure existing required fields (email, password, org_name, mission,
               location, contact_name) still cause a 4xx when missing.
          Use unique emails per test run (e.g. ngo.noein+<timestamp>@example.com).
      - working: true
        agent: "testing"
        comment: |
          Tested via public URL (https://preview-migrate.preview.emergentagent.com):
            ✅ POST /api/auth/register/ngo WITHOUT `ein` key → 200 with token + user (role=ngo)
            ✅ GET /api/ngo/me verified EIN field is empty string in DB
            ✅ POST /api/auth/register/ngo WITH empty `ein: ""` → 200 with token + user
            ✅ POST /api/auth/register/ngo WITH real `ein: "12-3456789"` → 200 with token + user
            ✅ POST /api/auth/register/ngo missing required field `org_name` → 422 (validation error)
          All test cases passed. EIN is now optional and existing required fields are still enforced.

  - task: "Backend still reachable and axios Network Error resolved"
    implemented: true
    working: true
    file: "/app/backend/.env, /app/frontend/.env"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Public URL smoke test executed via /app/backend_test.py:
            ✅ GET /api/opportunities → 200
            ✅ POST /api/auth/login (admin@caws.org/admin123) → 200 with JWT
            ✅ GET /api/auth/me with Bearer → 200 (role=admin)
            ✅ OPTIONS /api/auth/login CORS preflight → 204 with Access-Control-Allow-Origin=*
          The 3 endpoints reported as 404 by the test script were wrong-path assumptions
          (real routes are /api/ngos/{id}, /api/config/nearby, /api/branding/logo — NOT
          /api/ngos, /api/config/landing, /api/branding). Network Error resolved.
      - working: true
        agent: "testing"
        comment: |
          Re-verified via public URL (https://preview-migrate.preview.emergentagent.com):
            ✅ GET /api/opportunities → 200 (returned 0 opportunities)
            ✅ POST /api/auth/login (admin@caws.org/admin123) → 200 with JWT and role=admin
            ✅ GET /api/auth/me with Bearer token → 200 (admin user verified)
            ✅ OPTIONS /api/auth/login CORS preflight → 204 with Access-Control-Allow-Origin=*
          All endpoints reachable. Network Error is resolved. Backend is fully functional via public URL.

frontend:
  - task: "Frontend axios calls hit backend without Network Error"
    implemented: true
    working: "NA"
    file: "/app/frontend/.env"

  - task: "Global search endpoint /api/search"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added GET /api/search?q=<query>&type=<all|nonprofits|profiles|opportunities>&limit=<n>
          that performs case-insensitive substring matching (regex-escaped) across:
            • nonprofits: approved NGOs on org_name/mission/category_tags/location
            • profiles: student users with visibility=public (or unset) on name/school/bio/interests
              (never returns email, password_hash, or verify_token)
            • opportunities: status=open on title/description/cause/location/ngo_name
          Response shape:
            { query, nonprofits: [{id,name,subtitle,description,url,...}],
              profiles: [...], opportunities: [...], total: N }
          Locally verified with q=test → 200 with empty arrays (no data yet). Also
          verified endpoint returns proper shape with q="" (all-empty response).

          NEEDS TESTING via public URL:
            1. GET /api/search?q=community → 200, JSON with the three arrays.
            2. GET /api/search?q=<no-match> → 200 with total=0.
            3. GET /api/search (missing q) → 200 with all arrays empty, query="".
            4. Verify private/ngos_only student profiles are NOT returned. To test:
               - Register a student (POST /api/auth/register/student).
               - Update visibility to "private" via PATCH /api/settings/visibility?visibility=private with the student's Bearer token.
               - GET /api/search?q=<part of student name> → student should NOT appear
                 in the profiles array.
            5. Verify email/password_hash never leak in profile results.
            6. Register a real NGO (make approved by admin) and confirm it shows in
               nonprofits array when searching its org_name. (Optional — mainly rely
               on the sanity of the mongo query.)

  - task: "File upload (profile photo) works reliably and stored file is retrievable"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: false
        agent: "user"
        comment: |
          User reported: "the file uploaded does not show in the profile".
          Investigation showed POST /api/upload was returning 500 with the underlying
          Emergent Object Storage API returning 500 on PUT — root cause was a stale
          in-process `_storage_key` cached from an earlier init call before .env was
          populated. That stale key kept being reused and every subsequent upload
          failed.
      - working: "NA"
        agent: "main"
        comment: |
          Fix applied in /app/backend/server.py (init_storage / put_object / get_object):
            - init_storage(force=True) can now be forced to re-issue a fresh key
            - put_object and get_object retry once with a fresh storage key when the
              storage API returns 401/403/500 (self-heal stale keys)
            - Non-recoverable errors now raise HTTP 502 (not raw HTTPError).
          Local verification (curl round-trip):
            - POST /api/upload with image file → 200 {file_id, path}
            - PATCH /api/students/me {avatar_file_id:<id>, accent_color:"#78af84"} → 200
            - GET /api/students/{sid} → returns avatar_file_id + accent_color
            - GET /api/files/{file_id} with Bearer → 200, PNG bytes returned

          NEEDS TESTING via public URL:
            1. Register/login as a student (unique email).
            2. POST /api/upload with a small image file (multipart form, field=file)
               → expect 200 with {file_id, path}. Should NOT return 500. Retry-on-500
               logic should mask any transient storage issues.
            3. PATCH /api/students/me with {"avatar_file_id":"<from step 2>",
               "accent_color":"#78af84"} → 200 {ok:true}
            4. GET /api/students/<student_id> → 200 and JSON contains the same
               avatar_file_id and accent_color that were just saved.
            5. GET /api/files/<file_id>?auth=<student_token> → 200 with image bytes
               (Content-Type=image/png or similar).
            6. Repeat step 2 five times in quick succession — all 5 should succeed
               (regression against the stale-key bug).

  - task: "Student profile accent color persists and profile displays it"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          The backend already accepted accent_color on PATCH /api/students/me
          (StudentProfileUpdate model). Frontend was refactored so:
            - the avatar circle itself is the upload trigger (with camera overlay)
            - the accent color changes preview live in edit mode
            - the saved accent_color is respected on all colored elements
              (cover background — now SOLID accent, no gradient — pinned opp border,
              hours bars, interest badges, section headings, save button, etc.)
          Please verify at the API level that:
            1. PATCH /api/students/me with {"accent_color":"#78af84"} → 200
            2. GET /api/students/<id> after → accent_color == "#78af84"
            3. Same for other palette values (e.g. "#0e3217", "#407d4e", "#B76E79").

    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Set REACT_APP_BACKEND_URL=https://preview-migrate.preview.emergentagent.com
          (previously was set to a stale preview host from supervisor config which caused
          axios "Network Error"). Frontend recompiled successfully. Do NOT test frontend
          without explicit user permission — only backend testing is requested right now.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "File upload (profile photo) works reliably and stored file is retrievable"
    - "Student profile accent color persists and profile displays it"
    - "Global search endpoint /api/search"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      App was imported from another Emergent account. .env files were missing so both
      services crashed. I recreated them with the correct public host
      (https://preview-migrate.preview.emergentagent.com) for both REACT_APP_BACKEND_URL
      and APP_PUBLIC_URL, and set MONGO_URL to local mongo. Backend now RUNNING and admin
      login works via localhost curl. Please verify from the public URL that /api/auth/login
      (admin@caws.org / admin123), /api/auth/me (with Bearer token), /api/opportunities,
      /api/ngos, /api/config/landing, and /api/branding are all reachable and return 2xx —
      this confirms the Network Error the user hit is resolved. Do NOT run frontend tests.
  - agent: "testing"
    message: |
      Backend testing completed successfully via public URL. All tests passed:
      
      ✅ Network Error Fix: All 4 endpoints tested (GET /api/opportunities, POST /api/auth/login,
         GET /api/auth/me, OPTIONS CORS preflight) returned correct status codes and data.
      
      ✅ EIN Optional: All 5 test cases passed:
         - Register without ein key → 200
         - Register with empty ein → 200
         - Register with real ein → 200
         - DB verification shows ein as empty string
         - Validation still enforces required fields (422 for missing org_name)
      
      Both backend tasks are now working correctly. No issues found.
