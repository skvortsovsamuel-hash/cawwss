# Auth Testing Playbook (CAWS)

Test identities for Google OAuth are the user's own Google accounts. Do not store password credentials for Google Auth flows.

## Existing password auth (unchanged)
- Admin: admin@caws.org / admin123
- See /app/memory/test_credentials.md for full list

## Google Auth (Emergent-managed)

### Flow
1. User clicks "Continue with Google" on /login (or /signup)
2. Frontend redirects to `https://auth.emergentagent.com/?redirect={origin}/auth/callback`
3. After Google approves, browser lands at `{origin}/auth/callback#session_id=<sid>`
4. Frontend AuthCallback synchronously POSTs to `/api/auth/google-session` with `{ session_id }`
5. Backend calls Emergent `/auth/v1/env/oauth/session-data`, upserts user (role=student), creates DB session (7 days), sets httpOnly `session_token` cookie, returns user JSON
6. Frontend stores user in AuthContext + redirects to `/student`

### Manual test — create session directly
```
mongosh --eval "
use('test_database');
var userId = 'test-google-' + Date.now();
var sessionToken = 'test_gsession_' + Date.now();
db.users.insertOne({
  id: userId,
  email: 'gtest.'+Date.now()+'@example.com',
  name: 'Google Test',
  picture: 'https://via.placeholder.com/64',
  role: 'student',
  auth_provider: 'google',
  email_verified: true,
  created_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

### API tests
```
# With Bearer session_token (works for both JWT and session_token)
curl -H "Authorization: Bearer <session_token>" $API/api/auth/me

# With cookie
curl -b "session_token=<token>" $API/api/auth/me
```

### Success indicators
- ✅ /api/auth/me returns user with email_verified=true and auth_provider="google"
- ✅ Dashboard loads directly (no redirect to /login)
- ✅ Logout deletes session and clears cookie

### Failure indicators
- ❌ 401 on /api/auth/me after callback → check cookie was set (httpOnly, samesite=none, secure=true)
- ❌ CORS error on session-exchange → verify CORS_ORIGINS in backend/.env matches frontend origin exactly
