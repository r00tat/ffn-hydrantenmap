variable "project" {
  description = "GCP project id"
  type        = string
}

variable "build_service_account" {
  description = "Service account id for cloud build"
  type        = string
}

variable "run_sa" {
  description = "name of the cloud run service account"
  type        = string
  default     = "hydrantenmap"
}

variable "deploy_sa" {
  description = "Cloud build SA"
  type        = string
  default     = "cloudbuild"
}

variable "region" {
  description = "GCP default region"
  type        = string
  default     = "europe-west3"
}
variable "run_region" {
  description = "GCP default region"
  type        = string
  default     = "europe-west4"
}

variable "name" {
  description = "service name"
  type        = string
  default     = "hydrantenmap"
}

variable "github_org" {
  description = "Github Organization"
  type        = string
}

variable "cloudbuild_disabled" {
  default     = false
  type        = bool
  description = "Disable cloud build triggers"
}
