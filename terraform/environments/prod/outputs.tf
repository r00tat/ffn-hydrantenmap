output "workload_identity_provider" {
  description = "Workload identity provider id"
  value       = try(module.project_base[0].workload_identity_provider, null)
}

output "terraform_sa_email" {
  description = "Email of the terraform pipeline service account"
  value       = try(module.project_base[0].terraform_sa_email, null)
}

output "artifact_registry" {
  description = "Docker registry base url"
  value       = local.artifact_registry
}

output "firestore_database" {
  description = "Firestore database of this environment"
  value       = module.firestore.database_name
}
