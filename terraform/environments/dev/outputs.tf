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

# Das Secret CRON_INVOKER_EMAILS füllt der Prod-Root (dem die Projekt-Basis
# gehört) für beide Umgebungen. Dieser Output dient der Kontrolle und dem
# `dryRun`-Aufruf von Hand, für den die Adresse zum Impersonieren gebraucht wird.
output "fahrtenbuch_report_invoker" {
  description = "Service account the weekly report job authenticates as"
  value       = module.cloud_scheduler.invoker_service_account_email
}
