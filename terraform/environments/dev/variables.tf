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

# Nicht `run_region`: Hat ein Projekt eine App-Engine-Anwendung — ffn-utils hat
# eine in europe-west1 —, kennt Cloud Tasks ausschließlich deren Region, und
# eine Queue in europe-west4 wird mit „not a valid location" abgelehnt. Für das
# Ziel der Aufgabe spielt die Region keine Rolle, es ist eine HTTPS-URL.
variable "tasks_region" {
  description = "Region of the Cloud Tasks queue. Bound to the App Engine region of the project, not to run_region."
  type        = string
  default     = "europe-west1"
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

variable "cloudbuild_disabled" {
  description = "Disable cloud build triggers"
  type        = bool
  default     = true
}

# Die öffentliche Adresse dieser Umgebung. Sie ist dreierlei zugleich:
# NEXTAUTH_URL des Dienstes, Ziel des Scheduler-Aufrufs und erwartete Audience
# des OIDC-Tokens. Deshalb genau eine Quelle statt einer Repository-Variablen
# neben einem im Workflow verdrahteten NEXTAUTH_URL.
variable "public_url" {
  description = "Public base URL of the service, e.g. https://dev.karte.example.at"
  type        = string
  default     = "https://einsatz-dev.ffnd.at"

  validation {
    condition     = startswith(var.public_url, "https://")
    error_message = "public_url muss mit https:// beginnen."
  }

  # Ein Schrägstrich am Ende wäre tödlich, nur unauffällig: Der Scheduler
  # stellte das Token auf "https://host/" aus, während `getBaseUrl()` im Dienst
  # den Schrägstrich abschneidet und "https://host" erwartet. Die Audience
  # passte nicht und `cronRequired` antwortete 403.
  validation {
    condition     = !endswith(var.public_url, "/")
    error_message = "public_url darf nicht mit / enden — die Audience des OIDC-Tokens müsste sonst exakt so lauten."
  }
}

# ---------------------------------------------------------------------------
# Deploy-Eingaben
#
# Diese fünf Werte kommen aus cloudrun.auto.tfvars.json, erzeugt von
# scripts/cloud-run-tfvars.sh. Die Datei ist gitignored: Sie beschreibt den
# aktuellen Deploy, nicht den gewünschten Dauerzustand.
# ---------------------------------------------------------------------------

variable "image" {
  description = "Container image including tag"
  type        = string
}

variable "revision_suffix" {
  description = "Readable part of the revision name, e.g. a branch name"
  type        = string
  default     = ""
}

variable "revision_tag" {
  description = "Traffic tag for the revision created by this apply"
  type        = string
  default     = ""
}

variable "retained_tags" {
  description = "Historic traffic tags that survive this apply: tag => revision"
  type        = map(string)
  default     = {}
}

variable "serving_revision" {
  description = "Rollback: revision that serves the traffic. Empty means the newest one."
  type        = string
  default     = ""
}

# ---------------------------------------------------------------------------
# Laufzeit-Konfiguration des Dienstes
# ---------------------------------------------------------------------------

# Kein Geheimnis: Next.js backt die NEXT_PUBLIC_*-Werte beim Build fest ins
# Client-Bundle, die Firebase-Konfiguration steht damit ohnehin in jedem
# Browser. Sie liegt trotzdem als Repository-Variable vor und wird von dort
# durchgereicht, damit Build und Laufzeit dieselbe Quelle haben.
variable "firebase_config" {
  description = "Firebase web app configuration as JSON (repository variable NEXT_PUBLIC_FIREBASE_APIKEY)"
  type        = string

  validation {
    condition     = can(jsondecode(var.firebase_config).projectId)
    error_message = "firebase_config muss ein JSON-Objekt mit projectId sein — sonst startet die App im Browser mit '\"projectId\" not provided in firebase.initializeApp'."
  }
}

variable "recaptcha_key" {
  description = "Public reCAPTCHA site key (repository variable NEXT_PUBLIC_RECAPTCHA_KEY)"
  type        = string
}

variable "einsatzmappe_impersonation_account" {
  description = "Workspace account impersonated for Einsatzmappe and mail"
  type        = string
}
