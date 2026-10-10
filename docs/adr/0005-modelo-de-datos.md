# 0005 · Modelo de datos inicial

- **Estado:** propuesta, se cierra con el PR del primer schema
- **Fecha:** 2026-10-10

## Contexto

Necesitamos registrar casas afectadas, lo que necesita cada una, quién lo tomó y los turnos de voluntarios, en **una sola base centralizada** (Postgres + PostGIS en Cloud SQL, ADR 0002) que sirva para esta emergencia y las siguientes. El modelo sigue a Crisis Cleanup: casa → trabajos → tomado → estado.

## Decisión

Tablas en `src/shared/db/schema/`, un archivo por entidad. Todas las de dominio llevan `emergency_id`.

| Tabla | Qué guarda | Claves |
|---|---|---|
| `emergencies` | Cada desastre: nombre, comunas, área (`geometry(MultiPolygon, 4326)`), estado, fecha de borrado de datos personales. | |
| `users` | Una persona: nombre, email, teléfono. Cruza emergencias. | email único |
| `emergency_members` | Qué hace una persona en una emergencia: rol (voluntario, coordinador) y fecha de aprobación. Un coordinador en Las Condes no lo es en otra emergencia. | PK (`emergency_id`, `user_id`) |
| `worksites` | Una casa afectada: ubicación (`geometry(Point, 4326)`), nivel de daño, personas vulnerables sí/no, FIBE aplicada sí/no, `version`. **Sin datos de contacto.** | GiST en ubicación |
| `worksite_contacts` | Nombre, teléfono, dirección escrita y notas de la casa. Separado a propósito: una consulta pública no puede traer contacto por descuido porque está en otra tabla. | PK = `worksite_id` |
| `work_types` | Catálogo de tipos de trabajo (barro, agua, techo, comida…): clave, clave de traducción, orden. Agregar un tipo es una fila, no código. | clave |
| `work_items` | Un trabajo de una casa: tipo, estado, `claimed_by`, verificado por/cuándo, `version`. | índice por (`emergency_id`, `status`) |
| `work_item_events` | Historial append-only: quién cambió qué estado y cuándo. Nunca se edita. | |
| `shifts` | Turnos: punto de encuentro, inicio, fin, `capacity`, `filled`, tipo de trabajo opcional. | `CHECK (filled <= capacity)` |
| `shift_signups` | Inscripción de un voluntario a un turno. Cancelar marca `cancelled_at`, no borra. | único parcial (`shift_id`, `user_id`) `WHERE cancelled_at IS NULL` |
| `contact_views` | Registro de cada vez que un coordinador ve un contacto. Lleva `emergency_id`. | |

## Reglas que el modelo garantiza

- **Tomar un trabajo** es un `UPDATE` condicional sobre `work_items` (`claimed_by IS NULL`), con su evento en la misma transacción.
- **Inscribirse a un turno** sigue el orden del STYLEGUIDE (inscripción primero, cupo después, rollback si está lleno).
- **Ids generados por el cliente** (UUID) en `worksites` y `work_items`, para que el reintento no duplique.
- **Borrado de datos personales** al cerrar la emergencia, en una transacción: se borran sus filas de `worksite_contacts`, `contact_views`, `shift_signups` y `emergency_members`, y se anonimizan `claimed_by` y el autor en `work_items` y `work_item_events`. Después se borra todo `user` que ya no pertenezca a ninguna emergencia abierta. Lo agregado (cuántas casas, cuántos trabajos, `shifts.filled`) se conserva.

## Consecuencias

- Un caso de uso nuevo (centros de acopio, donaciones, albergues) agrega tablas a esta misma base y referencia `emergencies`, `users` y `worksites`. No crea su propia base.
- El nombre de cada tabla y columna queda en inglés y no se renombra después.
