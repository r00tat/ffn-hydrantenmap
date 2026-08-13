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

# Der Wert, der als Version in das Secret CRON_INVOKER_EMAILS gehört. Ohne
# diesen Output müsste der Betreiber die Adresse aus dem State oder der Konsole
# heraussuchen.
output "fahrtenbuch_report_invoker" {
  description = "Service account that invokes the weekly report; belongs in the CRON_INVOKER_EMAILS secret"
  value       = module.cloud_scheduler.invoker_service_account_email
}
