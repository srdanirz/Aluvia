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
