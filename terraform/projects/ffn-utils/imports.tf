# ============================================================================
# Übernahme der Projekt-Basis aus dem prod-State
#
# Bis hierher lag `module.project_base` im Root terraform/environments/prod
# (`manage_project_base = true`). Dort steht jetzt ein `removed`-Block, der die
# Ressourcen aus dem State entlässt, **ohne sie zu zerstören** — hier werden
# dieselben Objekte importiert. Nichts wird angelegt oder gelöscht, nur die
# Zuständigkeit wechselt.
#
# Importiert wird nur, was beim Anlegen mit 409 scheitern würde. Nicht
# aufgeführt sind die Ressourcen, deren Create ohnehin idempotent ist:
#
#   - google_project_service          (services.enable auf einer aktiven API)
#   - google_project_iam_member       (Member zu einer Bindung hinzufügen)
#   - google_storage_bucket_iam_member
#   - google_service_account_iam_member
#   - google_secret_manager_secret_iam_member
#
# Ebenfalls nicht importiert: google_firebaserules_ruleset.storage. Ein Ruleset
# ist unveränderlich und trägt einen von Firebase vergebenen Namen; terraform
# legt beim ersten Apply ein neues an und hängt den Release darauf um — derselbe
# Vorgang wie bei jeder Änderung an storage.rules. Das alte Ruleset bleibt als
# Version liegen, so wie alle vorherigen auch.
#
# Die Blöcke dürfen stehenbleiben, terraform überspringt sie nach dem Import.
# Nach dem ersten erfolgreichen Apply kann die Datei entfallen.
# ============================================================================

import {
  to = module.project_base.google_firebase_project.default
  id = "projects/${var.project}"
}

import {
  to = module.project_base.google_firebaserules_release.storage
  id = "projects/${var.project}/releases/firebase.storage/${var.project}.appspot.com"
}

import {
  to = module.project_base.google_service_account.run_sa
  id = "projects/${var.project}/serviceAccounts/${var.run_sa}@${var.project}.iam.gserviceaccount.com"
}

import {
  to = module.project_base.google_service_account.deploy_sa
  id = "projects/${var.project}/serviceAccounts/${var.deploy_sa}@${var.project}.iam.gserviceaccount.com"
}

import {
  to = module.project_base.google_service_account.terraform_sa
  id = "projects/${var.project}/serviceAccounts/terraform@${var.project}.iam.gserviceaccount.com"
}

import {
  to = module.project_base.google_artifact_registry_repository.run_docker
  id = "projects/${var.project}/locations/${var.region}/repositories/hydrantenkarte"
}

import {
  to = module.project_base.google_artifact_registry_repository.run_docker2
  id = "projects/${var.project}/locations/${var.run_region}/repositories/hydrantenkarte"
}

import {
  to = module.project_base.google_artifact_registry_repository.dockerhub_cache
  id = "projects/${var.project}/locations/${var.run_region}/repositories/dockerhub"
}

import {
  for_each = toset(local.secrets)
  to       = module.project_base.google_secret_manager_secret.secrets[each.key]
  id       = "projects/${var.project}/secrets/${each.key}"
}

import {
  to = module.project_base.google_secret_manager_secret.blaulichtsms_encryption_key
  id = "projects/${var.project}/secrets/BLAULICHTSMS_ENCRYPTION_KEY"
}

# Ohne diesen Import legte terraform eine **neue** Version aus einem frisch
# gewürfelten random_id an. Die Anwendung liest "latest" — der Schlüssel wäre
# ein anderer und alles damit Verschlüsselte nicht mehr zu entschlüsseln. Das
# Secret hat genau eine Version.
#
# `random_id.blaulichtsms_encryption_key` wird bewusst nicht importiert: Sein
# Wert fließt nur in `secret_data`, und das steht unter `ignore_changes`. Ein
# neu gewürfelter Wert bleibt damit folgenlos — und der Importschlüssel wäre
# der Geheimniswert selbst, der nichts im Repository zu suchen hat.
import {
  to = module.project_base.google_secret_manager_secret_version.blaulichtsms_encryption_key
  id = "projects/${var.project}/secrets/BLAULICHTSMS_ENCRYPTION_KEY/versions/1"
}

import {
  to = module.project_base.google_iam_workload_identity_pool.github
  id = "projects/${var.project}/locations/global/workloadIdentityPools/github"
}

import {
  to = module.project_base.google_iam_workload_identity_pool_provider.github
  id = "projects/${var.project}/locations/global/workloadIdentityPools/github/providers/github"
}
