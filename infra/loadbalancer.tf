# aluvia.cl -> global external Application Load Balancer -> serverless NEG -> Cloud Run.
# Cloud Run domain mappings do not exist in southamerica-west1 (ADR 0012), so the domain is
# served by a load balancer with a Google-managed certificate. www redirects to the apex and
# HTTP redirects to HTTPS.

locals {
  hosts = [var.domain, "www.${var.domain}"]
}

resource "google_compute_global_address" "lb_v4" {
  name       = "aluvia-lb-v4"
  ip_version = "IPV4"

  depends_on = [google_project_service.this]
}

resource "google_compute_global_address" "lb_v6" {
  name       = "aluvia-lb-v6"
  ip_version = "IPV6"

  depends_on = [google_project_service.this]
}

resource "google_compute_region_network_endpoint_group" "app" {
  name                  = "aluvia-run"
  region                = var.region
  network_endpoint_type = "SERVERLESS"
  cloud_run {
    service = google_cloud_run_v2_service.app.name
  }
}

resource "google_compute_backend_service" "app" {
  name                  = "aluvia-run"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"

  backend {
    group = google_compute_region_network_endpoint_group.app.id
  }

  # Request logs would store client IPs and URLs with home ids (ADR 0008); Cloud Run's own
  # request logs cover status and latency.
  log_config {
    enable = false
  }
}

resource "google_compute_url_map" "https" {
  name            = "aluvia-https"
  default_service = google_compute_backend_service.app.id

  host_rule {
    hosts        = ["www.${var.domain}"]
    path_matcher = "www"
  }

  path_matcher {
    name = "www"
    default_url_redirect {
      host_redirect          = var.domain
      redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
      strip_query            = false
    }
  }
}

resource "google_compute_managed_ssl_certificate" "main" {
  # The name carries the domains: a managed certificate is immutable, and a new name lets
  # create_before_destroy swap it without downtime when a host is added.
  name = "aluvia-${substr(sha1(join(",", local.hosts)), 0, 8)}"

  managed {
    domains = local.hosts
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_target_https_proxy" "main" {
  name             = "aluvia-https"
  url_map          = google_compute_url_map.https.id
  ssl_certificates = [google_compute_managed_ssl_certificate.main.id]
}

resource "google_compute_url_map" "http_redirect" {
  name = "aluvia-http-redirect"

  # Fixing the host sends http://www straight to https://aluvia.cl in one hop.
  default_url_redirect {
    https_redirect         = true
    host_redirect          = var.domain
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "aluvia-http-redirect"
  url_map = google_compute_url_map.http_redirect.id
}

locals {
  forwarding_rules = {
    https-v4 = { address = google_compute_global_address.lb_v4.id, port = "443", target = google_compute_target_https_proxy.main.id }
    https-v6 = { address = google_compute_global_address.lb_v6.id, port = "443", target = google_compute_target_https_proxy.main.id }
    http-v4  = { address = google_compute_global_address.lb_v4.id, port = "80", target = google_compute_target_http_proxy.redirect.id }
    http-v6  = { address = google_compute_global_address.lb_v6.id, port = "80", target = google_compute_target_http_proxy.redirect.id }
  }
}

resource "google_compute_global_forwarding_rule" "main" {
  for_each = local.forwarding_rules

  name                  = "aluvia-${each.key}"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = each.value.address
  port_range            = each.value.port
  target                = each.value.target
}

resource "google_dns_record_set" "lb" {
  for_each = {
    for pair in setproduct(local.hosts, ["A", "AAAA"]) : "${pair[0]}-${pair[1]}" => { host = pair[0], type = pair[1] }
  }

  managed_zone = var.dns_zone
  name         = "${each.value.host}."
  type         = each.value.type
  ttl          = 300
  rrdatas = [
    each.value.type == "A" ? google_compute_global_address.lb_v4.address : google_compute_global_address.lb_v6.address
  ]
}
