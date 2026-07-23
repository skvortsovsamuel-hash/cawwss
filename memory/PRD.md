# CAWS — Community Action With Students

## Original Problem Statement
Web platform connecting students with vetted NGOs/nonprofits to discover volunteer opportunities, log verified hours, earn certificates, and build reputation — with a refined brand identity and clean, professional UI.

## Architecture
- **Frontend**: React + JSX + Tailwind CSS + shadcn/ui, sonner toasts, react-router-dom
- **Backend**: FastAPI + Motor (MongoDB async), JWT auth (pyjwt), bcrypt password hashing
- **Storage**: Emergent Object Storage (via EMERGENT_LLM_KEY)
- **PDF**: reportlab for server-generated certificates
- **AI**: emergentintegrations LlmChat with gemini-3.1-flash-image-preview for logo generation

## User Personas
1. **Students** — discover, apply, log hours, earn certificates
2. **NGOs** — post opportunities, review applicants, verify hours, build reliability score
3. **Admins** — approve NGOs, toggle landing stats, moderate users
4. **Visitors** — browse marketing landing + public opportunities

## Core Requirements (Static)
- Brand: Navy #0B1D36, Teal #008080, Gold #D4AF37, Warm gray #F5F5F0
- Type: Lora (serif) for headings/numbers, Inter (sans) for body
- Buttons: solid teal, white text, rounded
- Ledger stat cards with serif numbers over gray uppercase labels
- 24–32px spacing, loading skeletons everywhere data fetches

## What's Been Implemented (Feb 2026)
### Phase 1 — Foundation
- Full brand system with CSS variables (index.css) + tailwind config with navy/teal/gold/warm palette
- Landing page: circular crest (SVG + AI-gen fallback), gold italic tagline, mission headline, live/custom ledger stats, "How it works" section
- JWT auth with bcrypt (email/password) — student, NGO, admin roles
- Seeded admin (`admin@caws.org` / `admin123`)
- MongoDB collections: users, ngos, opportunities, applications, hours, certificates, reviews, notifications, files, config, branding

### Phase 2 — Student Experience
- Discover feed with filters (cause, location, remote/in-person, max hours)
- Opportunity detail + apply flow
- My applications tracker
- Log hours dialog (restricted to accepted opportunities)
- Certificates list with PDF download

### Phase 3 — NGO Experience
- NGO signup with 10-field multi-field flow (org name, mission, EIN, category tags, contact, website, etc.)
- "Under review" screen with legitimacy doc upload to object storage
- NGO dashboard: create/close opportunities, applicant pipeline (accept/reject), hour verification
- Reliability score (responsiveness + verification rate + review avg, weighted)

### Phase 4 — Admin
- NGO approval queue with legitimacy doc reference
- Landing stats toggle: per-metric Live vs. Custom, saved to `config` collection
- User roster
- Branding panel with "Generate crest" (Gemini Nano Banana)

### Phase 5 — Polish
- Server-generated PDF certificates (reportlab, navy/teal/gold branded)
- In-app notifications center (application status, hour approvals, NGO approvals)
- Skeleton loaders on landing stats, opportunity feed, opportunity detail
- All interactive elements have data-testid

## What's NOT Yet Implemented / Backlog

### P1 — Should have soon
- Reviews UI (backend endpoints exist — students can POST /api/reviews; UI to leave/browse reviews on completed opportunities not yet wired)
- NGO profile edit UI (backend supports storing; edit form pending)
- Password reset flow

### P2 — Nice to have
- Resend email integration (verification, application updates, hour approvals) — deferred per user
- Google OAuth — deferred per user (JWT-only chosen)
- Stripe subscription tiers wiring
- Analytics for NGOs (application funnel, hours trend)
- Search & sort refinements on discover feed
- WhatsApp/SMS notifications
- Native mobile

## Test Credentials
See `/app/memory/test_credentials.md`
- Admin: `admin@caws.org` / `admin123`

## Deployment
- Backend on supervisor at `0.0.0.0:8001`, all routes under `/api`
- Frontend uses `REACT_APP_BACKEND_URL` for API calls
- All secrets in `/app/backend/.env` (JWT_SECRET, EMERGENT_LLM_KEY, MONGO_URL, DB_NAME, APP_NAME)
