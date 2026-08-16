variable "project" {
  description = "GCP project id"
  type        = string
}

variable "run_region" {
  description = "Region of the cloud run service"
  type        = string
}

variable "name" {
  description = "Name of the cloud run service"
  type        = string
}

variable "service_account_email" {
  description = "Runtime service account of the service"
  type        = string
}

# ---------------------------------------------------------------------------
# Deploy-Eingaben
#
# Diese vier Werte liefert scripts/cloud-run-tfvars.sh, nicht der Mensch. Bei
# einem Deploy aus dem gebauten Image, bei einem reinen Infrastruktur-apply aus
# dem laufenden Dienst — so dreht ein apply, der nur Firestore-Regeln ändert,
# nicht versehentlich die App auf ein altes Image zurück.
# ---------------------------------------------------------------------------

variable "image" {
  description = "Full image reference including tag"
  type        = string

  validation {
    condition     = length(var.image) > 0
    error_message = "image darf nicht leer sein — scripts/cloud-run-tfvars.sh erzeugt cloudrun.auto.tfvars.json."
  }
}

variable "revision_suffix" {
  description = "Human readable part of the revision name, e.g. \"v2-63-0\" or a branch name. Empty falls back to the fingerprint alone."
  type        = string
  default     = ""

  validation {
    condition     = can(regex("^[a-z0-9-]*$", var.revision_suffix))
    error_message = "revision_suffix darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten."
  }
}

variable "revision_tag" {
  description = "Traffic tag pointing at the revision created by this apply. Empty creates no tag."
  type        = string
  default     = ""

  validation {
    condition     = can(regex("^[a-z0-9-]*$", var.revision_tag))
    error_message = "revision_tag darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten."
  }
}

variable "retained_tags" {
  description = "Historic traffic tags that survive this apply: tag => existing revision name. Everything missing here loses its tag."
  type        = map(string)
  default     = {}
}

variable "serving_revision" {
  description = "Revision that serves 100% of the traffic. Empty means the revision created by this apply. Set it to roll back."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Laufzeit-Konfiguration
# ---------------------------------------------------------------------------

variable "env" {
  description = "Plain environment variables"
  type        = map(string)
  default     = {}
}

variable "secret_env" {
  description = "Environment variables sourced from Secret Manager: env name => secret id. Always the latest version."
  type        = map(string)
  default     = {}
}

variable "cpu" {
  description = "CPU limit"
  type        = string
  default     = "1000m"
}

variable "memory" {
  description = "Memory limit"
  type        = string
  default     = "1Gi"
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 2
}

variable "concurrency" {
  description = "Maximum concurrent requests per instance"
  type        = number
  default     = 80
}

variable "timeout_seconds" {
  description = "Request timeout"
  type        = number
  default     = 300
}

variable "allow_unauthenticated" {
  description = "Grant roles/run.invoker to allUsers. The app authenticates its own users."
  type        = bool
  default     = true
}
