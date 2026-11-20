# MakeMyRequest

Mobile-first tattoo request management for independent tattoo artists and their clients.

## Stack
React / TypeScript / Vite / shadcn/ui / Tailwind; Rust / Axum / SQLx; Neon PostgreSQL. Images are kept in the private database for staging or in Cloudflare R2 when configured. No AI.

## MVP v2
- Email/password sign-in with Argon2id and role-specific artist/client dashboards.
- Artist onboarding, public profile, personalized links and incoming requests.
- Clients and guests submit forms with optional email and Telegram/WhatsApp/Viber/Instagram.
- Two dimensions (width/height), body diagram, RU/EN/SR, photos and client request history.
- Artists can change status and delete their own requests and photos.
- Requested dates are preferences, not confirmed bookings.

## Staging URLs
- Web: https://makemyrequest-web-staging.onrender.com
- API health: https://makemyrequest-api-staging.onrender.com/health
- Routes use URL hash for reliable static-host deep links: /#/artist/dashboard, /#/client/dashboard, /#/a/artist-slug/apply.
- Current staging deployment follows branch feat/mvp-02-07-implementation; validated v2 changes are promoted there.

## Run locally
1. docker compose up -d db
2. cd apps/api && DATABASE_URL=postgres://tattoo:tattoo@localhost:5432/tattoo cargo run
3. cd apps/web && npm install && npm run dev
4. bash scripts/smoke.sh (against disposable DB only)

Read docs/architecture.md, vibe/MVP_V2_PLAN.md, vibe/MVP_V2_HANDOFF.md, AGENTS.md and .agents/skills.

## Not production ready
Google/Apple/Facebook login requires provider credentials and secure OAuth callbacks and is visibly disabled. Email verification, password recovery, rate limits/anti-abuse, GDPR consent and privacy policy, backup and manual mobile checks are not complete. Do not submit real client photos until these controls are in place.
