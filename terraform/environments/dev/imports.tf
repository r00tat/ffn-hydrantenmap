# Übernahme des bestehenden Dienstes in den State. Er existiert seit 2022 und
# wurde bis hierher per `gcloud run deploy` gepflegt — ohne diesen Block würde
# der erste apply ihn neu anlegen wollen und mit 409 scheitern.
#
# Der Block darf stehenbleiben: Terraform überspringt ihn, sobald die Ressource
# im State liegt. Nach dem ersten erfolgreichen apply in beiden Umgebungen kann
# die Datei entfallen.
import {
  to = module.cloud_run.google_cloud_run_v2_service.this
  id = "projects/${var.project}/locations/${var.run_region}/services/${local.service_name}"
}
