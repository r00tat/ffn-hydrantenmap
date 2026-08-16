output "uri" {
  description = "URL des Dienstes, wie Cloud Run sie vergibt (nicht die Custom Domain)"
  value       = google_cloud_run_v2_service.this.uri
}

output "name" {
  description = "Name des Dienstes"
  value       = google_cloud_run_v2_service.this.name
}

output "revision_name" {
  description = "Revision, die dieser apply erzeugt bzw. bestätigt hat"
  value       = local.revision_name
}

output "tags" {
  description = "Alle Traffic-Tags nach diesem apply: Tag => Revision"
  value       = local.tags
}
