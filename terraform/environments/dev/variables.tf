variable "project" {
  description = "GCP project id"
  type        = string
}

variable "build_service_account" {
  description = "Email of the service account used by cloud build"
  type        = string
}

variable "github_org" {
  description = "Github organization / owner"
  type        = string
}

variable "github_repo" {
  description = "Github repository name"
  type        = string
  default     = "ffn-hydrantenmap"
}

variable "region" {
  description = "GCP default region"
  type        = string
  default     = "europe-west3"
}

variable "run_region" {
  description = "Region of the cloud run service"
  type        = string
  default     = "europe-west4"
}

variable "name" {
  description = "service name"
  type        = string
  default     = "hydrantenmap"
}

variable "run_sa" {
  description = "Account id of the cloud run service account"
  type        = string
  default     = "hydrantenmap"
}

variable "deploy_sa" {
  description = "Account id of the cloud build service account"
  type        = string
  default     = "cloudbuild"
}

variable "state_bucket" {
  description = "GCS bucket holding the terraform state"
  type        = string
  default     = "ffn-utils-tfstate"
}

variable "cloudbuild_disabled" {
  description = "Disable cloud build triggers"
  type        = bool
  default     = true
}

variable "manage_project_base" {
  description = "Whether this environment owns the base infrastructure of its GCP project. False while dev shares the project with prod; set to true together with a dedicated project id."
  type        = bool
  default     = false
}

# Cloud Run stellt die öffentliche URL nicht als Attribut bereit, das terraform
# hier lesen könnte — der Dienst wird über .github/workflows/cloud-run.yml
# deployt. Sie ist zugleich die erwartete OIDC-Audience des Scheduler-Tokens.
variable "run_service_url" {
  description = "Public base URL of the Cloud Run service, e.g. https://dev.karte.example.at"
  type        = string

  # Ohne Wert (Repository-Variable RUN_SERVICE_URL_DEV nicht gesetzt) käme ein
  # leerer String an und der Scheduler-Job bekäme die URI "/api/...". Lauter
  # Fehler statt stiller Fehlkonfiguration.
  validation {
    condition     = startswith(var.run_service_url, "https://")
    error_message = "run_service_url muss mit https:// beginnen (Repository-Variable RUN_SERVICE_URL_DEV)."
  }

  # Ein Schrägstrich am Ende wäre genauso tödlich, nur unauffälliger: Der
  # Scheduler stellte das Token auf "https://host/" aus, während `getBaseUrl()`
  # im Dienst den Schrägstrich abschneidet und "https://host" erwartet. Die
  # Audience passte nicht und `cronRequired` antwortete 403.
  validation {
    condition     = !endswith(var.run_service_url, "/")
    error_message = "run_service_url darf nicht mit / enden — die Audience des OIDC-Tokens müsste sonst exakt so lauten."
  }
}
