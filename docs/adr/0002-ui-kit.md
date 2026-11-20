# ADR 0002 — shadcn/ui + Tailwind CSS
Status: Supersedes Mantine decision, 2026-11-17

## Decision
Use shadcn/ui (new-york preset), Tailwind CSS v4, React 19 and Vite. UI source components live in `apps/web/src/components/ui/`; no Mantine runtime dependency. Components can be added with `npx shadcn@latest add <component>` from `apps/web/`.

## Rationale
Own the component code, get ready-made accessible primitives, keep mobile-first flexibility, avoid custom component library. Apply Tailwind design tokens in `src/index.css`, not ad hoc colors across every screen.

## Tradeoffs
Unlike Mantine, shadcn/ui components become our source and must be reviewed and kept updated. Prefer official registry CLI for additions. App forms and accessibility remain our responsibility.

## Alternatives
Mantine (previous choice), HeroUI, Ant Design. Explicit product decision: shadcn/ui.
