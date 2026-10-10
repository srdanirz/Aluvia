# 0012 · Infraestructura de producción

- **Estado:** aceptada
- **Fecha:** 2026-10-10

## Contexto

ADR 0001 eligió GCP y ADR 0002 fijó Cloud Run y Cloud SQL con PostGIS. Faltaba decidir cómo se arma producción: región, red, cómo llega el dominio, cómo entra la app a la base sin contraseñas expuestas, cómo despliega GitHub sin llaves y dónde viven los secretos. Todo tiene que poder replicarse en otro proyecto para otra emergencia.

## Decisión

Todo vive como código en `infra/` (Terraform, estado en el bucket `aluvia-app-tfstate`). El proyecto es `aluvia-app` y la región es **`southamerica-west1` (Santiago)**: menor latencia para Chile y los datos quedan en el país.

| Pieza | Decisión | Por qué |
|---|---|---|
| App | Cloud Run `aluvia`, contenedor `app` más el sidecar `prometheus` (`run-gmp-sidecar`, ADR 0008) | El sidecar lee `/metrics` en `METRICS_PORT=9464`. **CPU siempre asignada** (`cpu_idle = false`): el scrape corre entre requests y el trabajo en `after()` (métricas, errores, avisos) sigue después de responder; con CPU solo durante el request se congela |
| Escala | mínimo 1, máximo 10 instancias, 80 requests concurrentes por instancia, pool de 5 | Una instancia tibia evita el arranque en frío del primer vecino. 10 × 5 = 50 conexiones, bajo las 100 del tier |
| Base | Cloud SQL Postgres 17, edición Enterprise, `db-custom-1-3840`, zonal, solo IP privada, TLS obligatorio, backups diarios con PITR de 7 días | Núcleo dedicado (con SLA) al menor costo. Regional duplica el precio; se activa con una variable |
| Red | VPC `aluvia` con Direct VPC egress desde Cloud Run y Private Service Access hacia Cloud SQL | Sin conector Serverless VPC Access que pagar ni escalar |
| Acceso a la base | La app entra con su cuenta de servicio por **autenticación IAM**: la contraseña es un token de acceso del metadata server (`src/shared/db/iam-token.ts`). Las migraciones usan el rol `aluvia_owner`, cuya URL solo puede leer el job de migraciones | La app no tiene contraseña ni permisos de DDL. El job vuelve a dar `SELECT, INSERT, UPDATE, DELETE` sobre todas las tablas después de migrar |
| Dominio | Balanceador HTTPS externo global → NEG serverless → Cloud Run, con certificado administrado por Google para `aluvia.cl` y `www.aluvia.cl`. `www` y HTTP redirigen a `https://aluvia.cl` | Cloud Run no ofrece domain mappings en `southamerica-west1`. La URL `run.app` no recibe tráfico (ingress solo desde el balanceador). Detrás del balanceador `TRUSTED_PROXY_HOPS=2` |
| Imágenes | Artifact Registry `aluvia`, un `Dockerfile` con dos targets: `app` (standalone de Next) y `migrate` | Se guardan las 20 versiones más recientes para poder volver atrás |
| Secretos | Secret Manager, replicados solo en Santiago. Terraform crea el contenedor y el permiso; el valor se agrega con `gcloud` y nunca pasa por el repo | La única excepción es `MIGRATE_DATABASE_URL`, que Terraform compone porque genera la contraseña; queda en el estado, que solo leen los mantenedores |
| Deploy | `.github/workflows/deploy.yml`: cuando CI pasa en `main`, construye las dos imágenes, corre el job `aluvia-migrate` y recién entonces cambia la imagen del servicio. Termina con un chequeo de `/api/health` | **Workload Identity Federation**: GitHub recibe un token corto por ejecución, sin llaves JSON. Solo este repositorio (por id numérico) en `main` puede actuar como `aluvia-deploy` |
| Terraform y deploy | Terraform define el servicio (env, secretos, red, escala); el workflow define solo la imagen | Un `terraform apply` nunca devuelve producción a una imagen vieja |
| Disponibilidad | Chequeo cada minuto contra `https://aluvia.cl/api/health`, que responde 200 solo si llega a la base. Alerta si falla dos veces seguidas | ADR 0008. "Arriba" significa que el reporte de un vecino se guardaría |
| Presupuesto | Presupuesto mensual en CLP con avisos al 50, 80 y 100 % | ADR 0001 y 0008 |
| Trabajo fuera de un request | Cloud Scheduler llama cada minuto, con un token de Secret Manager, al outbox de avisos (`/api/v1/notifications/dispatch`) y a la liberación de reservas vencidas (`/api/v1/work-items/release-expired`) | ADR 0007 y #12. Cada llamada se enciende en `scheduled_calls` cuando su ruta está en `main` |
| Google Maps | Llave de navegador de producción restringida a `https://aluvia.cl/*` y a Maps JavaScript API | ADR 0006 |

### Costo estimado

Del orden de 160 a 200 mil CLP al mes en reposo: Cloud SQL dedicado (~60 USD), la instancia mínima de Cloud Run con CPU siempre asignada (~70 USD), el balanceador (~20 USD) y centavos de Secret Manager, Artifact Registry y DNS. El presupuesto parte en 200 mil CLP: el aviso del 50 % confirma el gasto base y el del 80 % avisa de un pico. Se ajusta en `infra/variables.tf`.

## Fuera de alcance

- **Grafana y sus alertas** (ADR 0008): es su propio servicio con su usuario de solo lectura; va en su propio cambio.
- **Cloud Armor**: el límite de tasa vive en la base (SECURITY.md) y no hace falta otro mientras no haya un ataque concreto.
- **Cuota diaria de Google Maps**: se fija en la consola junto con el Map ID, que no tiene API.

## Consecuencias

- Producción depende de que NIC Chile delegue `aluvia.cl` a los servidores de Cloud DNS. Sin la delegación, el certificado no se emite y el chequeo de disponibilidad falla.
- Cada variable de entorno nueva de la app se agrega en `infra/run.tf` (o en `var.env`) y cada secreto nuevo en `infra/secrets.tf` o `provider_secrets`, en el mismo PR que la introduce.
- Las migraciones son aditivas (STYLEGUIDE): corren antes de que cambie la imagen, mientras la revisión anterior sigue sirviendo.
- Un fork despliega Aluvia en su propio proyecto con un `terraform.tfvars` y sus variables de repositorio (`infra/README.md`).
