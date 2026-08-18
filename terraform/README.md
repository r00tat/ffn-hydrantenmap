# hydrantenmap Infrastructure as Code

## Requirements

- Opentofu 1.12 (genaue Version in `.tool-versions`, identisch mit `TOFU_VERSION` im Workflow)
- direnv

## Environments

Der Code ist in zwei getrennt applybare Environments aufgeteilt, die aus gemeinsamen Modulen gebaut
werden:

```text
modules/
├── project-base/        # pro GCP-Projekt einmal: APIs, Service Accounts, Registries,
│                        # Secrets, Workload Identity, Firebase-Projekt, Storage-Rules
├── cloud-run/           # pro Environment: der Dienst, Traffic-Tags, Rollback
├── firestore-env/       # pro Environment: Datenbank, Rules, Indexes, Field-Overrides
├── cloud-scheduler/     # pro Environment: Wochenbericht-Job
└── cloudbuild-triggers/ # pro Environment: Build-Trigger
projects/
└── ffn-utils/           # die Projekt-Basis, State-Prefix cloudrun/hydrantenmap/project/ffn-utils
environments/
├── dev/                 # Firestore-DB ffndev, State-Prefix cloudrun/hydrantenmap/dev
└── prod/                # Firestore-DB (default), State-Prefix cloudrun/hydrantenmap/prod
```

**Ein Projekt-Root je GCP-Projekt, ein Environment-Root je Umgebung.** Der Projekt-Root hält, was
ein Environment-Apply bereits vorfindet statt es anzulegen — Rechte des Pipeline-SA, APIs,
Secret-Hüllen, Registries, WIF. Er läuft in beiden Pipelines vor jedem Environment-Apply.

### Lokal arbeiten

```bash
cd terraform/environments/dev      # oder prod, oder projects/ffn-utils

# Einmalig pro Checkout/Worktree: Werte einsetzen. terraform.tfvars ist
# gitignored und muss — wie .env.local — in jedem neuen Worktree nachgezogen
# werden.
cp terraform.tfvars.example terraform.tfvars

tofu init

# Nur in den Environment-Roots: Image und Traffic-Tags aus dem laufenden Dienst
# holen. Ohne das fragt tofu beim plan nach `image`. Ohne --image bleibt das
# laufende Image stehen — ein lokaler Apply dreht die App also nicht zurück.
# Aus dem Repository-Wurzelverzeichnis, nach dem init (das Skript fragt den
# Root über `tofu console` nach Projekt, Region und Dienstnamen):
#   npm run tfvars:dev      # bzw. npm run tfvars:prod
tofu plan -out tfplan
tofu apply tfplan
```

Jedes Environment hat einen **eigenen State**. `dev` und `prod` können unabhängig voneinander
geplant und appliziert werden.

### dev und prod im selben GCP-Projekt

Heute liegen beide Environments im Projekt `ffn-utils`; unterschieden werden sie durch die
Firestore-Datenbank (`ffndev` vs. `(default)`), den Dienstnamen und ein paar Suffixe. Es gibt
deshalb genau einen Projekt-Root, auf den beide Environments zeigen.

Früher steuerte das ein `manage_project_base`-Flag, das die Projekt-Basis dem prod-Root zuschlug.
Das koppelte eine Voraussetzung des dev-Applies an die Release-Kadenz von prod: Eine neue Rolle
oder ein neues Secret wurde erst beim nächsten Release wirksam, bis dahin scheiterte dev mit 403.
Der eigene Projekt-Root behebt das.

### dev auf ein eigenes GCP-Projekt umstellen

1. Neuen Projekt-Root `projects/<projekt-id>/` anlegen (Kopie von `projects/ffn-utils/`, eigener
   `backend.tf`-Prefix, `project` auf die neue ID).
2. `BASE_ROOT` in `.github/workflows/cloud-run.yml` und `terraform.yml` für dev auf den neuen Root
   zeigen lassen — beide Ausdrücke haben dafür bereits zwei Zweige.
3. In `environments/dev/`: `project` und den `backend.tf`-Prefix umstellen.
4. Repository-Secrets und -Variablen (`CLOUDSDK_CORE_PROJECT`, `WORKLOAD_IDENTITY_PROVIDER`,
   `TERRAFORM_SERVICE_ACCOUNT`, `GOOGLE_SERVICE_ACCOUNT`, `IMAGE`, `RUN_SERVICE`) in den
   Environment-Scope verschieben.

**Nichts über die Projektgrenze reichen lassen** — sonst kehrt dieselbe Falle als
Cross-Project-Abhängigkeit zurück, und ein SA kann sich im fremden Projekt keine Rechte erteilen.
Eigener State-Bucket, eigene Artifact Registry, eigener WIF-Pool je Projekt. Am Modulcode ändert
sich nichts.

### Backend

Bucket und Prefix stehen fest in `environments/<env>/backend.tf`. Falls `.envrc` Backend-Parameter
über `TF_CLI_ARGS_init` oder `-backend-config` setzt, **muss das entfernt werden** — CLI-Argumente
überschreiben die HCL-Werte, und beide Environments würden auf denselben State zeigen.

## Pipeline

`.github/workflows/terraform.yml`:

