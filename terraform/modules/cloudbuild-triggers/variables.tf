variable "project" {
  description = "GCP project id"
  type        = string
}

variable "github_owner" {
  description = "Github owner of the triggering repository"
  type        = string
}

variable "github_repo" {
  description = "Github repository name"
  type        = string
}

variable "build_service_account" {
  description = "Email of the service account running the build"
  type        = string
}

variable "disabled" {
  description = "Disable all triggers"
  type        = bool
  default     = true
}

variable "substitutions" {
  description = "Substitutions passed to every trigger of this environment"
  type        = map(string)
}

variable "triggers" {
  description = "Triggers to create. Exactly one of branch or tag must be set per entry."
  type = map(object({
    branch = optional(string)
    tag    = optional(string)
  }))

  validation {
    condition = alltrue([
      for name, t in var.triggers :
      (t.branch == null) != (t.tag == null)
    ])
    error_message = "Each trigger must set exactly one of branch or tag."
  }
}
