terraform {
  required_version = ">= 1.10"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }

  # Created once by hand (infra/README.md, "Primera vez"); a backend cannot create its own bucket.
  backend "gcs" {
    bucket = "aluvia-app-tfstate"
    prefix = "infra"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  # Budgets and API keys are billed to this project's quota, not to the caller's gcloud default.
  billing_project       = var.project_id
  user_project_override = true
}
