# ============================================================================
# Projekt-Basis von ffn-utils
#
# Ein Root je GCP-Projekt, nicht je Environment. Hier liegt alles, was ein
# Environment-Apply bereits **vorfindet** statt es anzulegen: die Rechte des
# Pipeline-SA, die aktivierten APIs, die Secret-Hüllen, die Registries, der
# WIF-Pool, die Storage-Regeln.
#
# Vorher gehörte das dem prod-Root (`manage_project_base = true`). Damit hing
# eine Voraussetzung des dev-Applies an der Release-Kadenz von prod: Eine neue
# Rolle wurde erst beim nächsten Release wirksam, und bis dahin scheiterte dev
# mit 403 auf der neuen Ressource. Deshalb der eigene Root, und deshalb hängt
# in beiden Pipelines jeder Environment-Apply an einem Apply dieses Roots.
#
# Teilen sich dev und prod ein Projekt (aktuell so), gibt es einen dieser
# Roots und beide Environments zeigen darauf. Bekommt dev ein eigenes Projekt,
# kommt ein zweiter dazu (terraform/projects/<projekt-id>/) — die
# Environment-Roots ändern sich dabei nicht.
# ============================================================================

locals {
  repo_root = "${path.root}/../../.."

  # Hüllen für Werte, die außerhalb von terraform gepflegt werden. Die
  # _DEV-Varianten gibt es, weil sich dev und prod dieses Projekt teilen; mit
  # getrennten Projekten heißen sie dort schlicht ohne Suffix.
  secrets = [
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

module "project_base" {
  source = "../../modules/project-base"

  project            = var.project
  region             = var.region
  run_region         = var.run_region
  name               = var.name
  run_sa             = var.run_sa
  deploy_sa          = var.deploy_sa
  github_org         = var.github_org
  github_repo        = var.github_repo
  state_bucket       = var.state_bucket
  storage_rules_file = "${local.repo_root}/storage.rules"
  secrets            = local.secrets
}
