# MakeMyRequest — AI agent contract

## Mission
Build a mobile-first request intake and session enquiry website for **one tattoo artist**. Clients submit a consultation or session request, not a confirmed booking. Do not build a studio directory or multi-tenancy.

## Required reading & skills
1. Read `docs/architecture.md`, `docs/adr/0001-modular-monolith.md`, `docs/adr/0002-ui-kit.md`.
2. Read `vibe/MVP_PLAN.md` for scope.
3. For frontend read `.agents/skills/frontend/SKILL.md`; backend: `.agents/skills/backend/SKILL.md`; database: `.agents/skills/database/SKILL.md`; reviews: `.agents/skills/review/SKILL.md`.

## Architecture rules
- React 19 + TypeScript strict + Vite + **shadcn/ui and Tailwind v4**. Never introduce Mantine.
- Backend Rust + Axum + SQLx. PostgreSQL with JSONB. One modular monolith.
- UI owns presentation/UX checks, API owns authoritative validation/business rules, database owns constraints.
- HTTP handlers must not own SQL; new functionality isolates SQL in repositories.
- Version API routes under `/api/v1`, use typed DTOs and preserve compatibility.
- Don't add microservices, queues, LLM infrastructure, or speculative abstractions.
- Treat customer info and tattoo photos as private. No secrets/PII in Git, logs, or public storage.
- Store times in UTC, handle artist timezone explicitly. Block double booking with DB transactions/constraints when real bookings are implemented.
- Requested session date is NOT live availability or a booking confirmation.

## Development workflow
1. Identify milestone, write scoped acceptance criteria, tests for nontrivial behavior.
2. Use official shadcn CLI for new components: `cd apps/web && npx shadcn@latest add <component>`. Review generated code.
3. Prefer reusable shadcn primitives, semantic forms, accessible labels and errors, mobile WebView layout.
4. Keep changes small, update ADR when architecture changes.
5. Don't claim success for checks that have not been executed.

## Quality gates
- `npm --prefix apps/web run typecheck`
- `npm --prefix apps/web run build`
- `cargo fmt --manifest-path apps/api/Cargo.toml -- --check`
- `cargo clippy --manifest-path apps/api/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path apps/api/Cargo.toml`
- Exercise SQLx migrations on real PostgreSQL before deploying.

## Definition of done
Working feature behavior with loading/error/success states, accessible mobile UI, server validation and relevant tests, green CI and updated documentation. Do not present unverified slot availability or fake confirmations.
