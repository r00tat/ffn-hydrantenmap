variable "project" {
  description = "GCP project the job runs in"
  type        = string
}

variable "run_region" {
  description = "Region of the Cloud Scheduler job and of the Cloud Run service"
  type        = string
}

variable "service_name" {
  description = "Name of the Cloud Run service that gets called"
  type        = string
}

# Der Cloud-Run-Dienst selbst liegt nicht in Terraform (Deployment über
# service.yaml und Cloud Build), deshalb kommt seine URL als Wert herein statt
# aus einem Resource-Attribut. Sie ist zugleich die erwartete OIDC-Audience.
variable "service_url" {
  description = "Public base URL of the service, e.g. https://karte.example.at"
  type        = string
}

variable "weekly_report_schedule" {
  description = "Cron expression of the Fahrtenbuch weekly report"
  type        = string
  default     = "0 7 * * 1"
}

variable "weekly_report_paused" {
  description = "Job exists but does not run. Default in dev, so that two environments never mail the same distribution list."
  type        = bool
  default     = false
}
