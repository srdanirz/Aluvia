# Defaults describe the production deployment of aluvia.cl. A fork deploying its own copy
# overrides them in a terraform.tfvars (gitignored), starting from terraform.tfvars.example.

variable "project_id" {
  type    = string
  default = "aluvia-app"
}

variable "region" {
  description = "Santiago: lowest latency to Chile and keeps the data in the country."
  type        = string
  default     = "southamerica-west1"
}

variable "domain" {
  type    = string
  default = "aluvia.cl"
}

variable "dns_zone" {
  description = "Existing Cloud DNS zone for var.domain."
  type        = string
  default     = "aluvia-cl"
}

variable "github_repository" {
  description = "owner/name of the repository that deploys, and its numeric id (immune to renames and re-registration)."
  type        = object({ name = string, id = string })
  default     = { name = "srdanirz/Aluvia", id = "1412676052" }
}

variable "alert_emails" {
  description = "Who gets the downtime and budget alerts. Kept out of the repo: set it in terraform.tfvars."
  type        = list(string)
}

variable "billing_account" {
  description = "Billing account id of the project (gcloud billing projects describe). Set it in terraform.tfvars."
  type        = string
}

variable "budget" {
  description = "Monthly budget in the billing account's currency; alerts fire at 50, 80 and 100 %."
  type        = object({ amount = number, currency = string })
  default     = { amount = 200000, currency = "CLP" }
}

variable "database_tier" {
  description = "db-custom-1-3840: dedicated core (SLA-eligible), 100 connections."
  type        = string
  default     = "db-custom-1-3840"
}

variable "database_availability" {
  description = "ZONAL or REGIONAL. REGIONAL adds a standby in another zone and doubles the database cost."
  type        = string
  default     = "ZONAL"
}

variable "run_scaling" {
  description = "min 1 keeps one warm instance so the first neighbor after a quiet night does not wait for a cold start."
  type        = object({ min = number, max = number })
  default     = { min = 1, max = 10 }
}

variable "database_pool_max" {
  description = "Connections per instance. run_scaling.max x this must stay under the tier's max_connections minus the migrator."
  type        = number
  default     = 5
}

variable "provider_secrets" {
  description = <<-EOT
    Optional third-party credentials mounted as env vars of the same name (RESEND_API_KEY,
    TWILIO_AUTH_TOKEN, ...). Add a name here only after its first version exists in Secret
    Manager, or the deploy fails. Values never pass through Terraform.
  EOT
  type        = set(string)
  default     = []
}

variable "env" {
  description = "Plain, non-secret env vars for the app, merged over the defaults in run.tf."
  type        = map(string)
  default     = {}
}

variable "scheduled_calls" {
  description = "Which minute-by-minute calls in scheduler.tf are on (notifications-dispatch, work-items-release). Turn one on once its route is on main."
  type        = set(string)
  default     = []
}
