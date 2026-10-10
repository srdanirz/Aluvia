# Values the deploy workflow needs, set once as GitHub repository variables (infra/README.md).

output "github_variables" {
  value = {
    GCP_PROJECT_ID   = var.project_id
    GCP_REGION       = var.region
    GCP_WIF_PROVIDER = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOY_SA    = google_service_account.deploy.email
    GCP_IMAGE_BASE   = local.image_base
    APP_URL          = "https://${var.domain}"
  }
}

output "maps_browser_key" {
  description = "Goes into the NEXT_PUBLIC_GOOGLE_MAPS_API_KEY repository variable. Public by design, restricted to the domain."
  value       = google_apikeys_key.maps_browser.key_string
  sensitive   = true
}

output "load_balancer_ips" {
  value = {
    v4 = google_compute_global_address.lb_v4.address
    v6 = google_compute_global_address.lb_v6.address
  }
}
