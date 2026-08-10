variable "project" {
  description = "GCP project id"
  type        = string
}

variable "database_name" {
  description = "Firestore database name. Use '(default)' for the default database."
  type        = string
}

variable "create_database" {
  description = "Whether terraform creates the firestore database. False for '(default)', which exists outside of terraform."
  type        = bool
  default     = false
}

variable "location_id" {
  description = "Firestore location, only used when create_database is true"
  type        = string
  default     = "eur3"
}

variable "point_in_time_recovery_enablement" {
  description = "PITR setting, only used when create_database is true"
  type        = string
  default     = "POINT_IN_TIME_RECOVERY_ENABLED"
}

variable "rules_file" {
  description = "Path to the firestore.rules file for this environment"
  type        = string
}

variable "indexes_file" {
  description = "Path to the firestore.indexes.json file for this environment"
  type        = string
}
