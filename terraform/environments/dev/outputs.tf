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

# CRON_INVOKER_EMAILS setzt der Cloud-Run-Dienst selbst (local.cron_invoker_emails
# in main.tf). Dieser Output dient der Kontrolle und dem `dryRun`-Aufruf von
# Hand, für den die Adresse zum Impersonieren gebraucht wird.
output "fahrtenbuch_report_invoker" {
  description = "Service account the weekly report job authenticates as"
  value       = module.cloud_scheduler.invoker_service_account_email
}

output "run_service_uri" {
  description = "Von Cloud Run vergebene URL des Dienstes. Öffentlich erreichbar ist er unter der Custom Domain (var.public_url)."
  value       = module.cloud_run.uri
}

output "run_revision" {
  description = "Revision, die dieser apply erzeugt bzw. bestätigt hat"
  value       = module.cloud_run.revision_name
}

output "run_traffic_tags" {
  description = "Traffic-Tags nach diesem apply — die Rollback-Ziele"
  value       = module.cloud_run.tags
}
