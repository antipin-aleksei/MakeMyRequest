# ADR 0002 — Mantine UI kit
Status: Accepted, 2026-11-17

## Decision
Use Mantine core and Mantine form with Vite. No custom design system or hand-built controls. Mantine provides accessible form primitives, responsive layout, notifications, and optionally a date picker. Add optional packages only when feature needs them.

## Alternatives
shadcn/ui provides highly customizable copied source but creates additional design/maintenance work. We prioritize assembled UX over bespoke visuals.
