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

# Dev und Prod laufen im selben GCP-Projekt (ffn-utils). Service-Account-Namen
# sind projektweit eindeutig, Scheduler-Job-Namen je Projekt und Region — ohne
# Unterscheidung legen beide Roots dieselben Ressourcen an und der zweite `apply`
# scheitert mit 409.
variable "name_suffix" {
  description = "Suffix for the invoker service account and the job name, so that two environments can share a project. Empty in prod, \"-dev\" in dev."
  type        = string
  default     = ""

  validation {
    # Die account_id des Invoker-SA ist "fahrtenbuch-report-invoker" (26
    # Zeichen) plus Suffix, und account_id darf höchstens 30 Zeichen haben.
    condition     = length(var.name_suffix) <= 4
    error_message = "name_suffix darf höchstens 4 Zeichen lang sein, sonst überschreitet die account_id des Invoker-Service-Accounts die 30-Zeichen-Grenze."
  }

  validation {
    condition     = can(regex("^(-[a-z0-9]+)?$", var.name_suffix))
    error_message = "name_suffix muss leer sein oder mit einem Bindestrich beginnen und darf nur Kleinbuchstaben und Ziffern enthalten."
  }
}

# Der Cloud-Run-Dienst selbst liegt nicht in Terraform (Deployment über
# .github/workflows/cloud-run.yml), deshalb kommt seine URL als Wert herein statt
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
