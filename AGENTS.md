# MakeMyRequest — engineering contract

## Mission
Build a mobile-first tattoo request and session enquiry service for **independent individual tattoo artists** and clients. Multiple independent artists can register, but there are no studios, teams or marketplace features.

## Mandatory reading
- docs/architecture.md, docs/adr/0001-modular-monolith.md, docs/adr/0002-ui-kit.md, docs/adr/0003-artist-onboarding-and-retention.md
- vibe/MVP_V2_PLAN.md, vibe/MVP_V2_HANDOFF.md
- .agents/skills/frontend/SKILL.md, backend/SKILL.md, database/SKILL.md and review/SKILL.md as relevant

## Stack
- Web: React 19, TypeScript strict, Vite, shadcn/ui/Tailwind v4. No Mantine.
- API: Rust/Axum, SQLx and PostgreSQL with JSONB; modular monolith.
- Storage: PostgreSQL BYTEA fallback for **small staging photos**, S3-compatible private R2 when configured. No unprotected static files.
- UI strings: translated RU/EN/SR, auto language detection, English fallback, manual override.

## Core invariants
1. A request belongs to a specific artist resolved from the server-validated public slug. Never use the first artist in the database.
2. A session enquiry is not a confirmed booking or claim of real availability.
3. A logged-in client sees only their own requests; a logged-in artist sees only requests to their own artist profile. Enforce in SQL *and* HTTP handlers; never trust an artist_id or role supplied by the browser.
4. Photos and PII only accessible through authenticated endpoints with ownership checks; use opaque keys and no-store headers.
5. Account passwords must be salted Argon2id hashes; session tokens hashed at rest; never commit secrets or log client text/photos.
6. Legacy ADMIN_TOKEN is permitted only for a one-time manually authorized import of historic staging enquiries; no generic admin endpoints.
7. A registered artist can delete their own enquiry including photos. Document residual backups and GDPR erasure rights. Do not promise indefinite retention where law conflicts.
8. User-facing OAuth controls must be disabled until an actually functional, verified provider callback exists. No fake login.
9. Deploy only staging from feature branch pending security review. No payment/AI/automatic confirmed appointments.
10. Migrate schema forward-only; keep existing staging requests until their owner explicitly imports or deletes them.

## Workflow
- Keep features isolated in components/modules with typed request/response contracts.
- Avoid broad abstractions, third-party UI copy/paste and uncontrolled SQL. Incrementally extract new SQL into repository functions; existing account handlers have a tracked extraction debt.
- Use official shadcn registry CLI for added primitives and review generated source; avoid bespoke design systems.
- Keep WebView layout safe at 320px, provide accessible labels, keyboard navigation, loading/error/success.
- Minimal focused tests; never claim execution without CI/browser evidence.

## Quality gates
- npm --prefix apps/web run typecheck
- npm --prefix apps/web run build
- cargo fmt --manifest-path apps/api/Cargo.toml -- --check
- cargo clippy --manifest-path apps/api/Cargo.toml --all-targets -- -D warnings
- cargo test --manifest-path apps/api/Cargo.toml
- PostgreSQL-backed HTTP smoke and manual staging review.

## Definition of done
Working end-to-end feature; green checks; clear disclosure of missing auth provider credentials, email verification, anti-spam, and public-launch blockers.
