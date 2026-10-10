# Alerts owned by GCP (ADR 0008): app down and budget. The Prometheus and Postgres alerts live
# in Grafana.

resource "google_monitoring_notification_channel" "email" {
  for_each = toset(var.alert_emails)

  display_name = "Aluvia ${each.value}"
  type         = "email"
  labels = {
    email_address = each.value
  }

  depends_on = [google_project_service.this]
}

resource "google_monitoring_uptime_check_config" "app" {
  display_name = "aluvia.cl health"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path           = "/api/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true
    request_method = "GET"
    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.domain
    }
  }
}

resource "google_monitoring_alert_policy" "app_down" {
  display_name = "Aluvia caída"
  combiner     = "OR"
  severity     = "CRITICAL"

  conditions {
    display_name = "El chequeo de /api/health falla 2 veces seguidas"
    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id = \"${google_monitoring_uptime_check_config.app.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      # Two consecutive one-minute periods with more than one checker region failing: one
      # flaky region alone does not page anyone.
      duration = "120s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
      trigger {
        count = 1
      }
    }
  }

  notification_channels = [for channel in google_monitoring_notification_channel.email : channel.id]

  documentation {
    mime_type = "text/markdown"
    content   = "https://${var.domain}/api/health no responde 200: la app no llega a la base o no está sirviendo. Revisa la revisión activa de Cloud Run y Cloud SQL. Runbook: infra/README.md."
  }
}

resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account
  display_name    = "Aluvia mensual"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  amount {
    specified_amount {
      currency_code = var.budget.currency
      units         = tostring(var.budget.amount)
    }
  }

  dynamic "threshold_rules" {
    for_each = [0.5, 0.8, 1.0]
    content {
      threshold_percent = threshold_rules.value
    }
  }

  all_updates_rule {
    monitoring_notification_channels = [for channel in google_monitoring_notification_channel.email : channel.id]
    # Billing admins keep getting the default emails too.
    disable_default_iam_recipients = false
  }

  depends_on = [google_project_service.this]
}
