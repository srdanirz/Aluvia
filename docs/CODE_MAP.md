# CODE_MAP

Índice de los módulos que existen. Antes de crear un archivo, léelo y corre `grep -rin "<concepto>" src`: si el concepto ya existe, se extiende, no se duplica. Cada módulo nuevo agrega su línea aquí en el mismo PR.

| Módulo | Qué hace |
|---|---|
| `src/app/[locale]/` | Rutas. El segmento `[locale]` es la raíz; las páginas solo componen |
| `src/app/[locale]/dev/ui/` | Catálogo vivo del design system |
| `src/app/[locale]/not-found.tsx`, `[...rest]/` | 404 en el idioma de la URL; la ruta catch-all la dispara para rutas desconocidas |
| `src/app/global-not-found.tsx` | 404 para URLs sin idioma, en el idioma por defecto |
| `src/proxy.ts` | Redirige al idioma del usuario (next-intl) |
| `src/shared/ui/` | Design system: `theme.css` (tokens, luces `glass-wash`/`glass-sheen`/`text-iridescent`, movimiento), `Button`, `IconButton`, `Chip`, `SegmentedControl`, `Card`, `GlassPanel`, `Aurora`, `Field`, `Input`, `Label`, `Skeleton`, `Spinner`, `FloatingNav`, `ThemeSwitcher`, `ThemeScript`; `fonts.ts`; `cn.ts` (tailwind-merge con nuestra escala). Se importa desde `@/shared/ui` |
| `src/shared/i18n/` | Registro de idiomas (`locales.ts`), routing, navegación y carga de mensajes |
| `messages/*.json` | Textos por idioma; un test exige las mismas claves en todos |
| `src/shared/db/` | `client.ts` (única conexión), `schema/` (tablas, ADR 0005), `query-counter.ts` (tests de N+1) |
| `src/shared/env.ts` | Variables de entorno validadas con zod al arrancar |
| `drizzle/` | Migraciones generadas y revisadas en PR |
| `tests/setup/` | PostGIS en testcontainers y `createTestDb()` con contador de consultas |
