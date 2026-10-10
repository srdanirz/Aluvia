# Seguridad y datos personales

Aluvia guarda información sensible de familias en un mal momento: dirección, teléfono, quién vive ahí, si hay adultos mayores o personas con discapacidad, qué perdieron. Filtrarla expone a esas familias a estafas y robos en casas vacías, cosas que ya ocurrieron en otras emergencias.

## Reglas

- **El repositorio es público.** Secretos y datos reales nunca se commitean. Las credenciales viven en GCP Secret Manager; en local, en `.env` (ignorado por git).
- **Datos de prueba siempre inventados.** Nada de direcciones reales de Las Condes en tests, seeds o capturas de pantalla.
- **Ubicación pública aproximada.** El mapa público muestra zonas o manzanas, no la dirección exacta ni el teléfono. El detalle solo lo ve un coordinador autenticado.
- **Mínimo dato necesario.** Si un campo no sirve para decidir a quién ayudar primero, no se pide.
- **Fecha de borrado.** Los datos de una emergencia se eliminan cuando la emergencia termina, con fecha definida antes de salir a producción.
- Cumplimiento con la Ley 19.628 de protección de datos personales de Chile y la Ley 21.719 que la modifica (vigente desde diciembre de 2026).

## Reportar una vulnerabilidad

No abras un issue público. Usa [GitHub Security Advisories](https://github.com/srdanirz/Aluvia/security/advisories/new) para reportarla en privado.
