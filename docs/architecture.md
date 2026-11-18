# Architecture — MakeMyRequest MVP v2

## Product boundaries
Independent tattoo artists create accounts and publish personalized booking links; clients may register or send **guest enquiries** without an account. Artist/client logins and dashboards are distinct; there is no studio account, AI, payment or live calendar.

## Infrastructure (staging)
React / TypeScript / Vite / shadcn + Tailwind on Render Static Site (free HTTPS) → Rust Axum API on Render Free → Neon PostgreSQL staging. Image references up to 3×5 MiB: PostgreSQL BYTEA by default (durable staging), private Cloudflare R2 when configured. Photos are delivered through authenticated Rust endpoints, never a public bucket. Staging object/DB quotas must be monitored.

## UI routes
Render static site has no reliable deep-route fallback through the available management API; Vite uses **hash routes**:
- /#/ — welcome with separate artist and client sign-in/registration
- /#/auth/register/artist and /#/auth/register/client
- /#/artist/dashboard — artist onboarding, inbox, detail/status/delete, legacy import
- /#/client/dashboard — client requests, details/photos and contact profile
- /#/a/:slug — public artist profile
- /#/a/:slug/apply — consultation or session-request questionnaire

Copy links from artist dashboard; directly reopening hash links must work. The bare /admin path is retired.

## Rust modules
- accounts.rs: password auth with Argon2id, opaque hashed bearer sessions, role-aware read/update, registration, artist profiles, request queries, deletion and one-time legacy import.
- requests.rs: validation and protected upload using per-request SHA256 upload token. SQLx migrations are applied at API startup.
- main.rs: router, storage, CORS, settings.

## Database
app_users (role, email/password hash, display_name, locale, contact channels) ↔ user_sessions.
artists (user_id, unique slug, bio, city, published/accepting_requests, contacts).
intake_requests (artist_id mandatory, client_user_id nullable, contact email optional as empty string, channels JSONB, answers JSONB, form_version, status, preferred_at, upload_token_hash).
request_attachments (request_id, media_type, size, contents BYTEA when R2 absent).
Existing legacy seeded artist/requests are preserved. New onboarding does not automatically claim historic data. One-time import requires the original server admin secret plus authenticated artist account.

## HTTP contracts
- POST /api/v1/auth/register /login /logout; GET/PUT /api/v1/auth/me.
- GET /api/v1/auth/providers (reports providers as unavailable until configured).
- GET/PUT /api/v1/artist/me; GET /api/v1/artists/:slug.
- POST /api/v1/artists/:slug/requests (authenticated clients or guests).
- POST /api/v1/requests/:id/attachments (upload bearer token).
- GET /api/v1/artist/requests; GET/PATCH/DELETE /api/v1/artist/requests/:id.
- GET /api/v1/client/requests; GET /api/v1/client/requests/:id.
- GET /api/v1/attachments/:id (artist owner or client submitter).
- POST /api/v1/artist/claim-legacy (artist bearer AND original x-legacy-admin-key).

## Security constraints and production gaps
Passwords are Argon2id and per-session tokens stored hashed; session secret in browser sessionStorage and sent as bearer (staging scope, XSS protection important). Exact-origin CORS. All per-user data SQL filtered by user_id; tests include cross-artist reads and private image access. JSON inputs capped, images magic-type checked and bounded in size.
Before public sign-up with genuine personal data: verified email, account recovery, login rate limiting/WAF and CSRF review, abuse protection, GDPR notices and erasure workflow, backups/lifecycle, independent security review, and real Google/Apple/Facebook OAuth apps/callbacks. No social sign-in is claimed functional yet.

## Quality checks
GitHub Actions has web typecheck/build, cargo fmt/clippy/test and disposable PostgreSQL HTTP smoke covering account lifecycle, artist page, messenger-only guest submission, client inbox, private uploaded image, cross-artist authorization, status and deletion. Manual mobile/WebView checks remain.
