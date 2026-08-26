# Fahrtenbuch

PDF-Export, Wochenbericht, Fahrzeug-Cache, Einsatzbezug, Personennamen,
Duplikatsprüfung, Änderungsrecht an einer Fahrt, Zeiten beim Zweckwechsel und
Mangel-Bilder.

## Fahrtenbuch-PDF-Export

Der Export ([fahrtenbuchExportActions.ts](../src/components/Fahrtenbuch/fahrtenbuchExportActions.ts))
rendert **nicht ein Dokument**, sondern Teildokumente von je 100 Tabellenzeilen,
die [renderFahrtenbuchPdf](../src/components/Fahrtenbuch/renderFahrtenbuchPdf.ts)
mit `pdf-lib` zu einer Datei zusammenfügt.

Grund ist der Speicher: `@react-pdf/renderer` hält das vollständig ausgelegte
Dokument bis zum Schluss im Speicher, gemessen 0,3–0,5 MB je Zeile. Ein
Jahresexport über alle Fahrzeuge kam auf ~600 MB und wurde vom Container (damals
512Mi) abgeräumt — im Browser als `503 Service unavailable` sichtbar (#665). Am
teuersten ist ein **einzelnes** Fahrzeug mit vielen Fahrten, weil react-pdf einen
über viele Seiten laufenden Abschnitt beim Umbrechen wiederholt neu auslegt:
3000 Fahrten auf einem Fahrzeug kosteten 2061 MB und 36 s, in Teilen 920 MB und
15 s.

Daran hängen drei Dinge, die zusammengehören:

- **Die Seitenzahl wird nach dem Zusammenfügen gestempelt.** Ein Teildokument
  kennt nur seine eigenen Seiten und finge sonst jedes Mal wieder bei 1 an.
  Die Maße des Fußes (`FOOTER_*` in
  [FahrtenbuchPdf.tsx](../src/components/Fahrtenbuch/FahrtenbuchPdf.tsx)) sind
  deshalb exportiert und werden von beiden Seiten benutzt.
- **Teile nicht kleiner machen.** Jedes Teil beginnt eine neue Seite; unter 50
  Zeilen wächst die Datei, ohne Speicher zu sparen.
- **Ein Render je Instanz.** `renderFahrtenbuchPdf` serialisiert die Läufe —
  Cloud Run lässt bis zu 80 Anfragen auf denselben Container, und ein OOM reißt
  alle mit, nicht nur den Export.

Das Speicherlimit steht auf **1Gi**, als Vorgabewert von `memory` in
[terraform/modules/cloud-run](../terraform/modules/cloud-run/variables.tf). Vorher
war es ein `--memory`-Flag am `gcloud run deploy`, und weil `gcloud` additiv
arbeitet, hing der tatsächliche Wert daran, ob seit der Änderung schon einmal
deployt wurde — prod lief nach #674 noch monatelang auf den alten 512Mi.

Die Größenprüfung (`MAX_EXPORT_ENTRIES`, 5000) läuft als Count-Query **vor** dem
Lesen. Die Zählung braucht dasselbe `orderBy('abfahrt', 'desc')` wie die
Leseabfrage — sonst sucht Firestore einen Index `deleted ASC, abfahrt ASC`, den
es nicht gibt.

## Fahrtenbuch-Wochenbericht

Cloud Scheduler ruft montags 07:00 (Europe/Vienna)
`POST /api/fahrtenbuch/weekly-report` auf. Der Lauf verschickt je Gruppe mit
gepflegten `fahrtenbuchConfig.mangelEmails` einen Bericht über die Fahrten der
abgeschlossenen ISO-Vorwoche — Fahrtentabelle je Fahrzeug, Wochensumme,
Plausibilitätswarnungen zu den Zählerständen und die offenen Mängel. Empfänger
sind dieselben wie bei der Mangel-Benachrichtigung; eine leere Liste ist die
Abschaltung.

Authentifiziert über ein OIDC-ID-Token, geprüft von
[cronRequired](../src/server/auth/cronRequired.ts) gegen `CRON_INVOKER_EMAILS`.
Infrastruktur im Terraform-Modul
[cloud-scheduler](../terraform/modules/cloud-scheduler/) — in Dev bewusst
**pausiert**, damit nicht zwei Umgebungen dieselbe Verteilerliste bemailen.

Job und Invoker-Service-Account legt terraform an; nach dem `apply` ist nur noch
der Job in Prod zu entpausieren. Dev und Prod teilen das Projekt `ffn-utils`,
deshalb tragen die Ressourcen beider Umgebungen ein `name_suffix` (Prod `""`, Dev
`"-dev"`) — ohne das legten beide Roots denselben Service Account und denselben
Job an und der zweite `apply` scheiterte mit 409.

Die API-Aktivierung (`cloudscheduler.googleapis.com`) und die Rolle
`roles/cloudscheduler.admin` des Pipeline-SA hängen beide am Modul
[project-base](../terraform/modules/project-base/). Das liegt im Projekt-Root
(siehe „Projekt-Basis"), der in beiden Pipelines vor jedem Environment-Apply
läuft — eine Erweiterung ist damit sofort wirksam. Die frühere Regel „erst prod
applien" gibt es nicht mehr.

Die Allowlist `CRON_INVOKER_EMAILS` setzt terraform als Env-Var des Dienstes
(`local.cron_invoker_emails` im jeweiligen Root). Sie wird dort aus Zeichenketten
gebaut statt aus `module.cloud_scheduler` gelesen: Der Dienst braucht die Liste,
der Scheduler braucht die URL des Dienstes — eine Referenz ergäbe einen Zyklus.
Ein `check`-Block im Root prüft deshalb nach jedem apply, dass der tatsächliche
Invoker-SA auf der gebauten Liste steht. Wer eine Umgebung hinzufügt, erweitert
die Suffix-Liste **und** setzt das passende `name_suffix`.

**Von Hand versenden:** Im Admin-Bereich unter Fahrtenbuch → Einstellungen sitzt
der Abschnitt „Wochenbericht versenden"
([WeeklyReportSendSection](../src/components/Fahrtenbuch/admin/WeeklyReportSendSection.tsx)).
Woche wählbar (letzte abgeschlossene voreingestellt), Empfänger vorbelegt aus
`mangelEmails` und **nur für diesen Versand** überschreibbar — die Änderung wird
nicht gespeichert. „Vorschau" ist der `dryRun` und verschickt nichts.

Der Versand läuft über `sendWeeklyReportForGroup`, das dieselbe interne
`runForGroup` benutzt wie der Montagslauf: Die Mail von Hand ist dieselbe
Nachricht, nicht bloß eine gleich gebaute. Empfänger sind dort **Pflicht**, es
gibt keinen Rückfall auf die gepflegte Liste — wer das Feld leer räumt, würde
sonst ausgerechnet die Adressen bemailen, die er gerade entfernt hat.

Die Plausibilitätswarnungen vergleichen auch gegen die letzte Fahrt **vor** dem
Zeitraum. Nur so fällt ein falscher Kilometerstand am Wochenanfang auf — der
Grund, aus dem es den Bericht überhaupt gibt.

Zum Prüfen ohne Versand (`dryRun` baut den Bericht und gibt Betreff und
Textfassung zurück, verschickt aber nichts):

```bash
SERVICE_URL=https://<host>
# In Dev heißt der Invoker fahrtenbuch-report-invoker-dev (siehe name_suffix).
TOKEN=$(gcloud auth print-identity-token \
  --impersonate-service-account=fahrtenbuch-report-invoker@<projekt>.iam.gserviceaccount.com \
  --audiences="$SERVICE_URL")
curl -s -X POST "$SERVICE_URL/api/fahrtenbuch/weekly-report" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"year":2026,"week":32,"dryRun":true}' | jq
```

Ein Fehler bei einer Gruppe beendet den Lauf nicht und ergibt trotzdem 200 —
sonst würde der Scheduler wiederholen und den erfolgreichen Gruppen die Mail
doppelt schicken. 500 gibt es nur, wenn **keine** Gruppe eine Mail bekommen hat
**und mindestens eine gescheitert ist**; dann ist die Wiederholung gefahrlos.
Ein Lauf, in dem alle Gruppen übersprungen wurden (keine Empfänger gepflegt) und
ein Lauf ohne jede konfigurierte Gruppe antworten dagegen mit 200: Da ist nichts
zu wiederholen. Eine stumme Woche ist deshalb an den `results` zu erkennen, nicht
am Status-Code.

## Fahrzeug-Cache im Fahrtenbuch

Zählerstände, letzte Fahrt, Defekt-Hinweis und Mängelzähler stehen am
Fahrzeugdokument, damit die Übersicht sie zeigen kann, ohne alle Fahrten und
Mängel der Gruppe zu laden. Geschrieben wird der Cache an genau einer Stelle:
`refreshVehicleCache` in [mangelStore.ts](../src/components/Fahrtenbuch/mangelStore.ts),
aufgerufen nach jeder Mutation an einer **Fahrt oder einem Mangel**.

- **Eine Funktion für beide Hälften**, weil sie sich überschneiden:
  `lastEntryMangelId` sagt, ob es zur jüngsten Fahrt einen Mangeldatensatz
  gibt, und ändert sich sowohl mit der Fahrt als auch mit den Mängeln. Zwei
  Auffrischungen, die je nur ihre Hälfte kennen, ließen genau die Widersprüche
  zu, aus denen #706 entstand.
- **Geschrieben wird mit `merge: true`**, deshalb setzt die Funktion *alle*
  Felder — ein weggelassenes ließe den alten Wert stehen. Wer ein Feld
  hinzufügt, trägt es dort ein.
- **„Defekt gemeldet" ist der Rückfall für Altdaten**, nicht die zweite Anzeige
  neben dem Mängelzähler. Die Regel steht in
  [defectHint.ts](../src/components/Fahrtenbuch/defectHint.ts) und gilt für
  Fahrzeugkarte und Fahrzeugseite gleichermaßen: Gibt es zur letzten Fahrt
  einen Mangeldatensatz, spricht dieser — offen über den Zähler, behoben gar
  nicht mehr. Vorher verdeckte der Zähler den Hinweis nur, und das Beheben des
  letzten Mangels machte ihn nicht weg, sondern erst sichtbar.
- **`undefined` heißt „nie geschrieben", nicht „nein".** Fahrzeuge, deren Cache
  älter ist als ein Feld, fallen auf die Ableitung aus den geladenen Fahrten
  und Mängeln zurück; ein gecachtes `null`/`false`/`0` tut das nicht.

## Einsatzbezug hinter dem Freigabe-Link

Das Gastformular hinter `/fahrtenbuch/teilen/<token>` bietet die letzten
Einsätze der Gruppe an (`SHARE_LINK_FIRECALL_LIMIT`, 10) und belegt einen neuen
Eintrag mit dem neuesten vor. Wer den QR-Code am Fahrzeug nutzt, trägt fast
immer die Fahrt zum laufenden Einsatz ein; einen „aktiven" Einsatz gibt es dort
nicht, den kennt nur die angemeldete App.

Vorher verwarf `createFahrtenbuchEntryViaShareLink` jeden mitgeschickten
Einsatzbezug. Das war richtig, solange die Seite keine Einsätze kannte — jetzt
kennt sie welche, und an die Stelle der Verwerfung tritt eine Prüfung:

- **Der Name kommt aus dem Einsatz-Dokument, nicht aus der Anfrage**
  (`resolveFirecallForGroup`). Hinter dem Formular steht niemand, dessen Eingabe
  man zurechnen könnte; ein frei gesetzter Einsatzname wäre unkontrollierter
  Fremdinhalt in einem Nachweisdokument.
- **Der Einsatz muss zu der Gruppe des Links gehören** und darf nicht gelöscht
  sein, sonst `firecallInvalid`. Abgelehnt statt still verworfen: Der Gast hat
  aus einer Liste gewählt, die diese Seite geliefert hat — bliebe die Fahrt
  stumm ohne Einsatz, hielte er sie für verknüpft.
- **Herausgegeben wird nur Name, Alarmierung und Abrücken**
  (`toShareLinkFirecall`). Koordinaten, Beschreibung und Alarm-IDen haben hinter
  einem anmeldefreien Link nichts zu suchen. Die Zeiten sind der Grund, dass die
  Auswahl überhaupt etwas spart — sie belegen Abfahrt und Ankunft vor.
- **Die Duplikatsprüfung gilt hier auch**, und sie wiegt schwerer: Der Gast sieht
  die Fahrten der Gruppe nicht und kann ein Duplikat vorher nicht erkennen. Die
  Antwort der Action ist seine einzige Warnung, deshalb muss sie einen Weg nach
  vorne lassen — `serverDuplicateKey` in
  [useEntryFormState.ts](../src/components/Fahrtenbuch/useEntryFormState.ts) merkt
  ein serverseitig gemeldetes Duplikat an der Einsatz/Fahrzeug-Kombination und
  zeigt dieselbe Bestätigung wie im Dialog. Am Schlüssel und nicht an einer
  Eintrags-ID, weil der Browser den bestehenden Eintrag hier nie gesehen hat.

## Namen in der Besatzung

Aus BlaulichtSMS kommen die Personen als „Nachname Vorname", die interne
Personenliste des Fahrtenbuchs führt sie als „Vorname Nachname". Beides
nebeneinander zu zeigen ließ dieselbe Person zweimal auftreten — und war eine
der Ursachen doppelter Fahrtenbuch-Einträge (#705).

- **`personDisplayName`** ([common/fahrtenbuch.ts](../src/common/fahrtenbuch.ts))
  zeigt einen Namen in der Schreibweise der Personenliste, sobald er dort
  **eindeutig** trifft (Vergleich über `normalizePersonName`). Ohne Treffer oder
  bei zwei Treffern bleibt der Name, wie er kam: Vor- und Nachname aus einer
  beliebigen Zeichenkette selbst zu erkennen geht nicht verlässlich — „Anna
  Maria Berger" und „Berger Anna Maria" sind von außen nicht zu unterscheiden.
- **Nur die Anzeige.** `displayAssignments` in
  [CrewAssignmentBoard.tsx](../src/components/pages/CrewAssignmentBoard.tsx) legt
  den Namen über die gefilterten Einträge; in Firestore bleibt der gemeldete
  Name stehen, und alle Schreibvorgänge gehen weiter über `id`/`recipientId`.
- **Die Auswahl „Weitere Person hinzufügen" speist sich aus zwei Quellen:** den
  Alarm-Empfängern, die nicht zugesagt haben, und der Personenliste der Gruppe.
  Letztere ist der Grund, dass die Auswahl auch bei einem Einsatz ohne Alarm
  Namen anbietet — oder für jemanden, der gar kein BlaulichtSMS hat.
- **Entdoppelt wird über `normalizePersonName`**, nicht über den rohen Namen,
  sonst stünde derselbe Mensch in gedrehter Schreibweise zweimal in der Liste.
  Der Alarm-Empfänger hat Vorrang: Über ihn ist die Person eindeutig
  identifiziert, über den Namen nur wahrscheinlich.
- **Eine Person aus der Liste entsteht als Eintrag von Hand** — sie hat keine
  Empfänger-ID. Weil dabei die gepflegte Schreibweise übernommen wird, findet
  `resolveDriver` sie über den Namensvergleich wieder.
- **Ein getippter Name geht denselben Weg**, wenn er eine angebotene Person
  trifft — verglichen wieder über `normalizePersonName`, damit „Berger Anna"
  auch „Anna Berger" trifft. Auswahl und Enter auf freiem Text laufen dazu
  durch dasselbe `handleAddPerson`; ein eigener Enter-Handler am Eingabefeld
  lief zusätzlich zur Auswahl von MUI und legte den halb getippten Namen als
  zweite Person an (#712).

## Doppelte Fahrten zu einem Einsatz

Die Fahrten eines Einsatzes entstehen von zwei Seiten: über die Sammelerfassung
auf der Einsatzseite und über den Fahrtenbuch-Dialog. Trug jemand alle Fahrten
ein und der Fahrer später seine eigene noch einmal, stand dieselbe Fahrt zweimal
im Fahrtenbuch — mit doppelten Kilometern und dadurch falschen Zählerständen für
alle folgenden Fahrten.

**Duplikat heißt Einsatz + Fahrzeug.** Pro Einsatz fährt ein Fahrzeug einmal;
mehrere Fahrzeuge und mehrere Fahrer je Fahrzeug bleiben unberührt. Die
Erkennung sitzt in `findEntryForFirecallVehicle`
([common/fahrtenbuch.ts](../src/common/fahrtenbuch.ts)) und wird von beiden Seiten
benutzt.

- **Die Schranke steht in der Action**, nicht im Dialog:
  `createFahrtenbuchEntry` und `updateFahrtenbuchEntry` lehnen mit
  `duplicateFirecallEntry` ab, solange `confirmDuplicate` fehlt. Zwei Geräte
  können dieselbe Fahrt gleichzeitig offen haben. Geprüft wird gegen
  `doc.firecallId` und nicht gegen die Eingabe — ob die Verknüpfung am Dokument
  landet, entscheidet `buildEntryDocument` über den Zweck, und nur was
  gespeichert wird, kann ein Duplikat sein.
- **Bestätigen bleibt möglich.** Es gibt Einsätze, bei denen ein Fahrzeug
  tatsächlich zweimal ausfährt. Bestätigt wird im Formular *diese eine* Fahrt
  (`confirmedDuplicateId` in [useEntryFormState.ts](../src/components/Fahrtenbuch/useEntryFormState.ts)),
  nicht das Formular — wechselt die Auswahl, ist die Bestätigung hinfällig.
- **Die Zeitüberschneidung ist nur eine Warnung.** `overlappingVehicleEntries`
  findet zwei Fahrten desselben Fahrzeugs mit überlappendem Zeitraum, also auch
  das Duplikat einer Fahrt **ohne** Einsatzverknüpfung — etwa aus dem
  Gastformular hinter einem Freigabe-Link, das den Einsatzbezug gar nicht
  mitschickt. Kein Riegel: Zeiten sind im Einsatz oft geschätzt. Berührende
  Zeiträume zählen nicht, das sind zwei aufeinanderfolgende Fahrten.
- **Der Einsatz kommt im Formular hinter dem Zweck und vor dem Ziel** — vorher
  stand er hinter dem Ziel und blieb deshalb meist leer. Gezeigt wird er nur
  beim Zweck `einsatz`: Eine Übung oder eine Versorgungsfahrt gehört zu keinem
  Einsatz, und `submit` verwirft die Verknüpfung dort ohnehin. Die Auswahl setzt
  den Zweck mit auf `einsatz` — das braucht die Vorbelegung, die greift, während
  der Zweck noch auf `sonstiges` steht. Umgekehrt räumt `changeZweck` die
  Verknüpfung: Was im Feld steht, muss dem entsprechen, was gespeichert wird.
- **Hinter dem Zweck steht immer genau ein Feld:** das Einsatzfeld beim Zweck
  `einsatz`, sonst die Fahrtstrecke. Der Zweck hat dafür eine eigene Zeile.
  Vorher teilte er sie mit dem Ziel und das Einsatzfeld nahm eine ganze — das
  Formular sprang bei jedem Wechsel des Zwecks um. Ohne verknüpften Einsatz
  steht das Einsatzfeld für die Fahrtstrecke und trägt deshalb auch die Meldung
  `zielMissing`; sie an ein Feld zu hängen, das gerade nicht da ist, hätte
  niemandem geholfen.
- **Das Einsatzfeld hält ausschließlich verknüpfte Einsätze.** Getippter Text
  wandert beim Verlassen des Feldes in die Fahrtstrecke
  (`commitFirecallInput`) — nicht während des Tippens, weil daraus noch eine
  Auswahl werden kann. Im Feld bleibt er stehen: Beim Zweck `einsatz` ist es das
  einzige Feld dieser Zeile, geräumt wäre die Eingabe für den Benutzer
  verschwunden, obwohl sie gespeichert wird. Hinter einem getippten Namen steht kein Einsatz: kein
  Ort, keine Zeiten, keine Duplikatserkennung. Als zweites Namensfeld daneben
  wäre er nur eine weitere Stelle, an der dasselbe stehen kann; als Ziel ist er
  dort, wo Liste, Export und Wochenbericht ihn ohnehin lesen
  (`entry.ziel?.trim() || entry.firecallName`). `firecallName` trägt damit nur
  noch den Namen des verknüpften Einsatzes, und `firecallInput` ist der eigene
  Zustand des Eingabefeldes. Ein Hinweis nennt den fehlenden Bezug, wenn beim
  Zweck `einsatz` keiner verknüpft ist.
- **Ein neuer Eintrag ist mit dem aktiven Einsatz vorbelegt** — sonst dem
  neuesten der Gruppe (`defaultFirecallOption`). Damit sind Zweck, Einsatz und
  Fahrstrecke schon gesetzt: Die Fahrt zum laufenden Einsatz ist der Regelfall,
  und der verknüpfte Einsatz benennt das Ziel selbst. Den aktiven Einsatz liest
  `FahrtenbuchDialog` über `useFirecallId` — nicht `useEntryFormState`, denn das
  Gastformular hinter einem Freigabe-Link läuft ohne diesen Kontext und belegt
  deshalb nichts vor. Angewandt wird die Vorbelegung als Effekt und nicht als
  Anfangswert des Zustands, weil die Einsatzliste ein Firestore-Snapshot ist und
  beim ersten Rendern leer sein kann; ein `defaultAppliedRef` sorgt dafür, dass
  eine absichtlich geräumte Auswahl beim nächsten Snapshot nicht zurückkommt.
  Beim Bearbeiten gilt ausschließlich der Eintrag — eine Übungsfahrt
  nachträglich einem Einsatz zuzuordnen wäre eine stille Änderung am
  Nachweisdokument. In Tests schaltet `firecalls: []` die Vorbelegung ab, ohne
  die Auswahl ganz zu entfernen.
- **Das Einsatz-Autocomplete braucht `getOptionKey`.** MUI nimmt sonst das Label
  als React-Key, und „G1 Ölspur" gibt es jedes Jahr mehrfach — React verwarf
  dann einen der beiden Listeneinträge.
- **Fahrer und Zusatzfahrer sind in der Sammelerfassung Autocompletes** über
  die Personen der Gruppe. Vorher war der Fahrer ein reines Textfeld: Der
  Maschinist war vorbelegt, aber wer ihn korrigieren musste, tippte den Namen
  neu und verlor die Verknüpfung zur Person — und damit ihren Anteil in der
  Fahrerstatistik. Name und `driverId` werden immer gemeinsam gesetzt.
- **Jede Zeile hat einen eigenen Speichern-Knopf.** Er ruft dasselbe `save()`
  wie „Alle speichern", nur mit einer Auswahl — ein zweiter Pfad würde bei der
  Duplikatserkennung oder der Kilometerlogik auseinanderlaufen. `saving` sperrt
  weiter alle Knöpfe, `savingKey` sagt nur, an welchem der Spinner steht.
- **„Fahrtstrecke berechnen" im Eintrags-Dialog** holt über
  `firecallRoundTripDistance` dieselbe Strecke, die sich die Sammelerfassung
  beim Speichern selbst holt — samt Routen-Cache am Einsatz, der Knopf kostet
  also ab dem zweiten Fahrzeug keinen API-Aufruf mehr. `applyRoundTripToKmCounters`
  **überschreibt** dabei einen eingetragenen Endstand und lässt alle anderen
  Zähler in Ruhe; das ist die Wirkung eines Knopfdrucks, nicht die einer
  Vorbelegung (dafür `autoFillCounterEnds`). Ohne verknüpften Einsatz gibt es
  den Knopf nicht — hinter einem frei eingetippten Namen stehen keine
  Koordinaten. Die Action steckt im Dialog und nicht in `useEntryFormState`,
  damit das Gastformular ohne sie auskommt.
- **`fahrtenbuchEntryCount` am Einsatz** trägt die Anzeige in der
  Einsatz-Übersicht ([Einsaetze.tsx](../src/components/pages/Einsaetze.tsx)).
  Denormalisiert wie der Routen-Cache `fahrtenbuchRoute` und aus demselben
  Grund: Die Übersicht zeigt alle Einsätze der Gruppe auf einmal, eine Abfrage
  je Karte wären dutzende Listener. Gezählt wird bei jedem Schreibvorgang neu
  aus dem Bestand statt hoch- und heruntergezählt; ein Zähler, der driftet, wäre
  schlimmer als keiner. Nur die Anzahl, keine Fahrzeug- oder Fahrernamen — das
  Einsatz-Dokument liest jedes Gruppenmitglied, das Fahrtenbuch nur wer dort
  Mitglied ist. Ein Fehler beim Schreiben bleibt beim Zähler und nimmt die
  erfasste Fahrt nicht mit.
- **Angezeigt wird nur der positive Fall.** Ein Einsatz ohne das Feld heißt
  „nichts bekannt", nicht „keine Fahrten": Für Einsätze von vor der Zählung
  wäre „0 Fahrten" eine falsche Aussage in genau die Richtung, die Duplikate
  erzeugt. Nachgezogen wird der Zähler über `syncFirecallEntryCount`, sobald
  jemand die Einsatzseite öffnet — dort sind die Fahrten dieses Einsatzes
  ohnehin geladen. Die Anzahl aus dem Browser ist nur der Anlass, gezählt wird
  serverseitig.
- **Das Feld „Fahrtstrecke / Ziel" entfällt bei verknüpftem Einsatz** — der
  Einsatz benennt das Ziel selbst. Ausgeblendet heißt dabei nicht bloß
  versteckt: `submit` schickt `ziel` dann leer mit, sonst wirkte ein Text von
  vor der Auswahl weiter, den niemand mehr sieht. Liste, Export und
  Wochenbericht fallen ohnehin auf `firecallName` zurück
  (`entry.ziel?.trim() || entry.firecallName`). Ohne Verknüpfung bleibt das Feld
  Pflicht — dort stünde die Fahrt sonst ohne Angabe da, wohin sie ging. Die
  Sammelerfassung schreibt weiterhin den Einsatznamen ins `ziel`
  (`entryInputsFromRows`); beide Formen zeigen dasselbe an.
- **Ankunft vor Abfahrt** lehnt `validateEntryInput` mit
  `ankunftBeforeAbfahrt` ab und gilt damit auch serverseitig; `timeOrderInvalid`
  markiert das Feld sofort, statt die Meldung erst beim Speichern zu bringen.

## Wer eine Fahrt korrigieren darf

Entscheidend ist `canModifyEntry` in
[entryPermissions.ts](../src/components/Fahrtenbuch/entryPermissions.ts): der
Ersteller, ein Verwalter (`isFahrtenbuchManager` — Admin oder Gerätemeister)
oder — nur bei Fahrten aus dem Freigabe-Link — der eingetragene Fahrer.

**Der Fahrer als dritter Fall ist die Auflösung eines Widerspruchs.** Wer über
den QR-Code am Fahrzeug einträgt, ist nicht angemeldet: `createdBy` ist
`share:<linkId>`, `createdByName` nur der getippte Fahrername. Am Eintrag stand
damit der eigene Name, das Ändern scheiterte aber an „nur der Ersteller darf
ändern" — und in der Praxis kommt fast ein Drittel der Fahrten über diesen Weg.
Ein Eintrag ohne Ersteller hat keinen, dem er gehört; der genannte Fahrer ist
die einzige Person, die ihn zurechnen kann.

Zugeordnet wird **ausschließlich über `person.userId`** — die Verknüpfung
zwischen Benutzerkonto und Fahrtenbuch-Person, gesetzt auf der gepflegten Seite
(Personenliste der Gruppe) und nicht von dem, der sich darauf beruft.

**Kein Namensvergleich, und das ist der Kern.** Naheliegend wäre, den
Fahrernamen am Eintrag mit dem Anzeigenamen der Sitzung zu vergleichen — der
erste Wurf tat das und war eine Rechteausweitung. `session.user.name` ist die
Firebase-`displayName`, und die gehört dem Benutzer selbst: Sie stammt aus einem
Freitextfeld der Selbstregistrierung
([StyledLogin.tsx](../src/components/firebase/StyledLogin.tsx)) und ist danach
jederzeit über `updateProfile` änderbar — auch ohne dass diese App eine
Oberfläche dafür anbietet, denn das Client-SDK genügt. Ein Gruppenmitglied
könnte sich damit auf den Namen einer Kollegin umbenennen und deren über den
QR-Code erfasste Fahrten ändern **und löschen**. In einem Nachweisdokument ist
das genau die stille Verfälschung, gegen die die Zuordnung überhaupt da ist.

Auch die Gegenrichtung trägt nicht: Hinter dem Freigabe-Link ist der Fahrername
freie Eingabe, und der Link hängt als QR-Code am Fahrzeug. Wer ihn hat, könnte
Einträge auf einen beliebigen Namen anlegen.

**Ohne gepflegte Verknüpfung greift die Ausnahme nicht** — dann bleibt die
Korrektur einer QR-Fahrt beim Gerätemeister und beim Admin. Lieber eine
Korrektur, die den Gerätemeister braucht, als eine, die sich über einen selbst
gewählten Namen erschleichen lässt.

`person.userIds` ist eine **Liste**, weil sich Mitglieder mehrfach
registrieren: Dieselbe Person hat dann zwei Konten, und beide sind sie. Die
Abfrage läuft entsprechend über `array-contains`.

Die Ausnahme gilt außerdem **nur** bei Einträgen ohne Ersteller. Bei einer
angemeldet erfassten Fahrt bleibt es beim Ersteller — sonst dürfte der
eingetragene Fahrer den Eintrag eines Kollegen überschreiben.

Drei Dinge, die daran hängen:

- **Server und Client rechnen dasselbe.** `mayModifyEntry` in den Actions und
  `useEntryPermissions` im Client rufen dieselbe Funktion. Der Bearbeiten-Knopf
  in der Fahrtenliste und in der Einsatz-Erfassung erscheint nur, wo das
  Speichern durchgeht — vorher stand er an jeder Fahrt, der Dialog ging auf,
  alles war ausfüllbar, und erst das Speichern verweigerte. Die Sicherheitsgrenze
  bleibt die Action; der Knopf ist Bedienung.
- **Die Personenabfrage kostet einen Lesevorgang** und wird deshalb erst
  gestellt, wenn Verwalterrecht und Ersteller-Treffer nicht schon reichen — und
  auch dann nur bei einem Freigabe-Link-Eintrag mit `driverId`. Verwalter und
  Ersteller, also die Mehrheit, kommen ohne sie durch.
- **Der Anzeigename taugt nur zur Anzeige.** `createdByName` und `updatedByName`
  stehen am Eintrag, damit die Liste einen Namen zeigen kann, ohne eine
  Benutzerabfrage zu stellen. Keiner der beiden darf je eine Berechtigung
  begründen.
- **`entryPermissions.ts` liegt nicht in `entryLogic.ts`**, aus demselben Grund
  wie `managerPermissions.ts`: Die Liste braucht die Prädikate im Client und
  zöge sonst das Eintrags-Validierungsmodul in ihr Bundle.

**Die Änderung ist am Eintrag ausgewiesen.** `updatedByName` steht neben
`updatedBy` (der UID), damit die Liste den Änderer nennen kann, ohne eine
Benutzerabfrage zu stellen — dieselbe Verdopplung wie `createdByName` neben
`createdBy`. Optional, weil Einträge aus der Zeit davor es nicht haben und ihr
Änderer nachträglich nicht mehr zu benennen ist. Die Liste zeigt zwei stille
Zeichen in der Aktionsspalte: ein QR-Symbol für die Herkunft aus dem
Freigabe-Link — es ist der Grund, aus dem dort womöglich kein Bearbeiten-Knopf
steht — und ein Verlaufssymbol mit „Geändert am … von …", sobald `updatedAt`
von `createdAt` abweicht.

## Personen den Benutzerkonten zuordnen

`person.userIds` entsteht im Dialog „Bestehende Benutzer zuordnen"
([PersonUserLinkDialog](../src/components/Fahrtenbuch/admin/PersonUserLinkDialog.tsx)),
die Zuordnungslogik steht rein und geprüft in
[personUserMatch.ts](../src/components/Fahrtenbuch/personUserMatch.ts).

**Hier darf der Namensvergleich, was er in der Berechtigung nicht darf.** Der
Unterschied ist, wer sich auf ihn beruft: In der Berechtigung wäre es der
Benutzer selbst, mit einem Namen, den er sich gegeben hat. Hier ist es ein
Vorschlag, den ein Admin sieht und bestätigt. Und ohne ihn ginge es nicht — nur
5 von rund 110 Personendatensätzen tragen überhaupt eine E-Mail.

Die Reihenfolge der Signale:

- **Die gepflegte E-Mail zuerst.** Sie steht in den Stammdaten der Gruppe, ist
  dort von Hand gepflegt und trifft auch, wenn im Konto ein Spitzname oder ein
  alter Nachname steht. Ein E-Mail-Treffer beendet die Suche und löst damit auch
  die Doppelregistrierung auf, bei der zwei Konten denselben Namen tragen.
- **Sonst der Name**, normalisiert mit `normalizePersonName` (wortweise
  sortiert, damit „Schennet Adrian" und „Adrian Schennet" dieselbe Person sind).

Vier Zustände, und der Umgang mit ihnen ist der Kern:

- `unique` — genau ein offenes Konto. **Vorgehakt, aber bestätigungspflichtig.**
- `ambiguous` — **nicht vorgehakt.** Ein vorgehakter mehrdeutiger Vorschlag
  überspränge genau die Prüfung, für die der Dialog da ist. Zwei Anlässe führen
  hierher: mehrere gleichnamige Konten (die Doppelregistrierung) und ein Konto,
  das auch zu einer anderen, noch unverknüpften Person passt (`contestedBy` —
  zwei echte Menschen können denselben Namen tragen, das Konto gehört aber nur
  einem).
- `none` — kein Konto anzuhaken. Auch der Fall, dass ein passendes Konto
  existiert, aber **schon einer anderen Person gehört**: Es wird nicht angeboten,
  sondern über `takenBy` samt Namen erklärt. Es wegzugeben hieße, dass zwei
  Fahrer dieselben Fahrten ändern dürfen; unerklärt fehlen darf es aber auch
  nicht.
- `linked` — **sobald ein Konto verknüpft ist.** Die Person gilt als versorgt und
  verschwindet aus dem Arbeitsstapel, auch wenn eine Zweitregistrierung offen
  wäre; sonst nagte die erledigte Zuordnung weiter. Das weitere Konto bleibt in
  `candidates` und ist über „Verknüpfte Personen anzeigen" anhakbar.

Sortiert wird nach Handlungsbedarf, nicht alphabetisch: Was eine Entscheidung
braucht, steht oben.

Drei Dinge, die daran hängen:

- **Gerätemeister und Admin, mit verschiedenem Blickfeld.** Zuordnen darf beide
  (`actionFahrtenbuchManagerRequired`), aber der Gerätemeister sieht nur Konten,
  die **Mitglied seiner Gruppe** sind. Die Personen seiner Feuerwehr kennt er
  ohnehin namentlich; die Konten anderer Feuerwehren sind nicht seine Sache, und
  ein Verteiler über alle Konten der App wäre etwas anderes als die Aufgabe, die
  er hier erledigt. Der Admin sieht alle — nur er kann eine fehlende
  Gruppenzugehörigkeit richtigstellen, und ohne das Konto zu sehen wüsste er
  nicht, dass es sie gibt.

  Der Zuschnitt gilt **auch beim Speichern** und ist dort die Grenze: Die
  Nutzlast kommt vom Client und kann jede Kennung nennen. Ein Filter, der nur im
  Vorschlag steht, wäre keiner.

  Für den Gerätemeister heißt das: Ein passendes Konto, das nicht in seiner
  Gruppe ist, erscheint als „kein Konto gefunden". Das ist von seiner Warte
  richtig — verknüpfen würde ihm nichts bringen, weil `actionGroupMemberRequired`
  einem Nichtmitglied das Bearbeiten ohnehin verwehrt. Für den Admin ist dasselbe
  Konto sichtbar und als „nicht in dieser Gruppe" markiert.

- **Herausgegeben wird nur, was der Dialog zum Entscheiden braucht** —
  Anzeigename, E-Mail und drei Merkmale (gesperrt, nicht freigeschaltet, nicht in
  der Gruppe). Kein Telefon, keine Tokens, kein Rest des Benutzerdokuments; ein
  Test nagelt die Whitelist fest. Die Merkmale werden **angezeigt und nicht
  gefiltert**: Wer genau diese Arbeit macht, soll sehen, was gegen eine Zuordnung
  spricht, statt dass ein Konto unerklärt fehlt.
- **Gesetzt, nicht ergänzt.** `savePersonUserLinks` schreibt die Kontenliste je
  Person vollständig; eine leere Liste löst die Verknüpfung. Nur so lässt sich
  eine falsche Zuordnung im Dialog auch wieder wegnehmen. Geschrieben werden
  ausschließlich die Zeilen, die der Aufrufer geschickt hat — ein Batch über alle
  Personen würde die Verknüpfungen der übrigen stillschweigend leeren.
- **Zwei Prüfungen, die der Dialog nicht ersetzt.** Jede UID muss ein Konto sein
  (sonst stünde am Personendatensatz eine Kennung, die irgendwann jemandem
  gehört), und ein Konto gehört höchstens einer Person je Gruppe (sonst dürften
  zwei Fahrer denselben Eintrag ändern und keiner wäre es sicher). Die zweite
  Prüfung liest dazu den **gespeicherten** Stand aller Personen und nicht nur die
  mitgeschickten Zeilen: Sonst ließe sich ein Konto einer Person zuschlagen, die
  im Aufruf gar nicht vorkommt — sie behielte es. Was derselbe Aufruf neu setzt,
  gibt die bisherigen Ansprüche derselben Person frei, sonst kollidierte eine
  Zeile mit sich selbst.
- **Die Freischaltung steht am Benutzerdokument als `authorized`**, nicht als
  `isAuthorized` — erst `getUserSessionData` benennt sie für die Sitzung um. Wer
  das verwechselt, zeigt an *jedem* Konto „nicht freigeschaltet". Gelesen wird
  mit `isTruthy`, weil ältere Dokumente „true" als Text tragen; dieselbe
  Behandlung wie in `auth.ts`.

Nach dem Speichern lädt der Dialog neu, statt seinen Zustand fortzuschreiben:
Danach steht dort, was wirklich gespeichert ist, und ein zweites Speichern kann
nichts doppeln.

## Zeiten beim Zweckwechsel

Ein neuer Eintrag wird mit dem aktiven Einsatz vorbelegt, und `changeFirecall`
übernimmt dessen Alarmierung und Abrücken als Abfahrt und Ankunft. Wechselt der
Zweck danach weg von `einsatz`, verwarf `changeZweck` die Verknüpfung — die
Zeiten des Einsatzes blieben aber stehen und sahen aus wie eine Eingabe. Sie zu
übersehen hieß, eine fremde Uhrzeit als eigene Fahrt zu erfassen.

Deshalb setzt der Zweckwechsel das Datum auf **heute** und leert die
**Uhrzeiten** von Abfahrt und Ankunft. Der Tag bleibt, weil wer den Zweck
wechselt fast immer eine Fahrt von heute einträgt; nur die Uhrzeit ist zu
ergänzen, und dass sie fehlt, ist am Feld zu sehen und blockiert das Speichern
(`abfahrtTimeMissing` / `ankunftTimeMissing`).

Daran hängen drei Entscheidungen:

- **Datum und Uhrzeit sind getrennte Felder** (`type="date"` + `type="time"`)
  und nicht mehr ein `datetime-local`. Ein `datetime-local` kennt kein „Datum
  ja, Uhrzeit nein" — leer wäre der Tag mit weg, und genau der soll bleiben.
- **Der Zeitstempel bleibt gültig** (heute, 00:00). Ein leerer Zeitstempel zöge
  sich durch Dublettenprüfung, Überschneidungswarnung, Zählerlogik und
  Validierung. Statt den Wert unvollständig zu machen, merken die beiden Flags,
  dass seine Uhrzeit nichts behauptet: das Feld zeigt sie nicht, und `submit`
  verweigert. Die Prüfung ist rein clientseitig — der Server kann den
  Unterschied nicht sehen und muss es nicht.
- **Nur ein vorbelegter Zeitvorschlag wird geleert**, gemerkt in
  `firecallTimesRef`. Beim Bearbeiten eines bestehenden Eintrags und nach einer
  Eingabe von Hand stehen echte Zeiten im Formular; die zu leeren zerstörte eine
  Angabe, die niemand nachtragen kann. Das Datum zu korrigieren trägt die
  Uhrzeit übrigens nicht nach — wer den Tag ändert, hat noch nicht gesagt, wann
  er losgefahren ist.

## Mangel-Bilder

Zu einem Fahrzeugmangel gehören Fotos (`Mangel.images`, [mangel.ts](../src/common/mangel.ts)).
Gespeichert wird der Storage-**Pfad**, nicht die URL — eine Download-URL veraltet, der
Pfad nicht. Dateien liegen unter `groups/{groupId}/mangel/{mangelId}/{uuid}-{name}`.

- **Gelesen wird über Signed URLs vom Server**, nicht über die Storage-Regeln: Die
  Berechtigung hängt an der Gruppenmitgliedschaft, und die steht in Firestore. Ein
  `firestore.get` aus einer Storage-Regel trifft immer die Default-Datenbank und gäbe in
  der Dev-Datenbank `ffndev` die falsche Antwort. Deshalb verweigert
  [storage.rules](../storage.rules) jedem Client das Lesen und die Action `mangelImageUrls`
  ([mangelActions.ts](../src/components/Fahrtenbuch/mangelActions.ts)) prüft die
  Mitgliedschaft und signiert. Gleiches Muster wie bei den Bug-Report-Anhängen.
- **Jeder Pfad aus dem Browser wird geprüft** (`sanitizeMangelImages`) — beim Schreiben
  *und* beim Signieren. Ohne das zeigte ein Mangel auf Dateien einer fremden Gruppe.
- **Hochgeladen wird erst beim Speichern** des Dialogs; nach einem erfolgreichen Upload
  gelten die Bilder sofort als gespeichert, damit ein zweiter Anlauf nach einem Fehler
  nicht dieselben Dateien noch einmal hochlädt.
- **Größe und Typ sind eine Schranke der `storage.rules`** (15 MB, `image/.*`), aber der
  Browser prüft sie vorher mit: `prepareMangelImage`
  ([compressImage.ts](../src/components/Fahrtenbuch/compressImage.ts)) verkleinert und wirft
  dann gegen `MANGEL_MAX_IMAGE_BYTES`/`isAllowedMangelImageType` aus
  [mangel.ts](../src/common/mangel.ts). Ohne das lehnt der Storage mit
  `storage/unauthorized` ab und der Melder liest nur „Upload fehlgeschlagen". Die Prüfung
  steht **nach** dem Verkleinern — ein 20-MB-Handyfoto ist danach in Ordnung — und **vor**
  dem ersten Upload, sonst lägen bei fünf Fotos die ersten vier ohne Dokument im Storage.
  Die 15 MB stehen an zwei Orten; ein Test in `src/common/mangel.test.ts` liest
  `storage.rules` und vergleicht.
- **Ein Foto ohne MIME-Typ** ist kein Sonderfall, sondern kommt von manchen
  Android-Sharetargets. Der Typ wird dann aus der Endung abgeleitet
  (`imageTypeFromName`); vorher ging die Datei als `application/octet-stream` in den
  Upload und lief in die Contenttype-Bedingung der Regel.
- **Gelöscht wird serverseitig** — beim Entfernen eines einzelnen Bildes (`updateMangel`
  bekommt die vollständige Liste, was fehlt, fliegt aus dem Storage) und beim Löschen des
  Mangels.
- **`storage.rules` wird über terraform ausgerollt**
  (`google_firebaserules_ruleset`/`_release` in
  [firebase.tf](../terraform/modules/project-base/firebase.tf)), nicht über `firebase deploy`
  — in `firebase.json` steht die Datei deshalb bewusst nicht. Die Regeln gelten für den
  Default-Bucket `<projekt>.appspot.com`, den es je Projekt einmal gibt; sie liegen deshalb
  im Projekt-Root und werden bei jedem Push auf main vor dem Deploy appliziert. **Dev und
  prod teilen sich diesen Bucket** — beide Dienste tragen `ffn-utils.appspot.com` in ihrer
  Firebase-Konfiguration.
- Die Liste zeigt nur die **Anzahl** der Bilder, der Dialog die Vorschaubilder: Jedes Bild
  braucht eine eigene Signatur, für eine ganze Tabelle wären das dutzende Aufrufe.

## Gerätemeister

Ein Admin trägt je Gruppe Gerätemeister ein (Einstellungen-Tab der
Fahrtenbuch-Verwaltung). Sie dürfen zusätzlich zum Admin jeden Eintrag ihrer
Gruppe korrigieren und die Fahrzeuge und Personen pflegen — nicht aber die
Gruppeneinstellungen, die Share-Links, den PDF-Import oder das Löschen von
Mängeln.

Die Rolle steht als Liste von Gruppen-IDs **am Benutzerdokument**
(`user/{uid}.fahrtenbuchGeraetemeister`) und nicht an `fahrtenbuchConfig`, wo
die Mangel-Empfänger liegen. Grund ist der Leseweg: `fahrtenbuchConfig` ist für
Clients gesperrt, also bräuchte jeder Guard einen zusätzlichen Firestore-Read
und jede Seite, die die Rolle kennen muss — Drawer, Seitenschutz,
Bearbeiten-Knöpfe — einen Server-Action-Roundtrip. Am Benutzerdokument nimmt
die Rolle denselben Weg wie `isAdmin` und `groups`: über `getUserSessionData`
in die Session und von dort in den Client.

Manipulationssicher ist das, weil `/user/{uid}` in den Regeln nur `read`
erlaubt und der Catch-all am Dateiende Schreibrechte an `adminUser()` bindet —
dasselbe Dokument trägt schon heute `isAdmin`.

Drei Dinge, die daran hängen:

- **Kein Custom Claim.** Die Firestore-Regeln brauchen die Rolle nicht:
  Fahrzeuge, Personen und Einträge werden ausschließlich über Server Actions
  mit dem Admin SDK geschrieben. Ein Claim erzwänge dagegen einen
  Token-Refresh bei jeder Rollenänderung.
- **`arrayUnion`/`arrayRemove` statt Liste neu schreiben.** Zwei Admins, die
  gleichzeitig zwei *verschiedene* Gruppen pflegen, fassen dasselbe
  Benutzerdokument an und überschrieben sich sonst gegenseitig.
- **`userSessionCache.invalidate()` nicht vergessen.** Ohne die Invalidierung
  in `saveFahrtenbuchGeraetemeister` bliebe eine Rollenänderung bis zum
  Cache-Ablauf wirkungslos — dieselbe Falle wie in `updateUser.ts`.

Die Entscheidung fällt an genau einer Stelle:
`isFahrtenbuchManager(groupId, user)` in
[managerPermissions.ts](../src/components/Fahrtenbuch/managerPermissions.ts).
Sie liegt bewusst nicht in `entryLogic.ts` — auch der Drawer braucht sie, und
der zöge sonst das Eintrags-Validierungsmodul in sein Bundle. Die Asymmetrie
darin ist Absicht: Der Gerätemeister braucht die Mitgliedschaft in der Gruppe,
der Admin nicht (sonst nähme man ihm ein Recht, das er unter
`actionAdminRequired()` in den Stammdaten-Actions immer hatte).

