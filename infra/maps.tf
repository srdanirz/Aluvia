# Production browser key for Google Maps (ADR 0006). It is public by nature (it ships in the
# bundle), so the protection is the restriction: only aluvia.cl pages, only the Maps JavaScript
# API. The development key "maps-browser-dev" is managed by hand and allows localhost only.
resource "google_apikeys_key" "maps_browser" {
  name         = "maps-browser-prod"
  display_name = "Maps browser (aluvia.cl)"

  restrictions {
    browser_key_restrictions {
      allowed_referrers = ["https://${var.domain}/*"]
    }
    api_targets {
      service = "maps-backend.googleapis.com"
    }
  }

  depends_on = [google_project_service.this]
}

# Server key for the Geocoding API: the report route places a written address on the map. It never
# reaches a browser, so the restriction is the API alone (Cloud Run has no fixed egress IP). Its
# value goes into the GOOGLE_MAPS_SERVER_KEY secret by hand (README), like every credential.
resource "google_apikeys_key" "maps_server" {
  name         = "maps-server-prod"
  display_name = "Maps server geocoding (Cloud Run)"

  restrictions {
    api_targets {
      service = "geocoding-backend.googleapis.com"
    }
  }

  depends_on = [google_project_service.this]
}
