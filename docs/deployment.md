# Deployment und Projekt-Basis

Cloud Run wird über Terraform ausgerollt, nicht über `gcloud run deploy`.

Der Cloud-Run-Dienst liegt in [terraform/modules/cloud-run](../terraform/modules/cloud-run/);
deployt wird mit `tofu apply`, nicht mit `gcloud run deploy`. Der Deploy-Job in
[cloud-run.yml](../.github/workflows/cloud-run.yml) baut das Image und appliziert
anschließend den Root der Zielumgebung — dev bei jedem Push auf main, prod bei
jedem Release-Tag.

**Es gibt genau einen automatischen Applier.** [terraform.yml](../.github/workflows/terraform.yml)
plant nur noch (PRs) und hat einen `workflow_dispatch`-Apply als Handgriff. Beide
Workflows teilen die Concurrency-Gruppe `tf-apply-<env>`, zwei gleichzeitige
apply auf denselben State sind damit ausgeschlossen.

**Der Plan läuft ohne State-Lock** (`-lock=false`). Ein Plan liest den State und
schreibt ihn nicht; mit Lock scheitert er sofort mit `412 conditionNotMet`,
sobald irgendwo ein apply läuft. Die Concurrency-Gruppen der Plan-Jobs sind
per-PR und wissen von `tf-apply-<env>` nichts — der Apply der Projekt-Basis
läuft bei jedem Push auf main und traf so wiederholt die Plans offener PRs
(#702). Der Preis ist ein Plan gegen einen State, der sich gerade ändert: Er
kann veraltet sein, und was er zeigt, ist ohnehin nie eine Zusage für den
späteren apply. Ein Plan gegen einen fremden apply anzuhalten würde den
PR-Check nur so lange blockieren, wie der apply dauert, und danach dasselbe
Ergebnis liefern.

**Aus PRs wird nicht mehr deployt.** Ein Deploy ist jetzt ein Apply, und ein
Apply mit ungeprüftem Terraform-Code aus einem PR-Branch gegen die gemeinsame
Dev-Umgebung wäre nicht zu verantworten.

### Einen Branch auf dev ausrollen

*Actions → Cloud Run → Run workflow*, Branch wählen, `serving_revision` **leer
lassen**. Das baut das Image, appliziert die Projekt-Basis und appliziert dev —
dieselben drei Jobs wie ein Push auf main, nur für diesen Branch. Zielumgebung
ist dev, weil sie aus `github.ref_type` abgeleitet wird; nach prod geht nur ein
Tag. Der Branchname wird zum Traffic-Tag, die Revision ist danach unter
`https://<tag>---<dienst>-<hash>.a.run.app` erreichbar.

Ist das Feld dagegen gefüllt, ist es ein Rollback: Der Build entfällt und der
Traffic geht auf die genannte, bereits existierende Revision.

**Ein PR pusht kein Image.** Er plant nur, also würde das Image in der Registry
liegen, ohne je eine Revision zu werden — und von keiner Aufräumregel erfasst,
weil die an den Revisionen hängt. Gebaut wird trotzdem: Der Build ist der Test,
dass das Image überhaupt entsteht, und trägt Lint und Tests. Steuernd ist
`PUSHED` im Setup-env-Step von [cloud-run.yml](../.github/workflows/cloud-run.yml);
daran hängen auch der Inline-Cache und der Digest-Step, denn ohne Push gibt es
keinen Registry-Digest.

Deshalb löscht [cleanup-artifacts.yml](../.github/workflows/cleanup-artifacts.yml)
beim Schließen eines PRs auch keinen Traffic-Tag mehr — der `traffic`-Block in
terraform ist autoritativ, und `--keep-branches` lässt den Tag eines gemergten
Branches beim nächsten Dev-Deploy von selbst wegfallen. Das Image wird weiter
gelöscht, weil ein von Hand ausgerollter Branch eines hat.

### Revisionsnamen und Fingerabdruck

Der Revisionsname wird gesetzt, nicht von Cloud Run generiert — sonst kennt
terraform ihn beim Plan nicht und könnte keinen Traffic-Tag darauf legen. Er
lautet `<dienst>-<version>-<fingerabdruck>`, wobei der Fingerabdruck ein Hash
über alles ist, was ins Template einfließt (`local.template_fingerprint`).

Revisionen sind unveränderlich: Ein geändertes Template unter einem schon
vergebenen Namen wird abgelehnt. Der Fingerabdruck sorgt dafür, dass sich der
Name genau dann ändert, wenn sich der Inhalt ändert — ein apply ohne Änderung
legt keine neue Revision an. **Wer dem Template ein Feld hinzufügt, trägt es in
den Fingerabdruck ein**, sonst scheitert der apply an einem Namenskonflikt.

**Ausgerollt wird der Digest, nicht der Tag.** Der Build gibt
`<image>@sha256:…` weiter (`image_ref` in [cloud-run.yml](../.github/workflows/cloud-run.yml)),
nicht `<image>:main`. Ein Tag ist veränderlich: Jeder Push auf main baut nach
`…:main`, zwei Pushes hintereinander ergäben denselben Fingerabdruck, denselben
Revisionsnamen und damit „no changes" — das neue Image würde nie ausgerollt.
Mit `gcloud run deploy` fiel das nicht auf, weil gcloud jedes Mal einen frischen
Revisionsnamen erzeugt. Der Digest ändert sich genau dann, wenn sich der Inhalt
ändert; der Tag bleibt in der Registry als Einstieg für Menschen. Wer die
Image-Referenz je wieder aus einem Tag bildet, bricht den Dev-Deploy —
lautlos, weil der apply erfolgreich durchläuft.

### Traffic-Tags und ihre Bereinigung

Der `traffic`-Block ist autoritativ: Was nicht drinsteht, verliert seinen Tag.
Das ist beabsichtigt, denn ein Tag macht seine Revision adressierbar und nimmt
sie damit dauerhaft aus Cloud Runs automatischer Bereinigung (Limit 1000
Revisionen je Dienst, 2000 Tags je Projekt und Region). Vor der Umstellung waren
so 108 Tags in prod und 73 in dev aufgelaufen, die meisten davon Branches, die es
längst nicht mehr gibt.

Welche Tags bleiben, entscheidet [scripts/cloud-run-tfvars.sh](../scripts/cloud-run-tfvars.sh),
das vor jedem Plan und Apply `cloudrun.auto.tfvars.json` schreibt (gitignored):

- **prod:** `--keep 20` — die zwanzig jüngsten Releases als Rollback-Fenster.
- **dev:** `--keep-branches` — nur Tags, zu denen es auf origin noch einen Branch
  gibt. Ein gemergter Branch verliert seinen Tag beim nächsten Dev-Deploy von
  selbst.

Das Skript ist auch die einzige Stelle, die einen Git-Ref auf einen Tag
normalisiert (`--print-tag`); der Workflow bildet den Image-Tag darüber, statt
die Abbildung ein zweites Mal in `sed` nachzubauen.

**Lokal genügt `npm run tfvars:dev` bzw. `npm run tfvars:prod`.** Das `--env`
des Skripts fragt den Terraform-Root per `tofu console` nach Projekt, Region
und `local.service_name` und leitet daraus auch Zieldatei und
Aufbewahrungsregel ab — deshalb steht in `package.json` keine Projekt-ID und
kein Dienstname. Voraussetzung ist ein initialisierter Root (`tofu init`).
Argumente lassen sich durchreichen: `npm run tfvars:dev -- --image … --version …`.

**Ohne `--image` liest das Skript Image und Revisions-Suffix aus dem laufenden
Dienst.** Nur deshalb kann ein Apply von Hand, der etwa Firestore-Regeln ändert,
die App nicht versehentlich auf einen alten Stand zurückdrehen. Das Suffix steht
dafür als Label `deploy-version` an der Revision.

### Rollback

Ein `gcloud run services update-traffic` von Hand ist **kein Rollback mehr,
sondern Drift** — der nächste apply dreht ihn zurück. Der Weg zurück führt über
den Workflow:

*Actions → Cloud Run → Run workflow*, Feld `serving_revision` auf die
Zielrevision (z.B. `hydrantenmap-v2-62-0-a1b2c3d4`). Ist das Feld gesetzt, wird
der Build übersprungen — ein Rollback baut nichts, es zeigt auf eine Revision,
die es schon gibt. Getaggte Revisionen sind vorher unter ihrer eigenen URL
(`https://<tag>---<dienst>-<hash>.a.run.app`) prüfbar.

Der Nachteil gegenüber `gcloud`: Ein Rollback dauert so lang wie ein Apply,
Größenordnung ein bis zwei Minuten statt zehn Sekunden.

### Übernahme bestehender Dienste

`imports.tf` in beiden Roots holt den seit 2021 bzw. 2022 bestehenden Dienst in
den State. Die Blöcke dürfen stehenbleiben — terraform überspringt sie, sobald
die Ressource im State liegt — und können nach dem ersten erfolgreichen Apply in
beiden Umgebungen entfallen.

## Projekt-Basis

**Ein Root je GCP-Projekt, nicht je Environment** — derzeit
[terraform/projects/ffn-utils](../terraform/projects/ffn-utils/). Dort liegt alles,
was ein Environment-Apply bereits **vorfindet**, statt es anzulegen: die Rechte
des Pipeline-SA, die aktivierten APIs, die Secret-Hüllen, die Registries, der
WIF-Pool, die Storage-Regeln.

Vorher gehörte das dem Prod-Root über ein `manage_project_base`-Flag. Damit hing
eine Voraussetzung des Dev-Applies an der Release-Kadenz von prod: Eine neue
Rolle wurde erst beim nächsten Release wirksam, und bis dahin scheiterte dev mit
403 auf der neuen Ressource. Das galt genauso für ein neues Dev-Secret oder eine
neu gebrauchte API. Die Regel „erst prod applien" war das Symptom, nicht die
Lösung — sie ist ersatzlos entfallen.

**Der Base-Job in [cloud-run.yml](../.github/workflows/cloud-run.yml) läuft vor
jedem Environment-Apply**, parallel zum Build. Die Reihenfolge ist damit
erzwungen statt dokumentiert. Der `workflow_dispatch`-Apply in
[terraform.yml](../.github/workflows/terraform.yml) kennt `base` zusätzlich als
Auswahl — gebraucht wird er nur für den Erstimport.

### Wenn dev ein eigenes Projekt bekommt

Die Struktur ist darauf ausgelegt und ändert sich dabei **nicht**: Es kommt ein
zweiter Root `terraform/projects/<projekt-id>/` dazu, und `BASE_ROOT` in beiden
Workflows zeigt für dev dorthin. Die Environment-Roots bleiben, wie sie sind.

Ersatzlos entfallen dann die Kunstgriffe, die es nur gibt, weil beide sich ein
Projekt teilen: `name_suffix` im [cloud-scheduler](../terraform/modules/cloud-scheduler/),
der zweite Eintrag in `local.cron_invoker_emails` samt `check`-Block, das `-dev`
im Dienstnamen, die `SUMUP_*_DEV`-Secrets und die Firestore-Datenbank `ffndev`.
`CLOUDSDK_CORE_PROJECT`, `WORKLOAD_IDENTITY_PROVIDER`, `TERRAFORM_SERVICE_ACCOUNT`,
`GOOGLE_SERVICE_ACCOUNT`, `IMAGE` und `RUN_SERVICE` wandern vom Repository- in
den Environment-Scope.

**Wichtig dabei: nichts über die Projektgrenze reichen lassen.** Sonst kehrt
genau dieselbe Falle als Cross-Project-Abhängigkeit zurück, nur schlimmer — ein
Service Account kann sich im fremden Projekt keine Rechte erteilen. Betrifft drei
Dinge, die heute geteilt sind und dann verdoppelt gehören: **State-Bucket**
(sonst müsste prod dem Dev-SA Zugriff geben), **Artifact Registry** (sonst
bräuchte der Dev-Runtime-SA einen Cross-Project-Reader) und der **WIF-Pool**.
Hält man das durch, wissen die beiden Pipelines nichts mehr voneinander.

Der Erstaufbau eines neuen Projekts (Projekt, Bucket, SA, WIF, erste Rollen)
bleibt Handarbeit — er erzeugt die Credentials, mit denen terraform danach
arbeitet.
