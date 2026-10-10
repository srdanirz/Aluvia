# CODE_MAP

Índice de los módulos que existen. Antes de crear un archivo, léelo y corre `grep -rin "<concepto>" src`: si el concepto ya existe, se extiende, no se duplica. Cada módulo nuevo agrega su línea aquí en el mismo PR.

| Módulo | Qué hace |
|---|---|
| `src/app/[locale]/` | Rutas. El segmento `[locale]` es la raíz; las páginas solo componen |
| `src/app/[locale]/dev/ui/` | Catálogo vivo del design system |
| `src/app/[locale]/not-found.tsx`, `[...rest]/` | 404 en el idioma de la URL; la ruta catch-all la dispara para rutas desconocidas |
| `src/app/global-not-found.tsx` | 404 para URLs sin idioma, en el idioma por defecto |
| `src/proxy.ts` | Redirige al idioma del usuario (next-intl) |
| `src/shared/ui/` | Design system: `theme.css` (tokens, luces `glass-wash`/`glass-sheen`/`text-iridescent`, movimiento), `Button`, `IconButton`, `Chip`, `SegmentedControl`, `Card`, `GlassPanel`, `Aurora`, `Field`, `Input`, `Select`, `FileButton`, `Textarea`, `FormError`, `Section`, `DescriptionList`, `Label`, `ToggleTile` (elegir con un toque), `Stepper` (contar con más y menos), `Skeleton`, `Spinner`, `MapMarker`, `Logo`, `LogoMark` (figura animada, trazos en `logo-mark-paths.ts`), `FloatingNav`, `ThemeSwitcher`, `ThemeScript`; `fonts.ts`; `cn.ts` (tailwind-merge con nuestra escala). Se importa desde `@/shared/ui` |
| `src/features/map/` | Mapa público: `grid.ts` (grilla de agrupación por cuadras), `attention.ts` (nivel de atención, tono e ícono), `schemas.ts` (bbox y zoom), `server/` (`map-cells.ts` celdas por bbox, `map-emergency.ts` emergencia del mapa, `public-worksite.ts` ficha pública, `attention-level.ts` el nivel en SQL), `components/` (mapa, capa de casas y de zonas, panel de cuadra, ficha con cómo llegar y compartir). ADR 0011 |
| `src/app/[locale]/emergencies/[slug]/(map)/` | Mapa de la emergencia en el layout y la ficha pública de cada casa como panel |
| `src/app/api/v1/emergencies/[slug]/worksites/` | `GET ?bbox&zoom`: celdas del mapa |
| `src/shared/maps/` | Cargador único de Google Maps (`GoogleMapsProvider`, `MAP_ID`, `useGoogleMapsStatus`, `useMapColorScheme`) y `useTokenColors` (tokens para las capas del mapa) |
| `src/shared/i18n/` | Registro de idiomas (`locales.ts`), routing, navegación y carga de mensajes |
| `messages/*.json` | Textos por idioma; un test exige las mismas claves en todos |
| `src/shared/db/` | `client.ts` (única conexión), `types.ts` (`Database`, `Transaction`, `Executor`), `errors.ts` (SQLSTATE a códigos), `catalog.ts` (copia las plantillas de trabajos e insumos a una emergencia), `query-counter.ts` (tests de N+1), `metrics.ts` (conexiones de la base contra su máximo y saturación del pool de cada instancia, por una conexión propia) |
| `src/shared/db/schema/` | Una tabla por archivo (ADR 0005, 0009): `disaster-types`, `emergencies` (+ settings), `emergency-members`, `users`, `work-types`, `worksites` (+ contactos aparte), `work-items` (+ eventos), `supply-types`, `worksite-updates` (+ insumos que faltan), `rate-limits`, `shifts` (+ inscripciones), `emergency-notices` (aviso oficial), `notifications` (outbox, preferencias, push, uso diario de mensajes pagados), `audit`; `enums.ts` y `types.ts` (`LocalizedText`, `wgs84Point`, `multiPolygon`, `e164`, `localeTag`). Se importa desde `@/shared/db/schema` |
| `src/shared/db/seeds/` | Seeds revisados (ADR 0009): tipos de desastre, plantillas y la primera emergencia. `pnpm db:seed`, idempotente |
| `src/shared/lib/pagination.ts` | Paginación keyset: `Page`, `pageOf`, cursores por `(created_at, id)` |
| `src/shared/i18n/localized-text.ts`, `language-names.ts` | Leer un `jsonb` por idioma con respaldo; nombres de idiomas por `Intl` |
| `src/features/admin/` | Panel `/[locale]/admin` (ADR 0009): tipos de desastre y plantilla, emergencias (crear, configurar, área, aviso oficial, cerrar). `server/views.ts` carga cada vista; `findActiveNotice` es el aviso público que leen mapa y reporte |
| `src/app/[locale]/admin/` | Rutas del admin; solo componen `@/features/admin` |
| `scripts/` | Comandos de una vez con tsx: `seed.mts`, `admin-grant.mts` (`pnpm admin:grant <teléfono\|email>`) |
| `src/shared/i18n/messages.ts` | `loadMessages(locale)` y `matchLocale(tag)`: textos para escribirle a alguien en su idioma fuera de un request (avisos) |
| `src/shared/messaging/` | Clientes de proveedores de mensajes (ADR 0010): `sendWebPush`, `sendEmail` (Resend), `sendSms` y `verifyTwilioSignature` (Twilio), `sendWhatsAppTemplate` (Meta); `config.ts` (cada proveedor todo o nada), `gsm.ts` (SMS en un segmento) |
| `src/features/notifications/` | Avisos (ADR 0007): `catalog.ts` (tipos, nivel, destinatario, params), `enqueueNotification` en la transacción del cambio, worker `dispatchNotifications` (reclamo con `SKIP LOCKED`, horario silencioso, tope diario con reserva, reintentos, escalamiento), `channels/<canal>/` (registro de adaptadores), links cortos `/n/<id>`, respaldo de WhatsApp a SMS, `markNotificationUndelivered` (fallas que el proveedor reporta después), `cancelPendingNotifications`, `listUndeliveredNeighborNotices` (vecinos a llamar), suscripciones push, baja por SMS |
| `src/app/api/v1/notifications/dispatch/` | Worker del outbox, llamado por Cloud Scheduler con token |
| `src/app/api/v1/webhooks/twilio/` | Estado de entrega de nuestros SMS y SMS entrantes: BAJA apaga el SMS de ese teléfono |
| `src/app/n/[id]/` | Link corto de un aviso: marca leído y redirige |
| `public/sw.js` | Service worker: muestra los push y abre su link |
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
| `tests/notifications/` | Entrega única, dos workers en paralelo, lease, reintentos, horario silencioso, topes con reserva, escalamiento, proveedores y textos |
| `tests/schema.test.ts` | Las reglas que decide la base: FKs por emergencia, cupo de turnos, una inscripción activa, un aviso por evento |
