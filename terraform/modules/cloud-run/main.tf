locals {
  # Fingerabdruck über alles, was in das Revisions-Template einfließt.
  #
  # Cloud-Run-Revisionen sind unveränderlich: Ein Template darf nur unter einem
  # noch nicht vergebenen Revisionsnamen geschrieben werden. Weil der Name hier
  # gesetzt wird (statt ihn generieren zu lassen — sonst kennt terraform ihn
  # beim Plan nicht und könnte keinen Tag darauf legen), muss er sich genau dann
  # ändern, wenn sich der Inhalt ändert. Ein apply ohne Änderung trifft
  # denselben Namen und legt keine neue Revision an.
  #
  # WICHTIG: Wer dem Template unten ein Feld hinzufügt, trägt es hier ein.
  # Vergisst man es, scheitert der apply mit einem Konflikt auf dem
  # Revisionsnamen — laut, nicht stillschweigend.
  template_fingerprint = substr(sha256(jsonencode({
    image           = var.image
    env             = var.env
    secret_env      = var.secret_env
    service_account = var.service_account_email
    cpu             = var.cpu
    memory          = var.memory
    max_instances   = var.max_instances
    concurrency     = var.concurrency
    timeout         = var.timeout_seconds
  })), 0, 8)

  revision_name = join("-", compact([var.name, var.revision_suffix, local.template_fingerprint]))

  # Der Tag dieses Deploys zeigt auf die Revision, die dieser apply anlegt —
  # deshalb kann ihn das Skript nicht mitliefern, es kennt den Fingerabdruck
  # nicht. Historische Tags kommen von dort, der neue entsteht hier.
  tags = merge(
    var.retained_tags,
    var.revision_tag == "" ? {} : { (var.revision_tag) = local.revision_name },
  )
}

resource "google_cloud_run_v2_service" "this" {
  project  = var.project
  name     = var.name
  location = var.run_region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # Ein `tofu destroy` oder ein versehentliches Umbenennen soll den Dienst nicht
  # abräumen — die URL hängt an einer Custom Domain und an installierten PWAs.
  deletion_protection = true

  template {
    revision                         = local.revision_name
    service_account                  = var.service_account_email
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"
    timeout                          = "${var.timeout_seconds}s"
    max_instance_request_concurrency = var.concurrency

    # Das Skript liest den Wert beim nächsten Lauf zurück, um bei einem apply
    # ohne Deploy denselben Revisionsnamen wieder zu bilden.
    labels = var.revision_suffix == "" ? {} : { deploy-version = var.revision_suffix }

    scaling {
      max_instance_count = var.max_instances
    }

    containers {
      image = var.image

      ports {
        name           = "http1"
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }

        # CPU nur während der Bearbeitung einer Anfrage (der Vorgabewert), dafür
        # volle CPU beim Start — Next.js braucht sie zum Hochfahren.
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }
    }
  }

  # ---------------------------------------------------------------------------
  # Traffic
  #
  # Der Block ist autoritativ: Was hier nicht steht, verliert seinen Tag. Genau
  # das räumt die Tags gelöschter Feature-Branches weg — und genau deshalb ist
  # ein `gcloud run services update-traffic` von Hand kein Rollback mehr,
  # sondern Drift, den der nächste apply zurückdreht. Der Weg zurück führt über
  # `serving_revision`.
  # ---------------------------------------------------------------------------

  dynamic "traffic" {
    for_each = var.serving_revision == "" ? [1] : []
    content {
      type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
      percent = 100
    }
  }

  dynamic "traffic" {
    for_each = var.serving_revision == "" ? [] : [var.serving_revision]
    content {
      type     = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
      revision = traffic.value
      percent  = 100
    }
  }

  # Getaggte Revisionen ohne Traffic: über ihre eigene URL erreichbar und damit
  # das Rollback-Ziel. Ein Tag macht die Revision zugleich adressierbar und
  # nimmt sie aus Cloud Runs automatischer Bereinigung — deswegen die Retention
  # im Skript und nicht "alles behalten".
  dynamic "traffic" {
    for_each = local.tags
    content {
      type     = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
      revision = traffic.value
      percent  = 0
      tag      = traffic.key
    }
  }
}

# Die App authentifiziert ihre Nutzer selbst (NextAuth + Firebase); der Dienst
# muss öffentlich erreichbar sein. Entspricht --allow-unauthenticated.
resource "google_cloud_run_v2_service_iam_member" "public" {
  count = var.allow_unauthenticated ? 1 : 0

  project  = google_cloud_run_v2_service.this.project
  location = google_cloud_run_v2_service.this.location
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
