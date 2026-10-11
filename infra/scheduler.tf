# Calls the app every minute for work that runs outside a request: delivering the notifications
# outbox (ADR 0007) and releasing lapsed "Voy para allá" reservations (#12). Cloud Scheduler signs
# each call with an OIDC token for its own service account, audience = the full URL; the route
# accepts only that account (SCHEDULER_SERVICE_ACCOUNT, src/shared/scheduler-auth.ts). No shared
# secret exists. A call is listed in var.scheduled_calls once its route is on main.

resource "google_service_account" "scheduler" {
  account_id   = "aluvia-scheduler"
  display_name = "Aluvia scheduled calls (Cloud Scheduler)"
}

locals {
  scheduled_calls = {
    notifications-dispatch = "/api/v1/notifications/dispatch"
    work-items-release     = "/api/v1/work-items/release-expired"
    media-delete-queued    = "/api/v1/media/delete-queued"
  }
  enabled_calls = { for name, path in local.scheduled_calls : name => "https://${var.domain}${path}" if contains(var.scheduled_calls, name) }
}

resource "google_cloud_scheduler_job" "call" {
  for_each = local.enabled_calls

  name = each.key
  # Cloud Scheduler has no Santiago region; São Paulo is the closest. It only fires an HTTPS call
  # at aluvia.cl, so no data leaves for it.
  region           = "southamerica-east1"
  schedule         = "* * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "60s"

  # The next minute is the retry; a retry inside the same minute would overlap it.
  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = each.value
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = each.value
    }
  }

  depends_on = [google_project_service.this]
}
