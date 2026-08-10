variable "project" {
  description = "GCP project id"
  type        = string
}

variable "region" {
  description = "GCP default region"
  type        = string
}

variable "run_region" {
  description = "Region of the Cloud Run service and its artifact registry"
  type        = string
}

variable "name" {
  description = "service name"
  type        = string
}

variable "run_sa" {
  description = "Account id of the cloud run service account"
  type        = string
}

variable "deploy_sa" {
  description = "Account id of the cloud build / deploy service account"
  type        = string
}

variable "terraform_sa" {
  description = "Account id of the service account used by the terraform pipeline"
  type        = string
  default     = "terraform"
}

variable "github_org" {
  description = "Github organization / owner"
  type        = string
}

variable "github_repo" {
  description = "Github repository name, used for the workload identity binding"
  type        = string
}

variable "state_bucket" {
  description = "GCS bucket holding the terraform state. Created outside of terraform."
  type        = string
}

variable "storage_rules_file" {
  description = "Path to the firebase storage rules file"
  type        = string
}

variable "project_services" {
  description = "Google APIs to enable on the project"
  type        = list(string)
  default = [
    "iam.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudapis.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudtrace.googleapis.com",
    "containerregistry.googleapis.com",
    "datastore.googleapis.com",
    "drive.googleapis.com",
    "eventarc.googleapis.com",
    "fcm.googleapis.com",
    "fcmregistrations.googleapis.com",
    "firebase.googleapis.com",
    "firebaseappdistribution.googleapis.com",
    "firebasedynamiclinks.googleapis.com",
    "firebasehosting.googleapis.com",
    "firebaseinstallations.googleapis.com",
    "firebaseremoteconfig.googleapis.com",
    "firebaserules.googleapis.com",
    "firebasestorage.googleapis.com",
    "firestore.googleapis.com",
    "firestorekeyvisualizer.googleapis.com",
    "gmail.googleapis.com",
    "googlecloudmessaging.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "mobilecrashreporting.googleapis.com",
    "monitoring.googleapis.com",
    "places.googleapis.com",
    "routes.googleapis.com",
    "run.googleapis.com",
    "runtimeconfig.googleapis.com",
    "script.googleapis.com",
    "secretmanager.googleapis.com",
    "servicemanagement.googleapis.com",
    "serviceusage.googleapis.com",
    "sheets.googleapis.com",
    "storage.googleapis.com",
    "testing.googleapis.com",
    "texttospeech.googleapis.com",
    "picker.googleapis.com",
    "firebasevertexai.googleapis.com",
    "androidpublisher.googleapis.com",
    "chromewebstore.googleapis.com",
  ]
}

variable "secrets" {
  description = "Secret Manager secrets whose value is managed outside of terraform"
  type        = set(string)
  default = [
    "AUTH_SECRET",
    "GOOGLE_SERVICE_ACCOUNT",
    "BLAULICHTSMS_USERNAME",
    "BLAULICHTSMS_PASSWORD",
    "BLAULICHTSMS_CUSTOMER_ID",
    "SUMUP_API_KEY",
    "SUMUP_AFFILIATE_KEY",
    "SUMUP_API_KEY_DEV",
    "SUMUP_AFFILIATE_KEY_DEV",
    "SUMUP_MERCHANT_CODE",
    "SUMUP_MERCHANT_CODE_DEV",
  ]
}
