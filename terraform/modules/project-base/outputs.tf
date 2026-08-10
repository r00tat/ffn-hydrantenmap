output "run_sa_email" {
  description = "Email of the cloud run service account"
  value       = google_service_account.run_sa.email
}

output "run_sa_member" {
  description = "IAM member string of the cloud run service account"
  value       = google_service_account.run_sa.member
}

output "deploy_sa_email" {
  description = "Email of the cloud build / deploy service account"
  value       = google_service_account.deploy_sa.email
}

output "terraform_sa_email" {
  description = "Email of the terraform pipeline service account. Set this as the TERRAFORM_SERVICE_ACCOUNT repository secret."
  value       = google_service_account.terraform_sa.email
}

output "artifact_registry" {
  description = "Docker registry base url used for the cloud run images"
  value       = "${google_artifact_registry_repository.run_docker2.location}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.run_docker2.repository_id}"
}

output "workload_identity_provider" {
  description = "Workload identity provider id"
  value       = google_iam_workload_identity_pool_provider.github.name
}
