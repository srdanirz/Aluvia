# 0013 · Login sin contraseña por teléfono y roles por emergencia

- **Estado:** propuesta, se cierra con el PR de #16
- **Fecha:** 2026-10-10
- **Reemplazada en parte por:** ADR 0018 (cualquiera actualiza una casa; la asignación ya no da permiso)

## Contexto

Tomar un trabajo pide solo nombre y teléfono, una vez (DESIGN.md, "Primero: sin fricción"). Los voluntarios de terreno se identifican por su número (#16, #20) y los links de invitación llegan por WhatsApp. Necesitamos saber quién es cada persona sin contraseña, sin cuenta en un tercero y sin copiar personas fuera de `users` (ADR 0005).

## Decisión

### Identidad: el teléfono, con un código de 6 dígitos

| Paso | Qué pasa |
|---|---|
| 1 | La persona escribe su celular. Se normaliza a E.164 con `libphonenumber-js` y solo se aceptan los países de `PHONE_REGIONS` (contra el *SMS pumping* a números caros del extranjero). |
| 2 | Llega un código por **WhatsApp** (plantilla de autenticación `aluvia_login_code` de Meta, en español, con botón para copiar). Si WhatsApp falla (número sin WhatsApp, plantilla rechazada, token revocado) cae a **SMS** de Twilio (ADR 0010), cuando haya número chileno. Si el número no tiene WhatsApp y no hay SMS, la persona ve ese motivo y no un error genérico. |
| 3 | Escribe el código y entra. La primera vez se crea su fila en `users` y se le pide el nombre. |

- **Implementación propia sobre nuestro Postgres**, sin librería de auth. Better Auth y Auth.js exigen email en el usuario: con login por teléfono llenarían `users.email` de direcciones falsas y traerían tablas de cuentas y verificaciones que no usamos. Lo nuestro son tres tablas y reglas que decide la base, como el resto del repo.
- `login_codes` guarda **HMAC** del teléfono y del código con `AUTH_SECRET`: una fila no identifica a nadie y no sirve para adivinar offline. Un código vale 10 minutos y 5 intentos; verificar suma el intento y consume el código con `UPDATE` condicionales, así un código abre una sola sesión aunque llegue repetido.
- Límites en `rate_limits` (compartida con los reportes públicos): 5 códigos por teléfono y 30 por IP por hora; 60 verificaciones por IP por hora, 20 por teléfono y dirección al día y 100 por teléfono al día, así un solo aparato no deja a otra persona sin entrar. Generosos por IP porque las redes móviles comparten dirección (SECURITY.md).
- `sessions` guarda el SHA-256 del token; la cookie es `httpOnly`, `sameSite=lax` (un link de WhatsApp tiene que llegar con sesión) y en producción se llama `__Host-aluvia_session` (solo HTTPS y solo este host). Entrar de nuevo en un aparato cierra la sesión anterior. La sesión dura 30 días desde el último uso.
- **Excepción al outbox (ADR 0007):** el código se envía directo desde la acción, después de guardar. Tiene que llegar en segundos, no puede guardarse en claro y no hay un cambio de dominio que acompañar en la misma transacción. Es el único mensaje que sale así.
- Producción no arranca sin WhatsApp o Twilio configurado. En desarrollo, sin proveedor, el código aparece en el log del servidor.
- Observabilidad (ADR 0008): eventos `login_code_*`, `emergency_joined`, `member_role_*`, `invitation_*` y `worksite_(un)assigned`, sin teléfono ni código. La métrica `aluvia.auth.login_code.deliveries` (canal y resultado) alimenta una **alerta** en Grafana: fallos sobre 20 % de los envíos en 10 minutos, porque si falla nadie entra a ayudar.

### Roles por emergencia

| Rol | Puede | Cómo se obtiene |
|---|---|---|
| `volunteer` | Tomar trabajos y anotarse en turnos | Se une solo, con un toque |
| `field_volunteer` | Además, actualizar **solo las casas que tiene asignadas**. No ve contactos | Lo aprueba un admin, o acepta una invitación de un admin |
| `coordinator` | Actualizar cualquier casa de la emergencia y ver contactos (con registro en `contact_views`) | Igual que el anterior |

- `emergency_members.role` es siempre el rol **otorgado**. Un pedido espera en `requested_role` y no otorga nada hasta que otra persona lo aprueba. La base lo exige: `role = 'volunteer' OR approved_at IS NOT NULL` y `approved_by <> user_id`.
- Aprueban, rechazan y quitan roles los **admins de plataforma** (ADR 0009). Un admin no es coordinador por ser admin: para ver contactos se agrega como uno, aprobado por otro admin.
- Tomar un trabajo exige ser miembro: `work_items (emergency_id, claimed_by)` apunta a `emergency_members`. Así el borrado de datos personales al cerrar (ADR 0005) alcanza a todo el que tomó algo.
- `worksite_assignments` liga un voluntario de terreno con una casa; su FK a la membresía borra las asignaciones cuando se pierde. Quitar el rol también las borra. No hay tope de casas por persona: lo decide el admin.

### Invitaciones

- Un admin crea un link por emergencia con rol, vencimiento (1, 3 o 7 días) y usos máximos; se revoca cuando quiera. Un link de voluntario puede ser ilimitado; uno que otorga un rol siempre tiene tope (`CHECK`). Desde la ficha de una casa sale un link de un uso que además asigna esa casa.
- Se guarda el SHA-256 del token. Aceptar es un `UPDATE` condicional sobre `uses`: un link de un uso admite exactamente a una persona. Quien lo creó queda como aprobador, por eso su propio link no lo asciende, y un link que otorga un rol deja de servir si su creador ya no es admin.
- Aceptar nunca baja de rol a quien ya tiene uno mayor.

### Autorización para las demás features

`@/shared/auth` exporta `getCurrentUser`, `requireUser`, `getEmergencyAccess`, `findEmergencyAccess` y los predicados `isMember`, `isCoordinator`, `canClaimWorkItems` y `canViewContacts`. Cada Server Action y route handler los llama antes de leer o escribir.

## Alternativas descartadas

- **Link mágico por email:** barato, pero el voluntario de terreno se identifica por teléfono (#20) y muchos no revisan el correo en terreno.
- **Firebase Auth / Identity Platform:** guarda a las personas fuera de nuestra base y obliga a sincronizar `users`.
- **Passkeys:** sin fricción en teléfonos nuevos, pero no en el celular prestado o antiguo que se usa en una emergencia.

## Consecuencias

- Cada login cuesta un mensaje de WhatsApp de autenticación o un SMS. Los límites por teléfono e IP acotan el abuso; la sesión de 30 días hace que una persona entre pocas veces.
- La plantilla `aluvia_login_code` se envía a aprobación de Meta en cada idioma antes del primer deploy.
- Meta y Twilio reciben el teléfono de quien entra (SECURITY.md).
- La zona como unidad de invitación queda fuera: el modelo todavía no tiene zonas. Se invita por emergencia o por casa.
