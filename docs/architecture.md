# Architecture — v0

## Product
A personal intake and booking website for a specific tattoo artist, not a studio directory. Two entry points:
1. **Consultation**: tattoo idea, style, placement, approximate size, budget, description, references (upload later), contact details. Artist reviews and asks clarifying questions in a future iteration.
2. **Session request**: client provides desired date/time and context. This is NOT a confirmed booking; confirmation/availability comes later.

## Diagram
Browser / WebView -> Cloudflare Pages (Vite React + Mantine) -> HTTPS JSON -> Rust Axum API -> PostgreSQL.
For local development, Vite :5173 -> API :8080 -> Docker PostgreSQL :5432. Later private object storage holds reference images; DB only their metadata.

## Modules
- `requests`: validated intake, persistence and request lifecycle.
- `bookings` (future): artist availability, candidate slots, transactional conflict checks.
- `forms` (future): versioned dynamic intake schemas and server-side validation.
- `auth` (future): artist-only admin access. Public clients submit requests.
- `ai` (future): only after concrete cases are specified.

## Data design
`artists` -> `intake_requests` (`request_kind`, contact, description, structured JSONB `answers`, `status`, optional preferred date). One seeded artist is configured in the DB; do not infer artist identity from unsanitized user input. Attachments/messages/bookings are later migrations.

## API v1
- `GET /health` simple process liveness.
- `GET /api/v1/artist` public artist profile.
- `POST /api/v1/requests` submit intake; 201 + request id, 400 for validation, 503 if DB unavailable.
- Admin request management and actual availability are out of scope for scaffold.

## Security & operations
Public requests need rate limiting, anti-spam, privacy notice/consent and retention before public launch. No public admin endpoints. Privacy-by-default: no client photos in database/logs, no LLM use, no secrets checked in. DB migrations applied at startup in MVP (later separate deploy job). Only promote to live booking after conflict-safe design and transactional tests.

## Release path
Local docker compose -> CI (Rust + Node + Postgres migration validation) -> Pages + backend container + managed Postgres. Free hosting sleeps/limits; uptime/backup/security must be assessed before real clients.
