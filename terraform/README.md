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
├── firestore-env/       # pro Environment: Datenbank, Rules, Indexes, Field-Overrides
└── cloudbuild-triggers/ # pro Environment: Build-Trigger
environments/
├── dev/                 # Firestore-DB ffndev, State-Prefix cloudrun/hydrantenmap/dev
└── prod/                # Firestore-DB (default), State-Prefix cloudrun/hydrantenmap/prod
```

### Lokal arbeiten

```bash
cd terraform/environments/dev      # oder prod

# Einmalig pro Checkout/Worktree: Werte einsetzen. terraform.tfvars ist
# gitignored und muss — wie .env.local — in jedem neuen Worktree nachgezogen
# werden.
cp terraform.tfvars.example terraform.tfvars

tofu init
tofu plan -out tfplan
tofu apply tfplan
```

Jedes Environment hat einen **eigenen State**. `dev` und `prod` können unabhängig voneinander
geplant und appliziert werden.

### dev und prod im selben GCP-Projekt

Heute liegen beide Environments im Projekt `ffn-utils`; unterschieden werden sie nur durch die
Firestore-Datenbank (`ffndev` vs. `(default)`) und das zugehörige Rules-Release. Die
Projekt-Basis-Ressourcen existieren pro Projekt nur einmal und gehören deshalb genau einem
Environment. Das steuert `manage_project_base`:

- `prod`: `true` — prod besitzt die Projekt-Basis
- `dev`: `false` — dev teilt das Projekt mit prod

### dev auf ein eigenes GCP-Projekt umstellen

In `environments/dev/terraform.tfvars`:

```hcl
project             = "<neues-projekt>"
state_bucket        = "<neuer-state-bucket>"
manage_project_base = true
```

Zusätzlich in `environments/dev/backend.tf` Bucket und Prefix anpassen. Am Modulcode ändert sich
nichts.

### Backend

Bucket und Prefix stehen fest in `environments/<env>/backend.tf`. Falls `.envrc` Backend-Parameter
über `TF_CLI_ARGS_init` oder `-backend-config` setzt, **muss das entfernt werden** — CLI-Argumente
überschreiben die HCL-Werte, und beide Environments würden auf denselben State zeigen.

## Pipeline

`.github/workflows/terraform.yml`:

| Ereignis | Aktion |
| --- | --- |
| Push auf einen Branch ≠ `main`, oder PR nach `main` | `plan` für dev und prod |
| Push auf `main` | `apply` auf dev |
| Release veröffentlicht | `apply` auf prod |
| `workflow_dispatch` | Environment und Modus wählbar |

Läuft nur bei Änderungen an `terraform/**`, `firebase/**`, `storage.rules` oder am Workflow selbst.
`firebase/**` gehört dazu, weil Terraform die Rules und Index-Definitionen liest.

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
cd terraform/environments/prod
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
