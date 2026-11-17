# ADR 0001 — Modular monolith and PostgreSQL
Status: Accepted, 2026-11-17

## Context
One-person tattoo artist app needs structured consultations, extensible JSON answers and eventually robust appointment conflict checks.

## Decision
React/TS/Vite/Mantine SPA plus one Rust/Axum API; PostgreSQL with JSONB; SQLx; feature-oriented module boundaries; REST v1. Run as two deployable components (static web and one API), not microservices. No AI at this stage.

## Consequences
Small operational footprint and strong transactional integrity. API is authoritative. Dynamic forms can evolve using versioned JSON and migration rules. Do not prematurely introduce repositories for every table; use explicit repository functions. Revisit if measured scale or feature requirements warrant changes.
