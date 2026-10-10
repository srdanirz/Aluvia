# Calls the app every minute for work that runs outside a request: delivering the notifications
# outbox (ADR 0007) and releasing lapsed "Voy para allá" reservations (#12). Each route checks
# its bearer token in constant time; the token is read from Secret Manager, so it reaches the
# state but never this repo. A call is listed in var.scheduled_calls once its route is on main.

locals {
  scheduled_calls = {
    notifications-dispatch = { path = "/api/v1/notifications/dispatch", secret = "NOTIFICATIONS_DISPATCH_TOKEN" }
    work-items-release     = { path = "/api/v1/work-items/release-expired", secret = "WORK_ITEMS_SWEEP_TOKEN" }
  }
  enabled_calls = { for name, call in local.scheduled_calls : name => call if contains(var.scheduled_calls, name) }
}

data "google_secret_manager_secret_version" "scheduled_call" {
  for_each = local.enabled_calls

  secret = google_secret_manager_secret.app[each.value.secret].id
}

resource "google_cloud_scheduler_job" "call" {
  for_each = local.enabled_calls

  name             = each.key
  region           = var.region
  schedule         = "* * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "60s"

  # The next minute is the retry; a retry inside the same minute would overlap it.
  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "https://${var.domain}${each.value.path}"
    headers = {
      Authorization = "Bearer ${data.google_secret_manager_secret_version.scheduled_call[each.key].secret_data}"
    }
  }

  depends_on = [google_project_service.this]
}
