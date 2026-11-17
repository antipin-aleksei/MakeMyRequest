# Frontend skill — shadcn/ui

- React functional components, strict TypeScript, Vite, shadcn/ui and Tailwind CSS v4. Mantine is forbidden.
- Follow `docs/adr/0002-ui-kit.md`. Add components using official CLI `cd apps/web && npx shadcn@latest add <name>`; review generated source.
- Primitives live in `src/components/ui/`. Keep application state and business flow outside primitives.
- Prefer shadcn Button, Card, Input, Textarea, Label, Field, Select and Checkbox where relevant. Use design tokens from `src/index.css` and `cn`, avoid per-page custom CSS.
- Support mobile width 320px, WebView safe areas and keyboard navigation. Provide visible field labels, errors, progress and disabled/loading states.
- Client validation is only UX; API is authoritative. API calls live in typed client modules, not visual primitives.
- Never show mocked availability as live, and never call a session request confirmed.
- Check with `npm run typecheck` and `npm run build` before declaring complete.
