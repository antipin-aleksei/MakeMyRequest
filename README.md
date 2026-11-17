# MakeMyRequest

Mobile-first tattoo artist intake and session enquiry for **one artist**.

## Current implementation (test-only)
- React + TypeScript + Vite + shadcn/ui + Tailwind CSS
- Rust + Axum + SQLx + PostgreSQL JSONB
- Public artist profile, two-step request form and private image references
- Private artist inbox at `/admin` with request status changes
- Local file storage for development, Cloudflare R2 compatible private object storage for cloud environments
- **No AI, live availability, payments or confirmed bookings**

## Local development
Install Docker, Node 22+, Rust stable, and npm.

1. `docker compose up -d db`
2. `cp .env.example .env`; replace `ADMIN_TOKEN` with a random 32+ character value
3. `cd apps/api && DATABASE_URL=postgres://tattoo:tattoo@localhost:5432/tattoo ADMIN_TOKEN=YOUR_LONG_RANDOM_SECRET cargo run`
4. In a second terminal, `cd apps/web && npm install && npm run dev`
5. Public: `http://localhost:5173`; artist: `http://localhost:5173/admin`; health: `http://localhost:8080/health`
6. Optional smoke test (writes synthetic data): `ADMIN_TOKEN=YOUR_LONG_RANDOM_SECRET bash scripts/smoke.sh`

API applies migrations automatically at startup and seeds a placeholder artist. For local development uploads live in `apps/api/private_uploads/` and are never served as static assets. For cloud use set private R2 variables and `REQUIRE_REMOTE_STORAGE=true`.

## Agent and delivery documentation
- `AGENTS.md` and `.agents/skills/`: code boundaries and conventions.
- `docs/architecture.md`, `docs/adr/`: design decisions.
- `vibe/MVP_PLAN.md`, `vibe/01_FOUNDATION.md`, `vibe/02_07_IMPLEMENTATION.md`: milestones and remaining work.
- `docs/deployment.md`: test-cloud setup (no service has been deployed).
- `docs/acceptance.md`: manual and smoke acceptance.

**Not ready for public use:** current artist access uses a shared secret instead of production-grade login, anti-spam and privacy/compliance controls remain incomplete. Current code/testing status is documented in `vibe/02_07_IMPLEMENTATION.md`. Do not collect real client data before fixing these blockers.
