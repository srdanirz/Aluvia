# GitHub Actions deploys with Workload Identity Federation: a short-lived token per run, no JSON
# key anywhere. Only the deploy workflow of this repository (by numeric id) on main can
# impersonate the deployer.

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.this]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "aluvia"
  display_name                       = "Aluvia repository"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }

  attribute_mapping = {
    "google.subject"          = "assertion.sub"
    "attribute.repository_id" = "assertion.repository_id"
    "attribute.ref"           = "assertion.ref"
  }

  # Only the deploy workflow, in the production environment, on main: a pull_request_target
  # workflow also carries ref main, and must not be able to deploy.
  attribute_condition = join(" && ", [
    "assertion.repository_id == '${var.github_repository.id}'",
    "assertion.ref == 'refs/heads/main'",
    "assertion.environment == 'production'",
    "assertion.workflow_ref.startsWith('${var.github_repository.name}/.github/workflows/deploy.yml@')",
  ])
}

resource "google_service_account" "deploy" {
  account_id   = "aluvia-deploy"
  display_name = "Aluvia deploy (GitHub Actions)"
}

resource "google_service_account_iam_member" "deploy_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository_id/${var.github_repository.id}"
}

# Least privilege: push images to one repository, update one service and two jobs, and act as
# the two runtime service accounts while doing so.
resource "google_artifact_registry_repository_iam_member" "deploy" {
  location   = google_artifact_registry_repository.app.location
  repository = google_artifact_registry_repository.app.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deploy.member
}

resource "google_cloud_run_v2_service_iam_member" "deploy" {
  name     = google_cloud_run_v2_service.app.name
  location = var.region
  role     = "roles/run.developer"
  member   = google_service_account.deploy.member
}

resource "google_cloud_run_v2_job_iam_member" "deploy" {
  for_each = {
    migrate = google_cloud_run_v2_job.migrate.name
    task    = google_cloud_run_v2_job.task.name
  }

  name     = each.value
  location = var.region
  role     = "roles/run.developer"
  member   = google_service_account.deploy.member
}

resource "google_service_account_iam_member" "deploy_acts_as" {
  for_each = {
    app     = google_service_account.app.name
    migrate = google_service_account.migrate.name
  }

  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deploy.member
}

moved {
  from = google_cloud_run_v2_job_iam_member.deploy
  to   = google_cloud_run_v2_job_iam_member.deploy["migrate"]
}
