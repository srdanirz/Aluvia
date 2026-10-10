# CODE_MAP

Índice de los módulos que existen. Antes de crear un archivo, léelo y corre `grep -rin "<concepto>" src`: si el concepto ya existe, se extiende, no se duplica. Cada módulo nuevo agrega su línea aquí en el mismo PR.

| Módulo | Qué hace |
|---|---|
| `src/app/[locale]/` | Rutas. El segmento `[locale]` es la raíz; las páginas solo componen |
| `src/app/[locale]/dev/ui/` | Catálogo vivo del design system |
| `src/app/[locale]/not-found.tsx`, `[...rest]/` | 404 en el idioma de la URL; la ruta catch-all la dispara para rutas desconocidas |
| `src/app/global-not-found.tsx` | 404 para URLs sin idioma, en el idioma por defecto |
| `src/proxy.ts` | Redirige al idioma del usuario (next-intl) |
| `src/shared/ui/` | Design system: `theme.css` (tokens, luces `glass-wash`/`glass-sheen`/`text-iridescent`, movimiento), `Button`, `IconButton`, `Chip`, `SegmentedControl`, `Card`, `GlassPanel`, `Aurora`, `Field`, `Input`, `Select`, `FileButton`, `Textarea`, `FormError`, `Section`, `DescriptionList`, `Label`, `ToggleTile` (elegir con un toque), `Stepper` (contar con más y menos), `Skeleton`, `Spinner`, `Logo`, `LogoMark` (figura animada, trazos en `logo-mark-paths.ts`), `FloatingNav`, `ThemeSwitcher`, `ThemeScript`; `fonts.ts`; `cn.ts` (tailwind-merge con nuestra escala). Se importa desde `@/shared/ui` |
| `src/shared/i18n/` | Registro de idiomas (`locales.ts`), routing, navegación y carga de mensajes |
| `messages/*.json` | Textos por idioma; un test exige las mismas claves en todos |
| `src/shared/db/` | `client.ts` (única conexión), `types.ts` (`Database`, `Transaction`, `Executor`), `errors.ts` (SQLSTATE a códigos), `catalog.ts` (copia las plantillas de trabajos e insumos a una emergencia), `query-counter.ts` (tests de N+1), `metrics.ts` (conexiones de la base contra su máximo y saturación del pool de cada instancia, por una conexión propia) |
| `src/shared/db/schema/` | Una tabla por archivo (ADR 0005, 0009): `disaster-types`, `emergencies` (+ settings), `emergency-members`, `users`, `work-types`, `worksites` (+ contactos aparte), `work-items` (+ eventos), `supply-types`, `worksite-updates` (+ insumos que faltan), `rate-limits`, `shifts` (+ inscripciones), `emergency-notices` (aviso oficial), `notifications` (outbox, preferencias, push), `audit`; `enums.ts` y `types.ts` (`LocalizedText`, `wgs84Point`, `multiPolygon`, `e164`, `localeTag`). Se importa desde `@/shared/db/schema` |
| `src/shared/db/seeds/` | Seeds revisados (ADR 0009): tipos de desastre, plantillas y la primera emergencia. `pnpm db:seed`, idempotente |
| `src/shared/lib/pagination.ts` | Paginación keyset: `Page`, `pageOf`, cursores por `(created_at, id)` |
| `src/shared/i18n/localized-text.ts`, `language-names.ts` | Leer un `jsonb` por idioma con respaldo; nombres de idiomas por `Intl` |
| `src/features/admin/` | Panel `/[locale]/admin` (ADR 0009): tipos de desastre y plantilla, emergencias (crear, configurar, área, aviso oficial, cerrar). `server/views.ts` carga cada vista; `findActiveNotice` es el aviso público que leen mapa y reporte |
| `src/app/[locale]/admin/` | Rutas del admin; solo componen `@/features/admin` |
| `scripts/` | Comandos de una vez con tsx: `seed.mts`, `admin-grant.mts` (`pnpm admin:grant <teléfono\|email>`) |
| `src/shared/env.ts` | Variables de entorno validadas con zod al arrancar |
| `src/shared/public-env.ts` | Variables `NEXT_PUBLIC_` que lee el navegador, sin zod; `next.config.ts` las valida en el build |
| `src/instrumentation.ts`, `src/instrumentation-client.ts` | Arranque de la observabilidad en servidor y navegador (ADR 0008) |
| `src/shared/observability/` | `server.ts` (OpenTelemetry, Prometheus, Sentry del servidor), `metrics.ts` (`meter`, métricas por request), `logger.ts` (logs JSON con trace), `redact.ts` (filtro de datos personales), `sentry.ts` (opciones y `beforeSend` compartidos) |
| `src/shared/analytics/` | `events.ts` (catálogo único de eventos), `client.ts` (`track`, `identifyUser`, `resetAnalytics`), `server.ts` (`trackServerEvent`), `redact-capture.ts` (`before_send` de PostHog) |
| `src/features/worksites/` | Reportar una casa sin cuenta (`/emergencies/[slug]/worksites/new`), carga en lote de coordinadores con Claude (`worksites/batch`), poner el pin con aviso de duplicado a 15 m, marcas de revisión y riesgo de entrada. `server/create-worksites.ts` es la única escritura de casas nuevas (formulario, lote, WhatsApp, importación oficial). API: `POST /api/v1/emergencies/[slug]/worksites` |
| `src/features/worksite-updates/` | Personas trabajando e insumos que faltan por casa, historial append-only (`worksites/[id]/updates/new`, `POST .../worksites/[id]/updates`); `listCurrentWorksiteUpdates` da el estado actual de N casas en una consulta |
| `src/shared/offline/` | Cola de envíos que sobrevive sin señal y a un deploy (`outbox.ts`, `OutboxSync` en el layout), borradores en el teléfono (`usePersistedState`), compartir link |
| `src/shared/rate-limit.ts` | `hitRateLimit` (contador atómico en `rate_limits`) y `clientIpKey` (HMAC de la IP, nunca la IP) |
| `src/shared/http.ts` | Respuestas de error `{ code, details }` y lectura de cuerpos JSON con zod para `/api/v1` |
| `src/shared/i18n/use-error-message.ts` | Traduce un código de error del servidor; uno desconocido cae en `errors.unknown` |
| `src/shared/db/catalog.ts` | Copia las plantillas de trabajos e insumos del tipo de desastre al crear una emergencia |
| `src/shared/db/sql-array.ts` | Un arreglo tipado como un solo parámetro (`unnest`, `= ANY`) |
| `drizzle/` | Migraciones generadas y revisadas en PR |
| `tests/setup/` | PostGIS en testcontainers y `createTestDb()` con contador de consultas |
| `tests/setup/fixtures.ts` | Emergencia de prueba con catálogo inventado y `rejectionCode` |
| `tests/admin.test.ts` | Admin: concurrencia de ediciones, cierre y aviso; seeds; `admin_events` de solo inserción; conteo de consultas y cursor |
| `tests/schema.test.ts` | Las reglas que decide la base: FKs por emergencia, cupo de turnos, una inscripción activa, un aviso por evento |
