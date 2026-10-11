# Seguridad y datos personales

Aluvia guarda información sensible de familias en un mal momento: dirección, teléfono, quién vive ahí, si hay adultos mayores o personas con discapacidad, qué perdieron. Filtrarla expone a esas familias a estafas y robos en casas vacías, cosas que ya ocurrieron en otras emergencias.

## Reglas

- **El repositorio es público.** Secretos y datos reales nunca se commitean. Las credenciales viven en GCP Secret Manager; en local, en `.env` (ignorado por git).
- **Datos de prueba siempre inventados.** Nada de direcciones reales de Las Condes en tests, seeds o capturas de pantalla.
- **Punto y dirección públicos, contacto privado salvo que el vecino elija lo contrario.** El mapa público muestra el punto de cada casa y su dirección escrita completa, porque un voluntario tiene que encontrar la puerta (ADR 0011 y 0017). Nombre y teléfono se publican solo si quien reporta lo elige al enviar; los reportes anteriores a esa opción siguen privados. Nunca se publica si hay personas vulnerables ni si la casa está sin gente. Ese detalle solo lo ve un coordinador autenticado, y cada vista queda registrada.
- **Mínimo dato necesario.** Si un campo no sirve para decidir a quién ayudar primero, no se pide.
- **Login sin contraseña** por código al teléfono (ADR 0013). Teléfonos y códigos pendientes se guardan como HMAC; las sesiones, como hash del token.
- **Links de invitación:** el token va en la ruta (`/invitations/<token>`), así que queda en los registros de requests de Cloud Run y del balanceador. Por eso la base guarda solo su hash, cada link vence, los que otorgan un rol tienen tope de usos y el admin los revoca. El acceso a esos registros se limita a los mantenedores.
- **Acceso a contactos.** Solo coordinadores aprobados a mano por un mantenedor ven el contacto que el vecino no hizo público, y cada vista queda registrada (quién, qué casa, cuándo).
- **Actualizaciones abiertas** (ADR 0018). Cualquiera, sin cuenta, actualiza personas e insumos y el estado de los trabajos de una casa. Cada cambio queda en un historial de solo inserción con un actor anónimo: el HMAC de una cookie de aparato al azar y el de la IP, nunca los valores ni datos de la persona. Límite de tasa por IP y por aparato, chequeo de versión, y un coordinador oculta o deshace un cambio abusivo. La purga de la emergencia borra esas claves.
- **Reportes públicos con límite de tasa**, para que nadie llene el mapa de casas falsas. El contador es compartido entre instancias (en la base, no en memoria) y la IP se lee del `X-Forwarded-For` del balanceador. Los umbrales son generosos: las redes móviles en Chile comparten IP entre muchos usuarios (CGNAT) y un límite estricto bloquearía a vecinos reales en el peor momento.
- **API key de Google Maps** restringida por dominio y por API, con cuotas diarias (ADR 0006).
- **Terceros que reciben datos.** La política de privacidad de Aluvia nombra a cada uno, qué recibe y dónde lo aloja:
  - **Google Maps:** lo que el vecino escribe en la dirección (autocompletado) y la zona que mira en el mapa. La política enlaza la de Google, como exigen sus términos.
  - **Sentry:** errores técnicos, sin datos personales (se limpian antes de enviar).
  - **Anthropic (API de Claude):** el texto que pega un coordinador en la carga en lote, para extraer direcciones. No se guarda en Aluvia ni se usa para entrenar modelos (política de la API).
  - **Resend:** el email del voluntario y el texto del aviso. Envía desde São Paulo; sus registros quedan en EE. UU. (ADR 0010).
  - **Twilio:** el teléfono y el texto de cada SMS, y las respuestas BAJA.
  - **Meta (WhatsApp Cloud API):** el teléfono y el link de cada aviso por WhatsApp.
  - **Servicios de push del navegador** (Google, Apple, Mozilla): un aviso cifrado de punta a punta; no ven su contenido.
  - **PostHog (UE):** eventos de uso con id anónimo, sin IP y sin ids de casas en las URLs.
  - Métricas, logs y Grafana quedan dentro de nuestro proyecto de GCP.
- **Infraestructura:** Cloud SQL con IP privada, acceso por IAM y cuentas de servicio con el mínimo permiso.
- **Fecha de borrado.** Los datos de una emergencia se eliminan cuando la emergencia termina, con fecha definida antes de salir a producción.
- Cumplimiento con la Ley 19.628 de protección de datos personales de Chile y la Ley 21.719 que la modifica (vigente desde diciembre de 2026).

## Reportar una vulnerabilidad

No abras un issue público. Usa [GitHub Security Advisories](https://github.com/srdanirz/Aluvia/security/advisories/new) para reportarla en privado.
