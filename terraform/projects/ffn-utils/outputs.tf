output "workload_identity_provider" {
  description = "Workload identity provider id. Set this as the WORKLOAD_IDENTITY_PROVIDER repository secret."
  value       = module.project_base.workload_identity_provider
}

output "terraform_sa_email" {
  description = "Email of the terraform pipeline service account. Set this as the TERRAFORM_SERVICE_ACCOUNT repository secret."
  value       = module.project_base.terraform_sa_email
}

output "run_sa_email" {
  description = "Runtime service account of the cloud run services in this project"
  value       = module.project_base.run_sa_email
}

output "deploy_sa_email" {
  description = "Cloud build / deploy service account"
  value       = module.project_base.deploy_sa_email
}

output "artifact_registry" {
  description = "Docker registry base url used for the cloud run images"
  value       = module.project_base.artifact_registry
}
