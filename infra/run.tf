# The app on Cloud Run. Terraform owns the service shape (env, secrets, scaling, network); the
# deploy workflow owns the image, so a `terraform apply` never rolls production back.

resource "google_service_account" "app" {
  account_id   = "aluvia-run"
  display_name = "Aluvia app (Cloud Run)"
}

resource "google_service_account" "migrate" {
  account_id   = "aluvia-migrate"
  display_name = "Aluvia migrations (Cloud Run job)"
}

resource "google_project_iam_member" "app" {
  # Direct private IP needs no connector role (cloudsql.client); instanceUser is the IAM login.
  for_each = toset([
    "roles/cloudsql.instanceUser",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent",
  ])

  project = var.project_id
  role    = each.value
  member  = google_service_account.app.member
}

resource "google_project_iam_member" "migrate" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = google_service_account.migrate.member
}

locals {
  metrics_port = 9464
  # Cloud Run needs an image to create the service; the first deploy replaces it.
  placeholder_image = "us-docker.pkg.dev/cloudrun/container/hello"

  app_env = merge({
    DATABASE_URL         = local.app_database_url
    DATABASE_IAM_AUTH    = "true"
    DATABASE_POOL_MAX    = tostring(var.database_pool_max)
    APP_URL              = "https://${var.domain}"
    GOOGLE_CLOUD_PROJECT = var.project_id
    METRICS_PORT         = tostring(local.metrics_port)
    PHONE_REGIONS        = "CL"
    # Google Front End plus the external load balancer each append to X-Forwarded-For.
    TRUSTED_PROXY_HOPS = "2"
    # Scheduled routes accept only Cloud Scheduler's OIDC token for this account (scheduler.tf).
    SCHEDULER_SERVICE_ACCOUNT = google_service_account.scheduler.email
  }, var.env)
}

resource "google_cloud_run_v2_service" "app" {
  name                = "aluvia"
  location            = var.region
  deletion_protection = true
  # Traffic only through the load balancer (loadbalancer.tf); the run.app URL refuses it.
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  # The app is public; anyone may invoke it, and the app does its own auth.
  invoker_iam_disabled = true

  template {
    service_account                  = google_service_account.app.email
    max_instance_request_concurrency = 80
    timeout                          = "60s"

    scaling {
      min_instance_count = var.run_scaling.min
      max_instance_count = var.run_scaling.max
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.main.id
        subnetwork = google_compute_subnetwork.run.id
      }
    }

    containers {
      name  = "app"
      image = local.placeholder_image

      ports {
        container_port = 8080
      }

      resources {
        limits = { cpu = "1", memory = "1Gi" }
        # The sidecar scrapes between requests; a throttled CPU would drop those scrapes.
        cpu_idle          = false
        startup_cpu_boost = true
      }

      # A revision that cannot reach the database or misses a required env var never takes
      # traffic: the previous one keeps serving.
      startup_probe {
        http_get {
          path = "/api/health"
        }
        period_seconds    = 2
        timeout_seconds   = 2
        failure_threshold = 30
      }

      # Liveness skips the database on purpose: a database blip must not restart every instance.
      liveness_probe {
        http_get {
          path = "/api/live"
        }
        period_seconds    = 15
        timeout_seconds   = 3
        failure_threshold = 3
      }

      dynamic "env" {
        for_each = local.app_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = google_secret_manager_secret.app
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }
    }

    containers {
      name = "prometheus"
      # 1.9.4, pinned by digest.
      image      = "us-docker.pkg.dev/cloud-ops-agents-artifacts/cloud-run-gmp-sidecar/cloud-run-gmp-sidecar@sha256:8f8ac35f4bc82aa9547b1458343acb79b2594b35b56fb4c13dbe62c1f5a64679"
      depends_on = ["app"]

      resources {
        limits = { cpu = "500m", memory = "256Mi" }
        # Cloud Run applies the boost to the whole instance and reports it on every container.
        startup_cpu_boost = true
      }

      volume_mounts {
        name       = "prometheus-config"
        mount_path = "/etc/rungmp"
      }
    }

    volumes {
      name = "prometheus-config"
      secret {
        secret = google_secret_manager_secret.prometheus_config.secret_id
        items {
          version = "latest"
          path    = "config.yaml"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_iam_member.app,
    google_secret_manager_secret_iam_member.app,
    google_secret_manager_secret_iam_member.prometheus_config,
    google_secret_manager_secret_version.prometheus_config,
  ]
}

resource "google_cloud_run_v2_job" "migrate" {
  name                = "aluvia-migrate"
  location            = var.region
  deletion_protection = true

  template {
    task_count = 1

    template {
      service_account = google_service_account.migrate.email
      max_retries     = 0
      timeout         = "600s"

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.main.id
          subnetwork = google_compute_subnetwork.run.id
        }
      }

      containers {
        image = local.placeholder_image

        env {
          name  = "DATABASE_APP_ROLE"
          value = google_sql_user.app.name
        }

        env {
          name  = "DATABASE_URL"
          value = local.migrate_database_url
        }

        env {
          name  = "DATABASE_IAM_AUTH"
          value = "true"
        }

        resources {
          limits = { cpu = "1", memory = "512Mi" }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [google_project_iam_member.migrate]
}
