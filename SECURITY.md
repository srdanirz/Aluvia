# Seguridad y datos personales

Aluvia guarda información sensible de familias en un mal momento: dirección, teléfono, quién vive ahí, si hay adultos mayores o personas con discapacidad, qué perdieron. Filtrarla expone a esas familias a estafas y robos en casas vacías, cosas que ya ocurrieron en otras emergencias.

## Reglas

- **El repositorio es público.** Secretos y datos reales nunca se commitean. Las credenciales viven en GCP Secret Manager; en local, en `.env` (ignorado por git).
- **Datos de prueba siempre inventados.** Nada de direcciones reales de Las Condes en tests, seeds o capturas de pantalla.
- **Ubicación pública aproximada.** El mapa público muestra zonas o manzanas, no la dirección exacta ni el teléfono. El detalle solo lo ve un coordinador autenticado.
- **Mínimo dato necesario.** Si un campo no sirve para decidir a quién ayudar primero, no se pide.
- **Acceso a contactos.** Solo coordinadores aprobados a mano por un mantenedor ven dirección y teléfono, y cada vista queda registrada (quién, qué casa, cuándo).
- **Reportes públicos con límite de tasa**, para que nadie llene el mapa de casas falsas. El contador es compartido entre instancias (en la base, no en memoria) y la IP se lee del `X-Forwarded-For` del balanceador. Los umbrales son generosos: las redes móviles en Chile comparten IP entre muchos usuarios (CGNAT) y un límite estricto bloquearía a vecinos reales en el peor momento.
- **API key de Google Maps** restringida por dominio y por API, con cuotas diarias (ADR 0006).
- **Terceros que reciben datos.** La política de privacidad de Aluvia nombra a cada uno, qué recibe y dónde lo aloja:
  - **Google Maps:** lo que el vecino escribe en la dirección (autocompletado) y la zona que mira en el mapa. La política enlaza la de Google, como exigen sus términos.
  - **Sentry:** errores técnicos, sin datos personales (se limpian antes de enviar).
  - **PostHog (UE):** eventos de uso con id anónimo, sin IP y sin ids de casas en las URLs.
  - Métricas, logs y Grafana quedan dentro de nuestro proyecto de GCP.
- **Infraestructura:** Cloud SQL con IP privada, acceso por IAM y cuentas de servicio con el mínimo permiso.
- **Fecha de borrado.** Los datos de una emergencia se eliminan cuando la emergencia termina, con fecha definida antes de salir a producción.
- Cumplimiento con la Ley 19.628 de protección de datos personales de Chile y la Ley 21.719 que la modifica (vigente desde diciembre de 2026).

## Reportar una vulnerabilidad

No abras un issue público. Usa [GitHub Security Advisories](https://github.com/srdanirz/Aluvia/security/advisories/new) para reportarla en privado.
