# MVP v2 — implementation progress and staging handoff

Status: code under review on \`feat/mvp-v2-accounts-i18n\`, PR #9.
Deployment target: Render frontend https://makemyrequest-web-staging.onrender.com and backend https://makemyrequest-api-staging.onrender.com. Both originally follow \`feat/mvp-02-07-implementation\`; after green CI fast-forward staging branch and manually redeploy.

## Implemented
- New landing page for artist/client registration and login; booking form moved behind personal artist hash link.
- User accounts (artist/client roles), email/password Argon2id, hashed bearer sessions in PostgreSQL.
- Artist onboarding/profile: name, bio, city, social/contact methods, publishing slug/booking link and inbox per artist.
- Guest + signed-in client requests routed by verified artist slug; registered clients see their own requests and details.
- Email optional *for request form*, messenger channels Telegram/WhatsApp/Viber/Instagram; form prefill for signed-in clients.
- Two size dimensions width_cm and height_cm in centimetres; body-area chooser with original front/back SVG legend.
- English, Russian and Serbian (Latin script), browser/WebView auto-detect with English fallback, manual chooser.
- Contact photos persisted to PostgreSQL staging if R2 absent; artist-only removal cascades metadata and DB bytes.
- Only original admin credential may import past staging requests into a new artist profile; old records are preserved.
- Contract-based Rust tests and PostgreSQL HTTP smoke for roles, persistence, permissions and deletion.

## Not yet production features
- **Google, Apple and Facebook social login:** placeholders disabled on screen, real provider apps, redirect credentials, backend verified OAuth callback and account linking still needed.
- No verified email, password reset or rate limiting/WAF; no real payment or booked/confirmed slot.
- Guest enquiries cannot be automatically claimed by a client who later registers (requires verified contact proof).
- Artist and client roles are separate per account for MVP; allowing the same account to have both requires additional roles schema.
- Artist profile avatar and editable questionnaires are subsequent features.
- A dedicated persistent object storage bucket is preferable beyond small staging (Postgres BYTEA uses database quota).
- Manual iOS/Android/WebView accessibility checks, GDPR policy, retention/legal deletion requests and backup/restore tests remain.
- SQL placement in accounts.rs needs repository extraction once feature contracts settle; do not add new ad hoc SQL broadly.

## Manual acceptance checklist
- Create an artist; set slug/bio; copy the booking link /#/a/:slug/apply.
- Guest opens the link, selects RU/EN/SR, fills messenger, two dimensions, previews anatomy legend, submits 1–3 images.
- Artist sees the request and image after refreshing, changes status or deletes; cannot see another artist's requests.
- Create a client account, add Telegram, send request without retyping contact, see it in client dashboard.
- Refresh every hash route in mobile WebView; check 320px and keyboard opening.

## Historic request migration
An existing staging request is stored under a legacy placeholder artist (verified by Neon count). It intentionally does not belong to a newly registered artist. After registering and saving artist profile, use the \`Import old test requests\` section with the **original administrator key** from Render environment settings; this migrates only unclaimed placeholder records. Never print or commit the key.

## After integration
Upgrade staging branch and deploy both Render services with autodeploy disabled. Verify live status and /health; inspect Render logs for API migration and DB health. Do not publish as a production service until security blockers are removed.

## Deployment evidence — 2026-11-18
- GitHub Actions latest verified source commit ed826264: web build, Rust fmt/clippy/unit and PostgreSQL-backed HTTP integration all passed: https://github.com/antipin-aleksei/MakeMyRequest/actions/runs/44289469087
- Source promoted to staging branch at commit f23a0b233506992691b849307e7699adccaeb361.
- Render API deploy dep-dbuo83gm7kps73d17uhg reported **live** and uses that source commit.
- Render static web deploy dep-dbuo9g6c6qcc73aufug0 reported **live** and uses that source commit.
- Neon staging PostgreSQL has three successful SQLx migrations, including account/session schema; the original staging request and attachment remain present. SQL count checked without exposing client details.
- Manual interactive iOS/Android/WebView and external HTTPS HTTP fetch were **not** confirmed by independent browser tools. Verify the links below manually.
- Public website https://makemyrequest-web-staging.onrender.com ; API https://makemyrequest-api-staging.onrender.com/health
- Social OAuth remains blocked on developer provider configuration; real data and public launch require further security/privacy setup.
