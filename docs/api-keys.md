# API-Keys und App Check

Warum es diese Datei gibt: die beiden API-Keys des Firebase-Projekts sind von
Firebase **automatisch** angelegt worden und wachsen von selbst weiter — jedes
aktivierte Firebase-Produkt trägt sich neue Dienste in die Freigabeliste ein.
Der Browser-Key hatte so über die Jahre 63 freigegebene Dienste gesammelt, unter
anderem Gemini. Diese Datei hält fest, welcher Dienst warum in welchem Key steht,
damit die Liste beim nächsten Zuwachs gegen etwas geprüft werden kann.

## Die zwei Keys

Beide sind von Firebase angelegt und heißen entsprechend „Browser key (auto
created by Firebase)" und „Android key (auto created by Firebase)". Die uids
stehen absichtlich nicht hier — `gcloud services api-keys list` liefert sie.

Die Kommandos in dieser Datei erwarten die Projekt-ID in `PROJECT`, etwa
`PROJECT=$(gcloud config get-value project)` oder die `projectId` aus
`NEXT_PUBLIC_FIREBASE_APIKEY` in `.env.local`.

| Key | Bindung | Wer benutzt ihn |
| --- | --- | --- |
| Browser key | HTTP-Referrer (18 Einträge) | Web-App, Chrome-Extension und die Android-App (siehe unten) |
| Android key | Paketname + 3 SHA-1 | nur die **nativen** Firebase-Plugins der Android-App |

**Die Android-App benutzt überwiegend den Browser-Key, nicht den Android-Key.**
Capacitor lädt in `capacitor/capacitor.config.ts` mit `webDir: 'empty'` die
Web-App unter `https://einsatz.ffnd.at` in ein WebView. Das JavaScript darin ist
dieselbe Web-App und damit derselbe Browser-Key; die Origin
(`einsatz.ffnd.at`) ist über `*.ffnd.at/*` freigegeben. Den Android-Key nutzen
nur `@capacitor-firebase/authentication` und `@capacitor-firebase/crashlytics`,
also der native Teil.

## Der Browser-Key ist öffentlich — Referrer sind kein Schutz

Der Browser-Key steckt als `NEXT_PUBLIC_FIREBASE_APIKEY` im ausgelieferten
JS-Bundle. Das ist bei Firebase so vorgesehen und kein Fehler. Wichtig ist die
Folge daraus: die Referrer-Einschränkung stützt sich auf den `Referer`-Header,
den der Aufrufer selbst setzt — mit `curl -H "Referer: https://einsatz.ffnd.at/"`
ist sie umgangen. Sie hilft gegen versehentliche Fremdnutzung, nicht gegen
Absicht.

Deshalb gilt für alles, was über diesen Key kostenpflichtig abgerechnet wird:
**entweder Firestore-Regeln, oder App Check.** Ein Dienst, für den keins von
beidem greift, darf nicht in der Freigabeliste stehen.

## Freigabeliste Browser-Key

Elf Dienste, je einer mit Grund:

| Dienst | Warum |
| --- | --- |
| `firestore.googleapis.com` | Firestore-SDK — durch Firestore-Regeln abgesichert |
| `firebasestorage.googleapis.com` | Storage — durch Storage-Regeln abgesichert |
| `identitytoolkit.googleapis.com` | Firebase Auth |
| `securetoken.googleapis.com` | Token-Refresh von Firebase Auth |
| `firebaseinstallations.googleapis.com` | Voraussetzung für FCM, App Check und AI Logic |
| `firebaseappcheck.googleapis.com` | **der Token-Tausch von App Check selbst** — fällt der weg, bricht App Check und damit Gemini |
| `fcm.googleapis.com`, `fcmregistrations.googleapis.com` | Push |
| `firebasevertexai.googleapis.com` | Gemini über Firebase AI Logic — durch App Check erzwungen, s. unten |
| `firebaseml.googleapis.com` | Altname derselben AI Logic. Bleibt drin, weil unklar ist, ob die Key-Prüfung den aufgerufenen (`firebasevertexai`) oder den kanonischen Namen ansetzt — App Check zählt unter dem Altnamen. Kostet nichts: der Dienst ist im Projekt nicht aktiviert und zusätzlich erzwungen |
| `firebase.googleapis.com` | Konfigurations-Lookup des SDK; nur mit OAuth für mehr zu gebrauchen |

Bewusst **entfernt** wurden `places` und `texttospeech` — beide
kostenpflichtig, beide client-seitig ungenutzt: die Adresssuche läuft über
Nominatim, Text-to-Speech serverseitig in `src/app/api/tts/route.ts` mit
Service-Account. Dazu `automl` (ungenutzt) und der gesamte
Infrastruktur-Block (`gmail`, `drive`, `sheets`, `script`, `secretmanager`,
`iam`, `bigquery`, `run`, `cloudbuild`, `storage`, …). Dieser Block war mit
einem API-Key allein ohnehin nicht zu gebrauchen — diese APIs verlangen OAuth —,
aber jede Zeile darin ist eine, die bei künftigen Google-Änderungen zur Flanke
wird.

## Freigabeliste Android-Key

Der Android-Key ist an `at.ffnd.einsatzkarte` plus drei SHA-1-Fingerprints
gebunden. Alle drei sind nötig, jeder steht für einen Weg, wie die App auf ein
Gerät kommt:

