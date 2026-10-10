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
| `emergency_members` | Qué hace una persona en una emergencia: rol (voluntario, coordinador) y fecha de aprobación. Un coordinador en Las Condes no lo es en otra emergencia. | PK (`emergency_id`, `user_id`) |
| `worksites` | Una casa afectada: ubicación (`geometry(Point, 4326)`), nivel de daño, personas vulnerables sí/no, catastro oficial aplicado sí/no (`official_survey_done`; FIBE en Chile), `source` (vecino, coordinador, redes), `unclaimed_since` (desde cuándo tiene trabajos abiertos y ninguno tomado; null si no tiene abiertos o si alguno está tomado), `version`. **Sin datos de contacto.** | GiST en ubicación; índice por (`emergency_id`, `unclaimed_since`) |
| `worksite_contacts` | Nombre, teléfono, dirección escrita, notas y consentimiento de avisos (`notify_channel`, `notify_consent_at`) de la casa. Separado a propósito: una consulta pública no puede traer contacto por descuido porque está en otra tabla. | PK = `worksite_id` |
| `work_types` | Catálogo de trabajos **de cada emergencia** (copiado de la plantilla de su tipo de desastre): clave, nombre por idioma, orden, `is_active`. Agregar uno es una fila; nunca se borra uno usado: se desactiva. | (`emergency_id`, `key`); las FK que lo apuntan son `ON DELETE RESTRICT` |
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
- **Inscribirse a un turno** sigue el orden del STYLEGUIDE (inscripción primero, cupo después, rollback si está lleno).
- **Ids generados por el cliente** (UUID) en `worksites` y `work_items`, para que el reintento no duplique.
- **Borrado de datos personales** al cerrar la emergencia, en una transacción: se borran sus filas de `worksite_contacts`, `contact_views`, `shift_signups`, `emergency_members` y `notifications`, y se anonimizan `claimed_by` y el autor en `work_items` y `work_item_events`. En `admin_events` de esa emergencia se anonimizan actor y objetivo y se conserva la acción. Después se borra todo `user` sin `platform_role` que ya no pertenezca a ninguna emergencia abierta, junto con sus `notification_preferences` y `push_subscriptions`; en las filas de `admin_events` que lo nombran (también las sin emergencia, como quitarle un rol) el actor u objetivo pasa a nulo (`ON DELETE SET NULL`) y la acción se conserva. Lo agregado (cuántas casas, cuántos trabajos, `shifts.filled`) se conserva.

## Consecuencias

- Un caso de uso nuevo (centros de acopio, donaciones, albergues) agrega tablas a esta misma base y referencia `emergencies`, `users` y `worksites`. No crea su propia base.
- El nombre de cada tabla y columna queda en inglés y no se renombra después.
