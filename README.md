# MakeMyRequest

Mobile-first request intake and session enquiry for **one tattoo artist**.

## Stack
- React + TypeScript + Vite + Mantine
- Rust + Axum + SQLx
- PostgreSQL with JSONB
- Modular monolith, no AI functionality yet

## Local development
Prerequisites: Docker, Node.js 22+, npm, Rust stable.

1. `docker compose up -d db`
2. `cp .env.example .env`
3. `cd apps/api && DATABASE_URL=postgres://tattoo:tattoo@localhost:5432/tattoo cargo run`
4. In another terminal: `cd apps/web && npm install && npm run dev`
5. Open `http://localhost:5173`; health endpoint: `http://localhost:8080/health`.

The API applies SQLx migrations on startup and seeds a **placeholder artist** in local DB. The UI sends real requests to PostgreSQL; without the API, submission shows an error rather than pretending success.

## Scope
The "session" path collects a **preferred date**, not an available time slot or confirmed booking. The consultation path collects structured details. Files, dynamic form builder, login, inbox, anti-spam, privacy policy, notifications and actual booking availability are next iterations. Do not launch publicly until security/privacy requirements are completed.

## Architecture and agent instructions
- `AGENTS.md` — cross-stack constraints and quality gates.
- `.agents/skills/` — focused frontend/backend/database/review workflows.
- `docs/architecture.md`, `docs/adr/` — design and decisions.

## Deployment
Not deployed yet. Free-tier providers may sleep or impose quotas; production rollout requires verified backups, CORS, a secure artist identity and compliance review.
