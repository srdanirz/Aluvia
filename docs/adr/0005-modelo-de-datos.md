# 0005 · Modelo de datos inicial

- **Estado:** propuesta, se cierra con el PR del primer schema
- **Fecha:** 2026-10-10

## Contexto

Necesitamos registrar casas afectadas, lo que necesita cada una, quién lo tomó y los turnos de voluntarios, en **una sola base centralizada** (Postgres + PostGIS en Cloud SQL, ADR 0002) que sirva para esta emergencia y las siguientes. El modelo sigue a Crisis Cleanup: casa → trabajos → tomado → estado.

## Decisión

Tablas en `src/shared/db/schema/`, un archivo por entidad. Todas las de dominio llevan `emergency_id`, salvo las que son de la persona y cruzan emergencias (`users`, `notification_preferences`, `push_subscriptions`), los registros globales (`disaster_types`, `disaster_type_work_types`) y `admin_events`, cuyo `emergency_id` es nulo en acciones que no son de una emergencia (editar tipos de desastre, otorgar `platform_role`).

| Tabla | Qué guarda | Claves |
|---|---|---|
| `emergencies` | Cada desastre: `slug`, tipo (`disaster_type_key`), nombre por idioma, `default_locale`, `time_zone` (IANA, por ejemplo `America/Santiago`), comunas, área (`geometry(MultiPolygon, 4326)`), estado, `started_at`, `closed_at`, fecha de borrado de datos personales. | `slug` único |
| `disaster_types` | Registro de tipos de desastre: clave, nombre por idioma. ADR 0009. | `key` |
| `disaster_type_work_types` | Plantilla de trabajos de cada tipo: clave, nombre por idioma, orden. Se copia a `work_types` al crear una emergencia. | (`disaster_type_key`, `key`) |
| `emergency_settings` | Topes de SMS y WhatsApp, reserva para vecinos sin app (ADR 0007), parámetros de avisos, contacto oficial y nombre del catastro oficial del país (`official_survey_name`, "FIBE" en Chile). ADR 0009. | PK `emergency_id` |
| `admin_events` | Registro append-only de cada acción del admin: actor, acción, objetivo, `emergency_id` opcional, `created_at`. ADR 0009. | |
| `users` | Una persona: nombre, email, teléfono, `platform_role` (`admin` o nulo). Cruza emergencias. | email único |
| `emergency_members` | Qué hace una persona en una emergencia: rol otorgado (voluntario, voluntario de terreno, coordinador), rol pedido en espera y quién lo aprobó. Un coordinador en Las Condes no lo es en otra emergencia. ADR 0013. | PK (`emergency_id`, `user_id`) |
| `worksites` | Una casa afectada: ubicación (`geometry(Point, 4326)`), nivel de daño, personas vulnerables sí/no, catastro oficial aplicado sí/no (`official_survey_done`; FIBE en Chile), `source` (vecino, coordinador, redes), `unclaimed_since` (desde cuándo tiene trabajos abiertos y ninguno tomado; null si no tiene abiertos o si alguno está tomado), `review_flags` (por qué la mira un coordinador: `outside_area`, `imprecise_location` (GPS de más de 100 m), `possible_duplicate`, `person_in_danger`; las calcula la base al escribir), `hazards` (no entrar: `electricity`, `gas`, `structure`) con `hazards_reviewed_at/by`, `version`. La ubicación es **nula** mientras nadie pone el pin (reporte solo con dirección, ADR 0006; borrador del lote); el mapa público no la muestra. **Sin datos de contacto.** | GiST en ubicación y en `(location::geography)` para distancias en metros; índice por (`emergency_id`, `unclaimed_since`); índice parcial de la cola de revisión |
| `worksite_updates` | Foto de terreno de una casa: cuántas personas trabajan ahora (`people_present`, 0 a 500) y quién lo reportó. Siempre el total, nunca un delta; append-only. Un error se anula con `cancelled_at`, no se edita. El estado actual es la última fila no anulada (issue #15). | índice parcial (`worksite_id`, `created_at DESC`) `WHERE cancelled_at IS NULL` |
| `worksite_update_supplies` | Insumos que faltan según ese update (FK compuesta al catálogo de la emergencia). | PK (`update_id`, `supply_type_key`) |
| `supply_types` / `disaster_type_supply_types` | Catálogo de insumos (palas, agua, guantes) de cada emergencia y su plantilla por tipo de desastre, igual que los trabajos. | (`emergency_id`, `key`) |
| `rate_limits` | Contadores de ventana fija de los endpoints públicos, compartidos entre instancias. La clave lleva un HMAC de la IP, nunca la IP. Las ventanas vencidas se purgan en lotes acotados. | PK `key`; índice en `window_started_at` |
| `worksite_contacts` | Nombre, teléfono, dirección escrita, notas y consentimiento de avisos (`notify_channel`, `notify_consent_at`) de la casa. Separado a propósito: una consulta pública no puede traer contacto por descuido porque está en otra tabla. | PK = `worksite_id` |
| `work_types` | Catálogo de trabajos **de cada emergencia** (copiado de la plantilla de su tipo de desastre): clave, nombre por idioma, orden, `is_active`. Agregar uno es una fila; nunca se borra uno usado: se desactiva. | (`emergency_id`, `key`); las FK que lo apuntan son `NO ACTION DEFERRABLE INITIALLY DEFERRED`: un tipo usado no se borra, y borrar la emergencia completa no depende del orden de la cascada |
| `work_items` | Un trabajo de una casa: tipo (FK compuesta `(emergency_id, work_type_key)` a `work_types`, así no puede apuntar al catálogo de otra emergencia), estado, `claimed_by`, verificado por/cuándo, `version`. | índice por (`emergency_id`, `status`) |
| `work_item_events` | Historial append-only: quién cambió qué estado y cuándo. Nunca se edita. | |
| `shifts` | Turnos: punto de encuentro, inicio, fin, `capacity`, `filled`, tipo de trabajo opcional (misma FK compuesta). | `CHECK (filled <= capacity)` |
| `shift_signups` | Inscripción de un voluntario a un turno. Cancelar marca `cancelled_at`, no borra. | único parcial (`shift_id`, `user_id`) `WHERE cancelled_at IS NULL` |
| `contact_views` | Registro de cada vez que un coordinador ve un contacto. Lleva `emergency_id`. | |
| `notifications` | Outbox de avisos (ADR 0007): evento, destinatario (`user_id` o `worksite_id`), canal, `not_before`, `claimed_at`, `attempts`, `sent_at`, `read_at`. | `UNIQUE NULLS NOT DISTINCT (event_key, user_id, worksite_id, channel)` |
| `notification_preferences` | Canales y horario de avisos por usuario. | PK `user_id` |
| `push_subscriptions` | Endpoint y claves de push web de cada dispositivo. | endpoint único |

## Reglas que el modelo garantiza

- **Tomar un trabajo** es un `UPDATE` condicional sobre `work_items` (`claimed_by IS NULL`), con su evento y la actualización de `worksites.unclaimed_since` en la misma transacción. Lo mismo al soltar, cerrar o crear un trabajo: toda escritura en `work_items` recalcula `unclaimed_since` de su casa en la misma transacción. Así la prioridad por abandono se ordena con un índice, sin subconsultas por casa.
- **La reserva vence** (issue #12). "Voy para allá" deja `claim_expires_at = now() + emergency_settings.claim_hold_minutes` (120 por defecto, de 1 a 1440, se edita en el admin). Marcar Llegué la borra; "Sigo en camino" la corre mientras siga vigente. Un barrido cada minuto (`POST /api/v1/work-items/release-expired`, `FOR UPDATE SKIP LOCKED`) devuelve las vencidas a `open_unclaimed`, y tomar acepta también una vencida que el barrido no alcanzó a soltar. `CHECK`: solo un `open_claimed` con dueño tiene vencimiento.
- **`work_item_events.kind`** distingue lo que cambia el estado (`status_changed`, `claimed`, `released`, `expired`) de lo que lo mantiene (`arrived`, `renewed`, `verified`). Por defecto `status_changed`, así las escrituras que no lo nombran siguen valiendo. Es append-only por trigger (`drizzle/0011`): solo se anonimiza `actor_id` y solo se borra en cascada con su trabajo o su emergencia.
- Tomar, soltar y vencer no borran el progreso: un trabajo en `open_partially_done` u `open_needs_follow_up` conserva ese estado con o sin dueño.
- **Una casa con riesgo de entrada no se toma**: el `UPDATE` condicional de tomar incluye `worksiteAcceptsClaims` (`hazards` vacío o revisado por un coordinador).
- **Un reporte nunca se rechaza por sospechoso**: punto fuera del área, otra casa a menos de 15 m o una persona en peligro dejan una marca en `review_flags` para el coordinador.
- **Inscribirse a un turno** sigue el orden del STYLEGUIDE (inscripción primero, cupo después, rollback si está lleno).
- **Ids generados por el cliente** (UUID) en `worksites` y `work_items`, para que el reintento no duplique.
- **Borrado de datos personales** al cerrar la emergencia, en una transacción: se borran sus filas de `worksite_contacts`, `contact_views`, `rate_limits` (toda la tabla, que es transitoria), `shift_signups`, `emergency_members` (y con ellas `worksite_assignments`), `invitations`, `notifications` y `emergency_notices` (un aviso pudo publicar un dato personal por error, ADR 0015), y se anonimizan `claimed_by` y el autor en `work_items` y `work_item_events`, y `reported_by`, `cancelled_by` y `hazards_reviewed_by` en `worksite_updates` y `worksites`. En `admin_events` de esa emergencia se anonimizan actor y objetivo y se conserva la acción. Después se borra todo `user` sin `platform_role` que ya no pertenezca a ninguna emergencia abierta ni tenga trabajos tomados en una (tomar un trabajo exige ser miembro de la emergencia), junto con sus `notification_preferences`, `push_subscriptions` y `sessions`; en las filas de `admin_events` que lo nombran (también las sin emergencia, como quitarle un rol) el actor u objetivo pasa a nulo (`ON DELETE SET NULL`) y la acción se conserva. Lo agregado (cuántas casas, cuántos trabajos, `shifts.filled`) se conserva. Lo hace `purgeEmergencyPersonalData` (`src/shared/db/purge.ts`), solo sobre una emergencia cerrada, y lo dispara un administrador desde la ficha de la emergencia cerrada (`features/admin`); quien tiene un trabajo tomado en otra emergencia todavía sin purgar se borra con la purga de esa; un test lista las FK a `users` de la base y falla si una tabla nueva no está en la purga.

## Consecuencias

- Un caso de uso nuevo (centros de acopio, donaciones, albergues) agrega tablas a esta misma base y referencia `emergencies`, `users` y `worksites`. No crea su propia base.
- El nombre de cada tabla y columna queda en inglés y no se renombra después.
