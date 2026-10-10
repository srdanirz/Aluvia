# One central Postgres 17 + PostGIS (AGENTS.md, ADR 0002). Private IP only, TLS required.
# Both roles log in through IAM authentication as their service account, so no database
# password exists anywhere: the migrate job owns the schema, the app only reads and writes rows.

resource "google_sql_database_instance" "main" {
  name                = "aluvia"
  database_version    = "POSTGRES_17"
  region              = var.region
  deletion_protection = true

  settings {
    # Postgres 16+ defaults to Enterprise Plus, which costs several times more for this load.
    edition                     = "ENTERPRISE"
    tier                        = var.database_tier
    availability_type           = var.database_availability
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = true
    deletion_protection_enabled = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      # 04:00 UTC is midnight to 1 a.m. in Chile.
      start_time                     = "04:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 14
      }
    }

    maintenance_window {
      day          = 7
      hour         = 7
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = false
      record_client_address   = false
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }

  depends_on = [google_service_networking_connection.private_services]
}

resource "google_sql_database" "aluvia" {
  name     = "aluvia"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "migrate" {
  name     = trimsuffix(google_service_account.migrate.email, ".gserviceaccount.com")
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
  # Creates extensions and owns every table; the app role gets row access from migrate.mjs.
  database_roles = ["cloudsqlsuperuser"]
}

resource "google_sql_user" "app" {
  # Cloud SQL names IAM service account users by the email without ".gserviceaccount.com".
  name     = trimsuffix(google_service_account.app.email, ".gserviceaccount.com")
  instance = google_sql_database_instance.main.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

locals {
  database_host = google_sql_database_instance.main.private_ip_address
  # Not secrets: the URLs carry no password, IAM supplies a token per connection.
  app_database_url     = "postgres://${urlencode(google_sql_user.app.name)}@${local.database_host}:5432/${google_sql_database.aluvia.name}?sslmode=require"
  migrate_database_url = "postgres://${urlencode(google_sql_user.migrate.name)}@${local.database_host}:5432/${google_sql_database.aluvia.name}?sslmode=require"
}
