# Private network: Cloud SQL has no public IP and Cloud Run reaches it through Direct VPC egress
# (no Serverless VPC Access connector to pay for or scale).

resource "google_compute_network" "main" {
  name                    = "aluvia"
  auto_create_subnetworks = false

  depends_on = [google_project_service.this]
}

resource "google_compute_subnetwork" "run" {
  name    = "run-${var.region}"
  network = google_compute_network.main.id
  region  = var.region
  # Direct VPC egress takes up to 2 IPs per instance; a /24 covers run_scaling.max with room.
  ip_cidr_range            = "10.10.0.0/24"
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  name          = "private-services"
  network       = google_compute_network.main.id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}