| Ereignis | Aktion |
| --- | --- |
| PR nach `main` | `plan` für Projekt-Basis, dev und prod, Ergebnis als PR-Kommentar |
| `workflow_dispatch` | Root (`base`/`dev`/`prod`) und Modus wählbar |

Der `plan` läuft auf **jedem** PR, nicht nur bei Änderungen an `terraform/**`. Ein Merge löst
seit dem Umbau einen `apply` über den ganzen Environment-Root aus — dazu den der Projekt-Basis
davor. Ob der durchgeht, hängt damit nicht mehr nur am Terraform-Code im PR, sondern auch an
Drift, an Rechten und an allem, was jemand von Hand geändert hat. Vorher war ein Deploy ein
`gcloud run deploy` auf einen Dienst; jetzt ist der Blast Radius die ganze Umgebung.

Ein Plan ohne Änderungen kostet ~40 s und **kommentiert nichts** — sonst trüge jeder
Dependabot-PR drei Klappboxen mit „No changes.". Erkannt wird das über
`tofu plan -detailed-exitcode` (0 = keine Änderungen, 2 = Änderungen), nicht über einen Textfund
im Plan. Steht schon ein Plan-Kommentar am PR, wird er trotzdem aktualisiert, damit kein
überholter Plan stehen bleibt.

**Appliziert wird nicht hier, sondern beim Deploy** (`.github/workflows/cloud-run.yml`): Der
Cloud-Run-Dienst liegt seit dem Umbau selbst in Terraform, ein Deploy ist damit ein `apply` — auf
dev bei jedem Push auf `main`, auf prod bei jedem Release-Tag, jeweils nach einem Apply des
Projekt-Roots. Der `workflow_dispatch`-Apply hier bleibt als Handgriff, etwa für den Erstimport.
Beide Workflows teilen die Concurrency-Gruppen `tf-apply-<root>`.

Konfiguration im Repository:

| Name | Art | Zweck |
| --- | --- | --- |
| `WORKLOAD_IDENTITY_PROVIDER` | Secret | WIF-Provider für die GCP-Authentisierung |
| `TERRAFORM_SERVICE_ACCOUNT` | Secret | E-Mail des Terraform-SA, wird impersoniert |
| `TF_BUILD_SERVICE_ACCOUNT` | Secret | E-Mail des Cloud-Build-SA (`TF_VAR_build_service_account`) |
| `CLOUDSDK_CORE_PROJECT` | Variable | GCP-Projekt-ID (`TF_VAR_project`) |

Solange `WORKLOAD_IDENTITY_PROVIDER` **oder** `TERRAFORM_SERVICE_ACCOUNT` fehlt — in Fork-PRs immer,
vor dem Bootstrap des Terraform-SA ebenfalls — laufen im `plan`-Job nur `fmt -check` und `validate`.
Es gibt dann keinen Auth-Fehler, aber auch keinen Plan.

### Bootstrap des Terraform-SA

Henne-Ei: Der SA, den die Pipeline benutzt, wird von Terraform selbst angelegt. Reihenfolge:

```bash
cd terraform/projects/ffn-utils
tofu init
tofu plan -out tfplan          # erwartet: nur Creates für den terraform SA
tofu apply tfplan
tofu output -raw terraform_sa_email
```

Die ausgegebene E-Mail als Repository-Secret `TERRAFORM_SERVICE_ACCOUNT` hinterlegen. Erst danach
kann die Pipeline authentisieren.

Der SA hat faktisch Projekt-Administrator-Rechte (siehe `modules/project-base/terraform_sa.tf`) —
das ist für automatisiertes `apply` unvermeidlich und bewusst so entschieden.

## Service Account Configuration

The application uses a service account for server-side operations including Gmail access, Google Sheets, Drive, and Vertex AI.

### IAM Roles

The service account needs the following IAM roles:

| Role | Purpose |
|------|---------|
| `roles/firebase.admin` | Firebase/Firestore access |
| `roles/aiplatform.user` | Vertex AI / Gemini model access |

```bash
# Add Vertex AI role
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/aiplatform.user"
```

### Google Workspace Domain-Wide Delegation

For Gmail, Sheets, and Drive access via impersonation, configure domain-wide delegation in Google Workspace Admin Console:

1. Go to **Admin Console** → **Security** → **API Controls** → **Domain-wide Delegation**
2. Click **Add new**
3. Enter the service account **Client ID**
4. Add the following OAuth scopes:

```
https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/drive
```

| Scope | Purpose |
|-------|---------|
| `gmail.send` | Send Kostenersatz emails |
| `gmail.readonly` | Read Unwetter alarm emails |
| `gmail.modify` | Unstar processed emails |
| `spreadsheets.readonly` | Import data from Google Sheets |
| `drive` | Create Einsatz folders in Drive |

### Required APIs

Ensure these APIs are enabled in your Google Cloud project:

- `aiplatform.googleapis.com` - Vertex AI
- `firebasevertexai.googleapis.com` - Firebase Vertex AI
- `gmail.googleapis.com` - Gmail API
- `sheets.googleapis.com` - Sheets API
- `drive.googleapis.com` - Drive API

### Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT` | Service account JSON credentials |
| `EINSATZMAPPE_IMPERSONATION_ACCOUNT` | Email address to impersonate for Workspace APIs |
