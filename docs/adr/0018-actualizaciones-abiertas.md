# 0018 · Cualquiera actualiza una casa, sin cuenta ni invitación

- **Estado:** aceptada
- **Fecha:** 2026-10-10
- **Reemplaza en parte:** ADR 0013 (quién actualiza una casa)

## Contexto

Actualizar "Personas e insumos" exigía ser coordinador o voluntario de terreno asignado a esa casa, y cambiar el estado de un trabajo exigía haberlo tomado. En terreno quien ve la casa es un vecino o un voluntario que llegó solo: pedirle un link de invitación o una cuenta hacía que el dato no llegara. La regla de producto es cero fricción (AGENTS.md).

## Decisión

1. **Cualquiera actualiza cualquier casa de una emergencia abierta**, con o sin sesión: personas trabajando e insumos que faltan (`POST /api/v1/emergencies/[slug]/worksites/[id]/updates`) y el estado de cada trabajo (`markWorkItemStatusAction`). `closed_duplicate` sigue siendo de coordinadores.
2. **Se mantienen los roles.** El coordinador conserva la cola de revisión, los contactos, zonas, centros de acopio, invitaciones y asignaciones. Las asignaciones de voluntarios de terreno siguen existiendo, pero son opcionales: ordenan quién se hace cargo, no dan permiso. Tomar un trabajo sigue exigiendo unirse a la emergencia.
3. **Controles contra abuso sin cuenta:**

| Control | Cómo |
|---|---|
| Límite de tasa | 120 envíos por IP y 30 por aparato cada 10 minutos, en `rate_limits` (`hitFieldWriteLimit`, `src/shared/anonymous-actor.ts`). Los coordinadores no tienen límite |
| Versión | Una actualización lleva `previousUpdateId`, la que vio quien la manda; si la casa cambió entretanto se responde `stale_version` (409). El estado de un trabajo ya usaba `version` |
| Historial | `worksite_updates` y `work_item_events` son de solo inserción. Cada fila guarda `device_key` e `ip_key` |
| Deshacer | Un coordinador oculta una actualización (`cancelled_at`; la casa vuelve a la anterior) o deshace el último cambio de estado de un trabajo (evento `status_reverted`) |

4. **Actor anónimo sin datos personales.** El aparato es una cookie `httpOnly` con un UUID al azar; la base guarda el HMAC de ese UUID y el de la IP con `RATE_LIMIT_SECRET`, nunca los valores. El coordinador ve solo los primeros 6 caracteres del HMAC del aparato, para distinguir una fuente de otra. La purga de la emergencia (ADR 0005) borra ambas claves.
5. La casa muestra "Actualizado hace X" en personas e insumos y en cada trabajo.

## Alternativas descartadas

- **Exigir login por teléfono para actualizar:** cuesta un mensaje por persona y la fricción hace que el conteo no llegue.
- **Moderación previa de cada cambio:** en una emergencia los coordinadores no alcanzan a revisar todo antes; deshacer después escala mejor.
- **Huella del navegador para identificar el aparato:** más difícil de evadir, pero es un dato personal según la Ley 21.719 y la cookie basta junto al límite por IP.

## Consecuencias

- La cookie se borra fácil: el límite por aparato frena al navegador común, el límite por IP es el piso real. Una red con CGNAT comparte su presupuesto.
- Una actualización encolada sin señal antes de este cambio llega sin `previousUpdateId` y se acepta sin chequeo de versión.
- Un cambio malicioso es visible hasta que un coordinador lo deshace. La métrica `aluvia.worksite_updates` (resultado y tipo de actor) y el evento `work_item_status_marked` (`isAnonymous`) muestran si eso pasa.
