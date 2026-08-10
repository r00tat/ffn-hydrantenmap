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
