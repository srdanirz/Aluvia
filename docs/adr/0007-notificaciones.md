# 0007 · Notificaciones

- **Estado:** aceptada. Los proveedores de SMS y WhatsApp se eligen en un ADR propio antes de implementar notificaciones.
- **Fecha:** 2026-10-10

## Contexto

Una coordinación que depende de que la gente abra la app no funciona: el voluntario tiene que saber que su turno cambió, y el vecino, que alguien tomó su trabajo. Pero en Las Condes no todos tienen datos móviles o la app instalada, y no todo aviso vale lo mismo. Un SMS cuesta dinero; una notificación push no.

## Lo que Aluvia NO hace

**Alertas de evacuación o de riesgo vital.** Esas las emite el Estado: el Sistema de Alertas de Emergencia (SAE) de SENAPRED llega a todos los celulares de la zona. Aluvia no compite con ese canal ni lo imita; como mucho enlaza a la fuente oficial. Un aviso falso o atrasado nuestro en ese tema puede costar vidas.

## Decisión

### Niveles

| Nivel | Ejemplos | Canales | Horario |
|---|---|---|---|
| **Importante** | Tu turno se canceló o cambió de punto de encuentro · Tomaron el trabajo de tu casa · Un trabajo que tomaste fue reasignado | Push, y SMS o WhatsApp si no hay push o no se leyó en 15 min | Cualquier hora |
| **Recordatorio de turno** | Tu turno empieza en 2 h | Push y email | Exento del horario silencioso; si el turno empieza antes de las 10:00, se manda la noche anterior a las 20:00 |
| **Normal** | Tu trabajo quedó hecho · Hay un turno nuevo cerca | Push y email | Sin avisos entre 22:00 y 8:00 |
| **Resumen** | Coordinador: casas nuevas sin atender en su zona | Email diario o push agrupado | Una vez al día |

"Leído" es abrir la notificación o abrir la app después de recibirla; queda en `read_at`. El reintento por otro canal se programa con `not_before`.

El nivel lo define el **tipo de evento** en el código, no quien lo envía: nadie puede mandar un "importante" a mano para que llegue más fuerte.

### Canales, en orden de llegada

1. **Push web** desde la PWA. Gratis. En iPhone y iPad solo funciona si la app está instalada en la pantalla de inicio (iOS 16.4 o superior), así que la pantalla de instalación lo explica.
2. **Email.** Barato, para lo normal y los resúmenes.
3. **SMS y WhatsApp.** Pagados, solo para lo **importante**. Llegan a quien no tiene la app ni datos. WhatsApp exige plantillas aprobadas por Meta, así que cada mensaje importante se redacta y se aprueba antes de necesitarlo.

### Arquitectura

- **Outbox en la base central** (ADR 0005, misma base): la acción que genera el aviso inserta una fila en `notifications` **en la misma transacción** que el cambio. Si la transacción se cae, no sale ningún aviso; si se confirma, el aviso no se pierde.
- **Entrega al menos una vez, deduplicada por nosotros.** Un worker (Cloud Run Job o Cloud Tasks) reclama pendientes en una transacción corta: `UPDATE … SET claimed_at = now(), attempts = attempts + 1` sobre filas elegidas con `FOR UPDATE SKIP LOCKED` (sin enviar, con `not_before` vencido y sin reclamo vigente). Hace commit, llama al proveedor **fuera de la transacción** y marca `sent_at`. Si el worker muere entre el envío y el `sent_at`, el reclamo vence y el aviso puede salir dos veces: es el costo de no perder ninguno.
- **Sin duplicados por evento:** `UNIQUE NULLS NOT DISTINCT (event_key, user_id, worksite_id, channel)` en `notifications`. El mismo evento no genera dos filas para la misma persona y canal, y eso es lo que garantiza "un solo SMS por evento y persona". Los proveedores (Twilio, WhatsApp Cloud API, Web Push) no ofrecen claves de idempotencia en las que apoyarse.
- **Un adaptador por canal** en un registro (`features/notifications/channels/<canal>/`), con el mismo contrato: `send(notification) → { ok } | { ok: false, code, retryable }`. Agregar un canal no toca nada central.
- Reintentos con backoff solo si `retryable`.
- Tablas nuevas, en la misma base (ADR 0005): `notifications` (outbox, con `emergency_id`), y `notification_preferences` y `push_subscriptions`, que son del usuario, cruzan emergencias y se borran con él.

### Destinatarios

- **Voluntarios y coordinadores** son `users`: tienen preferencias y suscripción push.
- **El vecino de una casa** no es un `user`: su contacto vive en `worksite_contacts`. Al reportar, marca si quiere recibir avisos sobre su casa y por qué canal (`notify_channel`, `notify_consent_at`). Sin esa marca no recibe nada. Como no tiene cuenta ni push, sus avisos van por SMS o WhatsApp.
- `notifications` apunta a un `user_id` o a un `worksite_id`, nunca a los dos (`CHECK`).

### Consentimiento y datos personales

- Cada canal es **opt-in** y se puede apagar desde la app o respondiendo BAJA al SMS.
- El texto del aviso no lleva dirección ni teléfono de nadie: dice qué pasó y enlaza a la app, donde se verifica el permiso.
- Los teléfonos se guardan en formato E.164 y se borran con el resto de los datos personales al cerrar la emergencia.
- Se respeta el idioma del usuario: los textos salen de `messages/*.json`, como el resto de la UI.

### Costos

- Tope diario de SMS y WhatsApp por emergencia, configurable, con una **reserva para vecinos sin app** (que no tienen otro canal). Al llegar al tope, voluntarios y coordinadores siguen por push y email; los vecinos usan la reserva, y si también se agota, el panel del coordinador lista sus avisos pendientes para llamarlos por teléfono.
- Un solo SMS por evento y persona, aunque el evento se repita.

## Canales

Los cuatro canales (push, email, SMS y WhatsApp) entran juntos: el vecino sin app es justamente quien más necesita el aviso. Las plantillas de WhatsApp se envían a aprobación antes del primer deploy.

## Consecuencias

- SMS y WhatsApp tienen costo desde el primer aviso; el tope diario (Costos) lo acota.
- El outbox en la misma transacción obliga a que las acciones que notifican pasen por `features/<x>/server/actions.ts`, que es lo que ya pide el STYLEGUIDE.
