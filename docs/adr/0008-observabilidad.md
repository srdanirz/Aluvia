# 0008 · Observabilidad: métricas, errores, uso y alertas

- **Estado:** aceptada
- **Fecha:** 2026-10-10

## Contexto

En una emergencia, que la app falle sin que nadie se entere es peor que no tenerla: los vecinos creen que su reporte llegó. Necesitamos saber, sin mirar a mano, si la app funciona, dónde falla, cómo se usa y en qué zonas se está quedando gente sin atender.

## Decisión

Cuatro capas, cada una con su herramienta.

### 1. Métricas técnicas: Prometheus + Grafana

- La app se instrumenta con **OpenTelemetry** desde `src/instrumentation.ts` (estable en Next.js 16) y expone métricas en formato Prometheus.
- En Cloud Run, el **sidecar de Managed Service for Prometheus** (`run-gmp-sidecar`) las recoge y las guarda en Google Cloud Managed Service for Prometheus. No hay servidor de Prometheus que mantener.
- **Grafana propio en Cloud Run**, dentro de nuestro proyecto de GCP y con acceso a la VPC. Lee Managed Prometheus con PromQL usando una cuenta de servicio, y Postgres por IP privada. No usamos Grafana Cloud: tendría que entrar a la base desde afuera, y las vistas por zona saldrían de GCP hacia un tercero.
- Métricas mínimas: requests por ruta (tasa, errores, duración p50/p95/p99), consultas a la base por request, uso del pool de conexiones, atraso del outbox de notificaciones (ADR 0007), cargas del mapa contra la cuota diaria (ADR 0006).

### 2. Errores: Sentry

- Errores del **navegador y del servidor** en un solo lugar, con la versión desplegada y la ruta. Los errores del celular del vecino son los que menos se ven y los que más importan.
- `sendDefaultPii: false` y un `beforeSend` que borra teléfonos, direcciones, emails y RUT de mensajes y breadcrumbs. Sin session replay.

### 3. Uso de la app: eventos de producto + datos de dominio

- **Eventos de producto con PostHog** (open source), en su región de la **UE**: qué pantallas se usan, dónde abandonan el reporte, en qué dispositivo. Los eventos están en un **catálogo único** (`src/shared/analytics/events.ts`) con nombre en `snake_case` y en pasado (`worksite_reported`, `work_item_claimed`) y su schema zod; no se envía un evento que no esté ahí.
- Configuración de PostHog, sin excepciones: descartar la IP en el proyecto, `autocapture: false`, sin session replay, `person_profiles: "identified_only"`, y un `before_send` que reemplaza los ids de las URLs (`/emergencies/[slug]/worksites/[id]`) antes de enviar. El usuario se identifica por un id anónimo, su rol y la emergencia.
- **Uso por zona, desde la base**: Grafana lee Postgres con un usuario de solo lectura y vistas agregadas (nunca tablas con contactos). Casas reportadas por hora y por zona, tiempo hasta que alguien toma un trabajo, trabajos sin tomar hace más de 24 h por manzana, voluntarios activos por turno. Es el mapa de calor de "en qué esquina falta ayuda".

### 4. Alertas automáticas

Avisan a los dos mantenedores (email y push al celular). Cada alerta vive en la herramienta que tiene el dato:

| Alerta | Umbral inicial | Dónde se define |
|---|---|---|
| Errores 5xx | más de 1 % de los requests en 5 min | Grafana (Prometheus) |
| Latencia del mapa (bbox) | p95 sobre 800 ms en 10 min | Grafana (Prometheus) |
| Outbox de notificaciones atrasado | pendientes de más de 2 min | Grafana (Prometheus) |
| Conexiones de Cloud SQL | 80 % del máximo | Grafana (Prometheus) |
| **Zona sin atender** | trabajos sin tomar hace más de 24 h en una zona | Grafana (Postgres) |
| App caída | falla el chequeo de disponibilidad 2 veces seguidas | Cloud Monitoring |
| Cuota de Google Maps | 80 % del tope diario | Cloud Monitoring (métricas de cuota) |
| Presupuesto de GCP | 50 %, 80 % y 100 % | Cloud Billing |
| Error nuevo | primera aparición | Sentry |

"Zona sin atender" no es técnica: avisa que la ayuda no está llegando a un lugar, que es lo que importa.

### Logs

JSON estructurado a stdout, que Cloud Logging toma solo. Cada línea lleva el trace en el campo `logging.googleapis.com/trace` con formato `projects/<proyecto>/traces/<trace_id>`, para cruzarla con métricas y errores. Sin datos personales (STYLEGUIDE).

## Consecuencias

- Dos proveedores además de GCP (Sentry y PostHog), ambos con plan gratis al comienzo. Grafana corre en nuestro proyecto. Un fork puede apagar cualquiera con su variable de entorno: la app funciona sin ellos.
- Cada feature nueva define en el mismo PR sus métricas, sus eventos y, si corresponde, su alerta (STYLEGUIDE, Observabilidad).

## Referencias

- [Sidecar de Prometheus para Cloud Run](https://docs.cloud.google.com/stackdriver/docs/managed-prometheus/cloudrun-sidecar)
- [Google Cloud Managed Service for Prometheus](https://cloud.google.com/managed-prometheus)
- [OpenTelemetry en Next.js](https://nextjs.org/docs/app/guides/open-telemetry)
