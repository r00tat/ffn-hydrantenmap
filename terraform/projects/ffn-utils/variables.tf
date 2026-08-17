variable "project" {
  description = "GCP project id"
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
  description = "Base name of the service, used for the runtime SA and the registries"
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

# Der Bucket selbst wird nicht von terraform verwaltet — er ist Teil des
# Erstaufbaus, mit dem dieses Projekt überhaupt erst einen State bekommen hat.
# Hier wird nur der Zugriff des Pipeline-SA darauf gesetzt.
variable "state_bucket" {
  description = "GCS bucket holding the terraform state"
  type        = string
  default     = "ffn-utils-tfstate"
}
