# ============================================================================
# Service Account für die Terraform-Pipeline
#
# Dieser SA verwaltet das gesamte Projekt und hat deshalb faktisch
# Projekt-Administrator-Rechte. Bewusste Entscheidung: automatisiertes
# `apply` braucht sie. Er wird ausschließlich per Workload Identity
# Federation aus diesem Repository impersoniert — es existiert kein Key.
#
# Wer ein neues Modul hinzufügt, trägt dessen Rolle hier ein. Dieser Block ist
# die einzige Stelle, an der der Pipeline-SA Rechte bekommt. Er liegt im
# Projekt-Root (terraform/projects/<projekt-id>), der in beiden Pipelines vor
# jedem Environment-Apply läuft — eine neue Rolle ist damit sofort wirksam.
#
# Solange das Modul am prod-Root hing, war das anders: Eine Erweiterung wurde
# erst beim nächsten Release wirksam, und der dev-Apply scheiterte bis dahin mit
# 403 auf der neuen Ressource.
# ============================================================================

resource "google_service_account" "terraform_sa" {
  account_id   = var.terraform_sa
  display_name = "terraform"
  description  = "SA used by the terraform github actions pipeline"
  project      = var.project
}

resource "google_project_iam_member" "terraform_iam" {
  for_each = toset([
    "roles/serviceusage.serviceUsageAdmin",  # google_project_service
    "roles/resourcemanager.projectIamAdmin", # Projekt-IAM-Bindings
    "roles/iam.serviceAccountAdmin",         # Service Accounts
    "roles/iam.serviceAccountUser",          # SA-Nutzung / actAs
    "roles/iam.workloadIdentityPoolAdmin",   # WIF Pool + Provider
    "roles/firebase.admin",                  # Firebase-Projekt, Rules-Releases
    "roles/datastore.owner",                 # Firestore DB, Indexes, Fields
    "roles/artifactregistry.admin",          # Artifact Registries
    "roles/secretmanager.admin",             # Secret Manager
    "roles/cloudbuild.builds.editor",        # Cloud Build Trigger
    "roles/cloudscheduler.admin",            # Scheduler-Jobs (modules/cloud-scheduler)
    "roles/cloudtasks.admin",                # Task-Queue + deren IAM (modules/cloud-scheduler)
    "roles/run.admin",                       # Cloud-Run-Dienst (modules/cloud-run)
  ])
  member  = google_service_account.terraform_sa.member
  role    = each.value
  project = var.project
}

# Lese-/Schreibzugriff auf das State-Objekt. Der Bucket selbst wird nicht von
# terraform verwaltet, deshalb nur ein IAM-Member auf dem bestehenden Bucket.
resource "google_storage_bucket_iam_member" "terraform_state" {
  bucket = var.state_bucket
  role   = "roles/storage.objectAdmin"
  member = google_service_account.terraform_sa.member
}

# Erlaubt dem Actions-Workflow dieses Repositories, den SA zu impersonieren.
resource "google_service_account_iam_member" "terraform_wif" {
  service_account_id = google_service_account.terraform_sa.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}
