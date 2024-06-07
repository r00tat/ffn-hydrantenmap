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

variable "name" {
  description = "service name"
  type        = string
  default     = "hydrantenmap"
}
