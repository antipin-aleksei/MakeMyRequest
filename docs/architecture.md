# Architecture — MVP staging v1

## Product
Single tattoo artist; public website supports **consultation** (idea, details, references) and **session enquiry** (preferred date, not confirmed booking). No multi-tenant studio, payment, AI or live availability.

## Runtime
Browser/WebView -> Cloudflare Pages (Vite, React + shadcn/ui/Tailwind) -> HTTPS JSON -> Rust Axum API (Render container) -> Neon PostgreSQL.
Client reference photos -> Rust multipart endpoint with per-request 24h upload token -> private object store (Cloudflare R2 in cloud, local store in development). Download always goes through authenticated admin API; do not create public object URLs.

## Components
- `apps/web/src/App.tsx`: public artist profile and two-step request flow; typed `api.ts`.
- `apps/web/src/Admin.tsx`: protected, test-only single-artist inbox UI.
- `apps/api/src/requests.rs`: intake, upload/admin routes, request DTOs and SQLx operations; persistence extraction is in progress.
- `apps/api/migrations`: SQL schema for artist/intake and private attachment metadata.
- `docs/deployment.md`: reproducible staging deployment guide.
- `scripts/smoke.sh`: synthetic test of real HTTP endpoints and storage.

## Data
`artists` -> `intake_requests` (kind/status, email, JSONB answers, preferred_at, form_version=1, SHA256 hash of upload bearer token).
`intake_requests` -> `request_attachments` (UUID object key, filename, media_type, size_bytes). DB trigger limits attachments to three; max 5 MiB server-side. Binary bytes live in private object store, not DB.
No dynamic form builder yet; reserve form_version and document schema changes with migrations.

## Public API
- `GET /health` liveness.
- `GET /api/v1/artist` public profile.
- `POST /api/v1/requests` creates enquiry, returns `{id,status,upload_token}`. Important: upload token is a sensitive bearer secret and should not be logged or persisted client-side.
- `POST /api/v1/requests/:id/attachments` accepts multipart `file` only with `x-upload-token`; link usable for up to 24h.
- `GET /api/v1/admin/requests` lists up to 100.
- `GET /api/v1/admin/requests/:id` details and file metadata.
- `PATCH /api/v1/admin/requests/:id` changes status.
- `GET /api/v1/admin/attachments/:id` returns private image bytes with no-store, nosniff.

All admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`; this is **temporary staging-only authorization**, not production user authentication.

## Invariants and known gaps
- Never show requested dates as free/confirmed slots.
- Public form validates inputs on both frontend and backend; DB constraints defend record integrity.
- Files checked by signature, size, maximum count; R2 bucket must be private. This is not an antivirus/content-safety scanner.
- Anti-spam includes only honeypot now; rate limiting, abuse detection, session-based auth, privacy policy and deletion/retention must be added before public use.
- One process may restart at any time. In cloud enforce `REQUIRE_REMOTE_STORAGE=true` so ephemeral uploads are not silently used.
- `ADMIN_TOKEN` must be generated and managed as a secret; no storage in localStorage.
- AI will be a future module that calls existing business services and never bypasses authorization or booking rules.

## Quality gates
Run npm TypeScript/build, Rust fmt/clippy/test and PostgreSQL-backed HTTP smoke. See `docs/acceptance.md`. Code is not production-ready until every required security and deployment blocker is cleared.
