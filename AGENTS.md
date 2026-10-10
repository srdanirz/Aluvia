# Aluvia

Open-source platform to coordinate aid after a mudslide (aluvión): which homes are affected, what work each one needs, who has taken it, where volunteers are needed. Born from the 2026-10-08 Las Condes aluvión; the data model follows Crisis Cleanup (worksite → work items → claimed → status). Two maintainers, every change lands by PR with cross review. Next.js + Postgres/PostGIS on GCP.

## Before writing code

1. `docs/CODE_MAP.md`, then `grep -rin "<concept>" src`. If it exists, extend it.
2. `docs/STYLEGUIDE.md` for the layer you touch. `docs/AI_PITFALLS.md` before touching data access.
3. `docs/adr/` for decisions already made. Do not re-argue them without reading.

When you adopt a convention, hit a mistake twice, add a module or make a long-tail decision: update STYLEGUIDE, AI_PITFALLS, CODE_MAP or add an ADR in the same PR. One line is enough.

## Hard rules

- **Never commit to `main`.** Before creating a branch: `git switch main && git pull --ff-only`, then branch. Before asking for review: `git fetch origin main && git rebase origin/main`, rerun the checks, `git push --force-with-lease --force-if-includes`. A rebase after approval dismisses it (`main` requires branches up to date), so rebase right before review and merge right after approval. Never merge `main` into a branch. Workflow: `CONTRIBUTING.md`.
- **Public repo, personal data.** No data of affected people or volunteers (addresses, phones, names, RUTs) anywhere in the repo, including tests and fixtures. Public views never select contact fields. `SECURITY.md`.
- **No N+1.** No database `await` inside a loop or `Promise.all(rows.map(...))`. Every list query has a query-count test.
- **No race conditions.** Decisions are made by the database: conditional `UPDATE … WHERE … RETURNING`, constraints, `version` columns. Never read-then-write in TS. Every claim/sign-up operation has a concurrency test.
- **One central database.** Everything lives in the same Postgres and schema (`src/shared/db/schema/`). A new use case adds tables by migration and references the shared entities (`emergencies`, `users`, `worksites`, `work_items`); it never creates another database, a Firestore collection, a spreadsheet, or its own copy of people or homes. Reuse beats isolation: it is what keeps the product stable.
- **Notifications go through the outbox** (`docs/adr/0007-notificaciones.md`): insert into `notifications` in the same transaction as the change; never call a provider from an action. Emergency/evacuation alerts are out of scope (that is SENAPRED's SAE).
- **Observable by default** (`docs/adr/0008-observabilidad.md`): every feature ships its metrics, its product events from `src/shared/analytics/events.ts` and, if failure leaves someone without help, its alert. No personal data in events, metrics, logs or errors.
- **Pages never touch the database.** They call `features/<x>/server/`.

## UI: closed design system

Visual language and tokens: `docs/DESIGN.md` (adapted from General Intelligence Company via Refero). Read it before designing any screen.

**If it is not in `src/shared/ui/`, it does not exist.** Consistency beats speed here; there are no exceptions "just for this screen".

- Every visual piece comes from `src/shared/ui/`. Features compose primitives; they never restyle them.
- A missing primitive or variant is added to `src/shared/ui/` first (with a `cva` variant), in its own PR. Never a local one-off inside a feature.
- Forbidden outside `src/shared/ui/`: raw `<table>`, `<button>`, `<input>`, `<select>`, `<dialog>`; the `style` prop; Tailwind arbitrary values (`w-[37px]`, `bg-[#f00]`); the `!` modifier and `!important`; any color, radius, shadow or spacing that is not a token from `src/shared/ui/theme.css`.
- Tables are `DataTable`. Status colors come only from `StatusBadge`.
- **Light, dark and system themes** are part of the tokens. Components never use `dark:`; the tokens switch.
- **Phone, tablet (iPad) and desktop** are all first-class. Check every screen at 375, 768, 1024 and 1440 px, in both themes. Touch first: 44 px targets, nothing hover-only.
- **Translation-ready:** adding a language is adding `messages/<code>.json` plus one line in the locale registry. No concatenated sentences, no hardcoded locale in `Intl`, logical properties (`ms-`/`me-`) instead of left/right.
- If lint flags one of these, fix the design, never disable the rule.
- User-facing text through next-intl, neutral LATAM Spanish, no emojis, no em-dashes. Lucide icons.

## Language

Code, identifiers, comments and commits in English. Docs and UI in Spanish. Chilean domain terms stay in Spanish: `comuna`, `rut`, `fibe`.
