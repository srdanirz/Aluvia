# infra

Producción de Aluvia en GCP como código (Terraform). Las decisiones y su porqué están en [ADR 0012](../docs/adr/0012-infraestructura-de-produccion.md).

| Archivo | Qué define |
|---|---|
| `apis.tf` | APIs habilitadas |
| `network.tf` | VPC, subred para Direct VPC egress, Private Service Access |
| `database.tf` | Cloud SQL Postgres 17, base `aluvia`, usuarios IAM del migrador (dueño del schema) y de la app |
| `secrets.tf` | Secretos de la app y config del sidecar |
| `registry.tf` | Artifact Registry y su limpieza |
| `run.tf` | Servicio `aluvia` con sidecar de Prometheus, jobs `aluvia-migrate` y `aluvia-task`, variables de entorno |
| `loadbalancer.tf` | Balanceador HTTPS, certificado, redirecciones, registros DNS |
| `github.tf` | Workload Identity Federation y la cuenta `aluvia-deploy` |
| `monitoring.tf` | Chequeo de disponibilidad, alerta, presupuesto |
| `scheduler.tf` | Llamadas cada minuto con OIDC: outbox de avisos y reservas vencidas |
| `maps.tf` | Llave de Google Maps de producción |

## Aplicar un cambio

Requiere Terraform 1.10 o más y rol de owner en el proyecto (más administrador de facturación para el presupuesto).

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # una vez: correos de alerta y cuenta de facturación
gcloud auth application-default login          # o: export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)
terraform init
terraform plan -out=plan                       # leer el plan completo antes de aplicar
terraform apply plan
```

Antes de aplicar, busca `must be replaced` y `destroy` en el plan. Un recurso con un campo inmutable distinto (replicación de un secreto, nombre, región) se borra y se vuelve a crear, y lo que guardaba se pierde.

## Secretos

Terraform crea el contenedor y el permiso; el valor nunca pasa por el repo ni por Terraform.

```bash
# Secretos generados (AUTH_SECRET, RATE_LIMIT_SECRET)
openssl rand -base64 32 | tr -d '\n' | gcloud secrets versions add AUTH_SECRET --project aluvia-app --data-file=-

# Credenciales de un proveedor: el secreto ya existe vacío, solo se agrega la versión
printf '%s' "$VALOR" | gcloud secrets versions add TWILIO_AUTH_TOKEN --project aluvia-app --data-file=-
```

Los secretos de proveedores (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `ANTHROPIC_API_KEY`) los crea Terraform vacíos. Con la versión agregada, el nombre va a `provider_secrets` en `terraform.tfvars` y se aplica: Cloud Run lo recibe como variable de entorno del mismo nombre. El deploy falla si faltan `AUTH_SECRET`, `RATE_LIMIT_SECRET` o los dos de WhatsApp, que es el canal del código de login; Twilio es el respaldo por SMS y se monta cuando tenga versión. Una versión nueva de un secreto existente llega con el próximo deploy.

## Variables del repositorio (deploy)

El workflow `deploy.yml` lee todo de variables del repositorio, no de secretos: ninguno de estos valores es secreto.

```bash
terraform output -json github_variables | jq -r 'to_entries[] | "\(.key) \(.value)"' |
  while read -r name value; do gh variable set "$name" --body "$value"; done
gh variable set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY --body "$(terraform output -raw maps_browser_key)"
```

`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` es obligatoria (en producción, `aluvia-prod`): el Map ID se crea en la consola (Google Maps Platform, Map Management: JavaScript, vectorial, sin estilo propio), porque no tiene API, y el deploy falla sin él. Las demás `NEXT_PUBLIC_*` (Sentry, PostHog, VAPID) se agregan cuando existan; vacías, esa pieza queda apagada. Los source maps de Sentry suben con las variables `SENTRY_ORG` y `SENTRY_PROJECT` y el secreto de repositorio `SENTRY_AUTH_TOKEN`, que entra al build como secreto de BuildKit y no queda en la imagen.

El environment `production` del repositorio acepta solo la rama `main`; WIF además exige ese environment:

```bash
gh api -X PUT repos/<owner>/<repo>/environments/production -F deployment_branch_policy[protected_branches]=false -F deployment_branch_policy[custom_branch_policies]=true
gh api -X POST repos/<owner>/<repo>/environments/production/deployment-branch-policies -f name=main -f type=branch
```

## Primera vez en un proyecto nuevo

1. Proyecto con facturación y una zona de Cloud DNS para el dominio, delegada desde el registrador.
2. Bucket del estado: `gcloud storage buckets create gs://<proyecto>-tfstate --location <región> --uniform-bucket-level-access --public-access-prevention` y `gcloud storage buckets update gs://<proyecto>-tfstate --versioning`. Cambiar el nombre en `versions.tf`.
3. `terraform.tfvars` con `project_id`, `domain`, `dns_zone`, `github_repository`, `alert_emails` y `billing_account`.
4. `terraform apply -target=google_project_service.this -target=google_secret_manager_secret.app`, agregar una versión a cada secreto y luego `terraform apply` completo.
5. Variables del repositorio, el environment `production` y un deploy desde Actions (`Deploy` → Run workflow, en `main`).

El certificado queda `ACTIVE` entre 15 y 60 minutos después de que el dominio resuelve a la IP del balanceador: `gcloud compute ssl-certificates list`.

## Operación

- **Ver qué corre:** `gcloud run services describe aluvia --region southamerica-west1`.
- **Volver a la versión anterior:** `gcloud run services update-traffic aluvia --region southamerica-west1 --to-revisions <revisión>=100`. Las migraciones son aditivas, así que el código anterior funciona con el schema nuevo. El próximo deploy vuelve a mandar el tráfico a la revisión nueva. Si el chequeo de `/api/health` falla tras un deploy, el workflow vuelve solo a la revisión anterior.
- **Una migración falló:** el deploy se detiene antes de mover tráfico. Logs: `gcloud run jobs executions list --job aluvia-migrate --region southamerica-west1`.
- **Scripts contra la base de producción** (`pnpm db:seed`, `pnpm admin:grant`): el job `aluvia-task` corre `pnpm run <script>` con la imagen del último deploy y la identidad de la app (login IAM, solo filas: no puede cambiar el schema). Los argumentos van separados por comas:

  ```bash
  gcloud run jobs execute aluvia-task --region southamerica-west1 --wait --args=db:seed
  gcloud run jobs execute aluvia-task --region southamerica-west1 --wait --args=admin:grant,+56912345678
  ```

  La salida queda en Cloud Logging (`resource.labels.job_name="aluvia-task"`).
- **Entrar a la base:** Cloud SQL Studio en la consola. No hay contraseñas de base: para una consulta puntual, un script en `scripts/` corrido con `aluvia-task`. La base no tiene IP pública.
- **Alerta "Aluvia caída":** `/api/health` no llega a la base o la app no responde. Revisa la revisión activa, el estado de Cloud SQL y los logs con `severity>=ERROR`.
