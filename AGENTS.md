# MakeMyRequest — AI agent contract

## Mission
Build a mobile-first request intake and appointment booking service for **one individual tattoo artist**. A client may submit a detailed consultation request or ask for a session. The artist must receive structured, actionable information. Do not introduce studio/multi-tenant features until requested.

## Stack and boundaries
- Web: React, TypeScript (strict), Vite, Mantine. Rust API: Axum, serde, tokio, SQLx. Database: PostgreSQL.
- Keep a **modular monolith**. No microservices, queues, Kubernetes, Redis, auth SaaS or LLM dependencies in MVP.
- `web` owns presentation and client-side validation; `api` owns authoritative validation and business rules; database owns integrity constraints.
- HTTP handlers must not contain SQL. Persistence must remain in repository modules. Never expose DB credentials or trust a client-provided artist identity.
- Keep API endpoints under `/api/v1`. Preserve backward compatibility or explicitly version breaking changes.
- Use typed request/response DTOs; never expose internal database models directly.
- Only add abstractions when at least two concrete use cases justify them. Do not prebuild AI interfaces. Future AI must use the same application services and cannot bypass booking invariants.
- Never put secrets, personal data, client images, or production DB URLs in commits/logs. Treat tattoo photos as private data.
- UTC timestamps in persistence, explicit artist IANA timezone in scheduling. Enforce booking overlaps in PostgreSQL transactions/constraints.
- Never invent available time slots; booking flow is a **request**, not confirmed scheduling, until availability is implemented.

## Before coding
1. Read `docs/architecture.md` and `docs/adr/0001-modular-monolith.md`.
2. Read feature-specific skills in `.agents/skills/`.
3. Write acceptance criteria and the smallest behavior-level test first for nontrivial changes.
4. Keep diffs small and focused; explain any migration and compatibility impact.

## Required checks
- `npm --prefix apps/web run typecheck`, `npm --prefix apps/web run build`.
- `cargo fmt --manifest-path apps/api/Cargo.toml -- --check`
- `cargo clippy --manifest-path apps/api/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path apps/api/Cargo.toml`
- Validate migrations against real PostgreSQL before release. CI should fail on warnings.
- Never claim a check passed unless it was executed.

## Definition of done
- Accessible mobile UI including loading/error/success states.
- Server-side validation and error contracts.
- Tests for changed business rules.
- Documentation updated (ADR for changes in architectural direction).
- No placeholder functionality presented as real bookings.
