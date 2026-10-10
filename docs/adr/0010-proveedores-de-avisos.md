# 0010 · Proveedores de avisos: Web Push, Resend, Twilio y WhatsApp Cloud API

- **Estado:** aceptada. Completa [0007](0007-notificaciones.md).
- **Fecha:** 2026-10-10

## Contexto

ADR 0007 fija los cuatro canales y deja la elección de proveedores para un ADR propio. Cada canal entra por un adaptador con el mismo contrato (`features/notifications/channels/<canal>/`), así que cambiar de proveedor es cambiar un adaptador, no el worker.

## Decisión

| Canal | Proveedor | Costo a Chile | Por qué |
|---|---|---|---|
| Push | Web Push estándar con VAPID, paquete `web-push` | Gratis | Sin intermediario: el navegador entrega. Es el primer canal |
| Email | Resend (API REST) | 3.000 al mes gratis, después US$ 20 por 50.000 | API mínima, envía desde São Paulo. Postmark es el reemplazo si la entregabilidad falla |
| SMS | Twilio (API REST) | US$ 0,0797 por SMS enviado, US$ 0,0075 por recibido, número local US$ 10 al mes | El único con precio publicado para Chile, número local de dos vías (para recibir BAJA) y webhooks firmados |
| WhatsApp | WhatsApp Business Cloud API de Meta, directo (Graph API v26.0) | Plantilla de utilidad, unos US$ 0,02 | Twilio como intermediario suma US$ 0,005 por mensaje sin aportar nada que usemos |

Todos se llaman con `fetch` contra su API REST, sin SDK: son una o dos llamadas por canal y la firma de los webhooks se verifica en pocas líneas. Los clientes viven en `src/shared/messaging/` (`sendWebPush`, `sendEmail`, `sendSms`, `sendWhatsAppTemplate`) porque los usa también el login por código (ADR 0011); los adaptadores de `features/notifications/channels/` solo los envuelven.

### Links cortos

Todo aviso enlaza a `<APP_URL>/n/<id>`. Con el link completo (`/es/emergencies/<slug>/worksites/<uuid>`) un SMS no cabe en un segmento. El link corto además marca el aviso como leído (ADR 0007) en cualquier canal, y redirige a la página en el idioma del destinatario.

### Reglas por canal

- **Push:** una suscripción vencida (404 o 410 del servicio de push) se borra en el mismo lote. En iPhone y iPad solo funciona con la app instalada en la pantalla de inicio (iOS 16.4 o superior) y el permiso se pide tras un toque. `VAPID_SUBJECT` es un `mailto:` real: Apple rechaza `localhost`.
- **Email:** texto plano, asunto y cuerpo desde `messages/*.json`.
- **Entregado no es aceptado.** Twilio y Meta aceptan un mensaje y avisan después si no llegó (número sin WhatsApp, bloqueado, apagado). Se guarda su id (`provider_message_id`) y el webhook de cada uno llama a `markNotificationUndelivered`, que cierra el aviso y, si era WhatsApp, lo pasa a SMS. Twilio reporta en `POST /api/v1/webhooks/twilio` (`StatusCallback`); Meta manda los estados al mismo webhook que los mensajes entrantes, que es el del bot (#20).
- **SMS:** los números largos de Twilio en Chile **no permiten mensajes concatenados** y Twilio cambia el remitente alfanumérico por un número. Cada SMS cabe en un segmento GSM-7 (160 caracteres): el texto se translitera a GSM-7 (sin tildes) y un test exige que todo texto de SMS quepa con el link corto. Las respuestas BAJA llegan por webhook (`POST /api/v1/webhooks/twilio`), verificado con `X-Twilio-Signature` (HMAC-SHA1 de la URL y los parámetros, con el Auth Token).
- **WhatsApp:** fuera de la ventana de 24 h solo salen **plantillas aprobadas por Meta**, así que cada aviso que puede ir por WhatsApp tiene su plantilla de categoría utilidad, con el mismo nombre que su tipo y un parámetro: el link corto. Desde el 2026-10-01 Meta cobra también los mensajes dentro de la ventana, así que se presupuesta todo mensaje como pagado.
- **Si WhatsApp falla para siempre** (Meta bloquea el número, falta una plantilla, el proveedor no responde tras los reintentos o se agotó su tope diario), el aviso cae a SMS al mismo teléfono. El consentimiento de un vecino a WhatsApp cubre ese respaldo; un voluntario lo recibe solo si activó SMS. Si los dos canales se agotan, el aviso queda en `daily_cap_reached` y el panel del coordinador lo lista para llamar.

### Plantillas de WhatsApp a pedir

Se envían a aprobación antes del primer deploy, en `es` y `en`, categoría utilidad. Meta rechaza un parámetro al final del cuerpo, por eso cierran con una frase; la segunda frase también responde al caso de los falsos voluntarios que piden dinero (docs/investigacion/04-casos-borde.md).

| Nombre | Cuerpo en `es` | Cuerpo en `en` |
|---|---|---|
| `work_item_claimed` | Aluvia: un voluntario tomó un trabajo en tu casa. Ver detalle: {{1}} . Aluvia nunca pide dinero. | Aluvia: a volunteer took a job at your home. Details: {{1}} . Aluvia never asks for money. |
| `shift_cancelled` | Aluvia: tu turno se canceló. Ver detalle: {{1}} . Aluvia nunca pide dinero. | Aluvia: your shift was cancelled. Details: {{1}} . Aluvia never asks for money. |
| `shift_meeting_point_changed` | Aluvia: tu turno cambió de punto de encuentro. Ver detalle: {{1}} . Aluvia nunca pide dinero. | Aluvia: your shift has a new meeting point. Details: {{1}} . Aluvia never asks for money. |
| `work_item_reassigned` | Aluvia: un trabajo que tomaste fue reasignado. Ver detalle: {{1}} . Aluvia nunca pide dinero. | Aluvia: a job you took was reassigned. Details: {{1}} . Aluvia never asks for money. |

Un tipo nuevo de nivel importante suma su fila aquí en el mismo PR. El login por código usa una plantilla de categoría autenticación, que define ADR 0011.

### Configuración

Cada canal se activa con sus variables (`.env.example`). Un canal sin configurar no se registra y sus avisos terminan con `channel_unavailable`; una configuración a medias falla al arrancar. Así un fork puede funcionar solo con push.

## Consecuencias

- Tres terceros nuevos reciben datos personales: Resend (email), Twilio y Meta (teléfono). SECURITY.md los nombra. Resend guarda registros en EE. UU. aunque envíe desde São Paulo.
- El tope diario de SMS y WhatsApp por emergencia (ADR 0007, `emergency_settings`) es lo que acota el gasto: con el valor por defecto en 0, una emergencia nueva no manda mensajes pagados hasta que el admin lo configure.
- Un SMS sin tildes se lee peor, pero llega en un solo mensaje y cuesta uno.

## Referencias

- [Twilio: precios de SMS a Chile](https://www.twilio.com/en-us/sms/pricing/cl) y [reglas de Chile](https://www.twilio.com/en-us/guidelines/cl/sms)
- [Twilio: seguridad de webhooks](https://www.twilio.com/docs/usage/security)
- [WhatsApp: precios](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) y [cobro dentro de la ventana](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages)
- [Resend: regiones](https://resend.com/docs/dashboard/domains/regions)
- [Web Push en iOS y iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
