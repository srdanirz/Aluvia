# Photos and videos of homes (ADR 0020). A private bucket in Santiago: nothing in it is public,
# the browser uploads and reads through short-lived signed URLs the app signs as its own service
# account. Uniform access (no per-object ACLs) and public access prevention, so no object can be
# made public by mistake. Deleting what a purge removes (ADR 0005) is the app's job: the purge
# queues every object of the emergency in media_object_deletions and the scheduled call
# media-delete-queued deletes them, since a bucket rule cannot see a database event.

resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-media"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  # Purged media must be gone, not kept as an old version.
  versioning {
    enabled = false
  }

  # The browser's originals (with EXIF and GPS) live under uploads/ only until the app re-encodes
  # them; the app queues their deletion, and this rule removes any that slipped through (an
  # abandoned upload, a failed queue) after a day.
  lifecycle_rule {
    condition {
      age            = 1
      matches_prefix = ["uploads/"]
    }
    action {
      type = "Delete"
    }
  }
  # An upload left half-way would bill forever.
  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }

  # The phone PUTs straight to the bucket and plays videos from it.
  cors {
    origin          = ["https://${var.domain}"]
    method          = ["PUT", "GET", "HEAD"]
    response_header = ["Content-Type", "x-goog-content-length-range"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.this]
}

# Read, write and delete objects of this bucket only.
resource "google_storage_bucket_iam_member" "app_media" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectUser"
  member = google_service_account.app.member
}

# Cloud Run has no key file: the app signs URLs with the IAM signBlob API as itself.
resource "google_service_account_iam_member" "app_signs_urls" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = google_service_account.app.member
}