| SHA-1 | Herkunft |
| --- | --- |
| `9578368d0be1e2b431f186adf4a6ad43d16d9575` | `~/.android/debug.keystore` — Debug-Builds |
| `433c2b61ab492b2b4740e7a986114ffdeddf76e2` | `capacitor/android/release.keystore` — lokale Release-Builds, gleichzeitig das Upload-Zertifikat |
| `8851e200ba51d7e1c3d2370e8baf8b0d9a5b71fb` | Play App Signing — Google signiert das `.aab` beim Ausliefern neu |

Wer einen davon entfernt, schneidet den zugehörigen Verteilweg ab: ohne den
Play-Fingerprint funktioniert die aus dem Store installierte App nicht mehr,
obwohl der lokale Release-Build weiter läuft. Die registrierten Fingerprints
lassen sich gegenprüfen:

```bash
gcloud services api-keys describe <key> --project="$PROJECT" \
  --format='value(restrictions.androidKeyRestrictions.allowedApplications)'
keytool -list -v -keystore ~/.android/debug.keystore \
  -alias androiddebugkey -storepass android | grep SHA1
```

**Gemini fehlt im Android-Key bewusst.** Nichts am nativen Teil ruft ein
KI-Modell auf, also sind `firebasevertexai`, `firebaseml` und `mlkit` dort
entfernt. Damit ist der Gemini-Pfad über diesen Key nicht bloß abgesichert,
sondern gar nicht vorhanden — das ist die stärkere Aussage und verlangt keine
laufende Pflege.

## App Check: die Erzwingung hängt an `firebaseml`, nicht an `firebasevertexai`

Das ist die Stolperstelle. Das SDK ruft `firebasevertexai.googleapis.com` auf
(`VertexAIBackend` in [../src/components/firebase/vertexai.ts](../src/components/firebase/vertexai.ts)),
und genau dieser Dienst muss im API-Key freigegeben sein. **App Check zählt und
erzwingt dieselben Anfragen aber unter dem Namen `firebaseml.googleapis.com`** —
der Altbezeichnung von Firebase AI Logic. Wer die Erzwingung auf
`firebasevertexai` setzt, schaltet ins Leere: unter dem Namen entstehen keine
Verdikte.

Nachsehen, wo die Verdikte wirklich landen:

```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" \
  "https://firebaseappcheck.googleapis.com/v1/projects/$PROJECT/services" | jq .
```

Der Web-Client initialisiert App Check in
[../src/hooks/useFirebaseAppCheck.ts](../src/hooks/useFirebaseAppCheck.ts) über
den reCAPTCHA-Enterprise-Provider mit dem Site-Key aus
`NEXT_PUBLIC_RECAPTCHA_KEY`. Der Site-Key ist nur für die deployten Domains
freigegeben, `localhost` ist **nicht** darunter.

### Lokal entwickeln

Ohne Debug-Token sind Gemini-Aufrufe von `localhost` seit der Erzwingung
abgelehnt. Abhilfe über `.env.local`:

- `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=true` — das SDK schreibt bei jedem Reload ein
  frisches Token in die Browser-Konsole. Einmal in der Firebase Console unter
  App Check → Apps → Debug-Tokens registrieren, dann festnageln.
- `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=<uuid>` — ein bereits registriertes Token
  wiederverwenden.

Die Variable ist absichtlich opt-in und steht nie in
`.github/workflows/cloud-run.yml`, damit ein deployter Build nicht versehentlich
auf den Debug-Provider zurückfällt.

### Was bewusst nicht erzwungen ist

Firestore, Storage und Auth stehen weiter auf `UNENFORCED`. Der Grund steht in
den Zahlen: über 30 Tage kommen auf Firestore rund 4,6 Mio. Anfragen mit
gültigem Token, aber auch etwa 223.000 mit `INVALID` und 19.000 mit
`MISSING_OUTDATED_CLIENT`. Eine Erzwingung würde diese Clients mitten im Einsatz
abschneiden. Firestore-Regeln und die Auth-Guards tragen dort ohnehin; App Check
wäre eine zusätzliche Schicht, keine fehlende.

Bei Firebase AI Logic ist es umgekehrt: dort gibt es keine Regelschicht, der Key
ist öffentlich, und die Abrechnung läuft über Tokens. Deshalb ist genau dieser
eine Dienst erzwungen. Firebase erzwingt App Check für AI Logic ab dem
2026-11-02 ohnehin von sich aus, ohne Abschaltmöglichkeit.

## Drift

Die Keys sind **nicht** in Terraform abgebildet. Das ist eine bewusste
Abwägung: ein `tofu destroy`/`create` auf einem API-Key vergibt einen neuen
Key-String und legt damit die App still, und der Key-String steckt in
GitHub-Variablen, im `.env.local` und in `google-services.json`. Der Preis
dafür ist, dass Firebase die Freigabelisten wieder auffüllt, sobald ein neues
Produkt aktiviert wird. Prüfstand:

```bash
gcloud services api-keys list --project="$PROJECT" --format=json \
  | jq -r '.[] | "\(.displayName): \((.restrictions.apiTargets // []) | length) Ziele"'
```

Wächst eine Zahl gegenüber den 11 bzw. 23 Zielen oben, ist etwas dazugekommen,
das hier nicht begründet ist.
