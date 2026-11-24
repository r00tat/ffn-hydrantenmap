# Objektunterlagen und Meldersuche

Zu einem Risikoobjekt oder gefährdeten Objekt lassen sich Brandschutzpläne,
Laufkarten und Fotos hinterlegen (siehe „Risikoobjekte und gefährdete
Objekte"). Im Popup des Objekts öffnet „Pläne öffnen" einen Vollbild-Dialog
mit Suche, Unterlagenliste und Viewer. Die Suche findet Melder („3/05",
„MG 3 M 5") und Text; ein Treffer öffnet die Seite und markiert die Stelle.

## Risikoobjekte und gefährdete Objekte

Beide Arten kommen aus dem GIS in eigenen Collections (`risikoobjekt`,
`gefahrobjekt`), haben dieselben Felder und beide Pläne. Überall, wo Pläne
vorkommen, stehen sie gemeinsam: Seite `/risikoobjekte`, „Mögliche
Risikoobjekte und gefährdete Objekte" am Einsatz, Popup auf der Karte,
Drive-Abgleich und „Neu einlesen".

- **Die Art ist der Pfad.** `ObjektArt` in
  [objektArt.ts](../src/common/objektplan/objektArt.ts) ist zugleich Name der
  Collection und des Felds im Cluster. Jede Server Action bekommt Art und ID
  und prüft beide (`isObjektArt`, `isObjektId`), bevor sie damit einen
  Firestore- oder Storage-Pfad baut.
- **Eine Regel für beide.** Firestore und Storage matchen `/{art}/…` und
  lassen nur die beiden Arten zu; andere Collections mit einer Untersammlung
  `dokument` bleiben zu (Regeltests in `firebase/`).
- **Im Browser** liest `usePlanObjekte` beide Collections und kennzeichnet jedes
  Objekt mit seiner Art (`PlanObjekt`). In den Listen zeigt ein Chip die Art
  (`ObjektArtChip`): Risikoobjekt rot, gefährdetes Objekt orange.
- **Neu angelegt** werden in der App nur Risikoobjekte; gefährdete Objekte
  kommen aus dem GIS und lassen sich verknüpfen und freigeben.
- **Schlüssel der Texterkennung:** Risikoobjekte behalten
  `{objektId}_{dokumentId}`, gefährdete Objekte bekommen das Präfix
  `gefahrobjekt_`, damit sich gleiche IDs beider Arten nicht treffen.

## Ablage

- **Datei in Storage** unter `{art}/{objektId}/{dokumentId}-{name}`,
  **Daten in Firestore** unter `{art}/{objektId}/dokument/{dokumentId}`
  ([objektDokument.ts](../src/common/objektplan/objektDokument.ts)); `{art}`
  ist `risikoobjekt` oder `gefahrobjekt`.
- **Unter dem Objekt, nicht im Cluster.** Die Cluster (`clusters6`) baut der
  GIS-Import neu; was dort hinge, wäre beim nächsten Import weg. Die
  Unterdokumente hängen an der stabilen ID des Objekts.
- **Lesen nur die freigegebenen Gruppen**, siehe „Freigabe an Gruppen". Die
  Storage-Regel prüft dafür ein Metadatum der Datei statt `firestore.get` und
  hat damit nicht das Problem der Dev-Datenbank (siehe Mangel-Bilder in
  `storage.rules`).
- **Höchstgröße 100 MB**, steht in `storage.rules` und in
  `OBJEKT_DOKUMENT_MAX_MB`; ein Test vergleicht beide. Der größte vorhandene
  Plan hat 55 MB.

## Indizieren im Browser beim Hochladen

[pdfPlanIndex.ts](../src/components/Objektplan/pdfPlanIndex.ts) liest mit pdfjs
den Text jeder Seite und sucht darin Melderkennungen
([melderIndex.ts](../src/common/objektplan/melderIndex.ts)).

- **Warum im Browser und nicht auf dem Server:** pdfjs steckt ohnehin im
  Client, und die Bytes müssten sonst durch Cloud Run (32 MB je Request). Die
  Indizierung selbst liegt in
  [pdfIndex.ts](../src/common/objektplan/pdfIndex.ts) und bekommt pdfjs
  hereingereicht; der Drive-Abgleich nutzt sie auf dem Server mit dem
  Legacy-Build. Den Status (`ok`, `ohneText`, `fehler`, `bild`) vergeben beide
  Wege über dieselbe Funktion
  ([describeDokument.ts](../src/common/objektplan/describeDokument.ts)).
- **Kennung `Gruppe/Melder[Zusatz]`**, z.B. `4/01E`. Die Gruppe hat bis zu vier
  Stellen — Siemens-Anlagen zählen ihre Gruppen ab `1001` (Hotel Wende:
  `1003/04`) —, der Melder bis zu zwei. In den CAD-Exporten steht
  jede Kennung als eigenes Textstück in der Textebene, samt Lage. Ausgeschlossen
  werden Ziffern oder `/` direkt davor bzw. Ziffer, Buchstabe oder `/` danach —
  das hält Telefonnummern, Maßstäbe und Daten heraus. Melder- und Gruppennummer
  0 gibt es nicht.
- **Lage als normiertes Rechteck** `[x0, y0, x1, y1]`, 0..1, Ursprung oben
  links, umgerechnet über das Viewport von pdfjs. Damit passt die Markierung bei
  jeder Zoomstufe, und gedrehte Seiten (`/Rotate`) wie gedrehter Text stimmen,
  weil alle vier Ecken umgerechnet werden.
- **Text je Seite wird mitgespeichert** (`seitenText`), damit die Volltextsuche
  über alle Unterlagen eines Objekts ohne die PDFs läuft — auch offline. Er ist
  auf 600 000 Zeichen je Dokument begrenzt (1 MiB je Firestore-Dokument);
  `textGekuerzt` vermerkt das.
- **Ein unlesbares PDF wird trotzdem abgelegt** (`indexStatus: 'fehler'`). Die
  Unterlage ist wichtiger als der Index.

Bestand Brandschutzpläne (Stand 2026-11): von 269 PDFs haben 94 eine
Textebene. Erkennung je Plan unter einer Sekunde; Volksschule Tabor 22 Melder,
Eurospar 90, HAK/Pannoneum 1613. Manche CAD-Exporte zeichnen die Kennungen als
Linien (AutoCAD-SHX-Schriften, Hotel Wende): Die Textebene enthält dann nur
Legende und Raumnamen, keinen Melder. Solche Pläne gehen zusätzlich durch die
Texterkennung (siehe unten).

## Suche und Markierung

- [search.ts](../src/common/objektplan/search.ts) liest die Eingabe zuerst als
  Melder (`parseMelderQuery`: „3/5", „3/05", „3-5", „MG 3 M 5",
  „Meldergruppe 12 Melder 3", „MG 12", „12"). Eine bloße Zahl ist zugleich
  Gruppe und Suchbegriff — sie kann auch eine Raumnummer sein. Ein vollständiger
  Melder sucht nicht zusätzlich im Text, sonst käme jede Kennung doppelt.
  Ein Trennzeichen am Ende („310/", „3-") gilt als Gruppe: Die Suche läuft
  beim Tippen, und zwischen Gruppe und Meldernummer sollen die Treffer der
  Gruppe nicht verschwinden.
- Treffer einer Gruppe werden **je Seite zusammengefasst** und gemeinsam
  markiert. Enter öffnet den ersten Treffer; ein weiteres Enter springt noch
  einmal hin (`jumpKey` am Viewer) — wer inzwischen weggezoomt oder gescrollt
  hat, findet so zurück, ohne die Suche neu einzugeben.
- Fundstellen eines Suchbegriffs markiert der Viewer selbst über die Textebene
  der offenen Seite; gespeichert sind dafür keine Positionen.
- Markierungen haben eine **Mindestgröße von 28 px**: auf großformatigen Plänen
  ist eine Kennung bei eingepasster Breite nur wenige Pixel groß.

## Viewer

[PlanViewer.tsx](../src/components/Objektplan/PlanViewer.tsx) rendert mit pdfjs
auf Canvas und legt die Markierungen darüber — kein HTML-Export und nicht der
PDF-Viewer des Browsers: der kann weder markieren noch offline aus unserem
Cache lesen und verhält sich auf iOS und Android verschieden.

- **Alle Seiten untereinander, durch Scrollen.** Blättern mit Pfeilen allein
  übersah man, und auf dem Handy ist Wischen der natürliche Weg. Die Spalte
  wird aus den Seitengrößen aufgebaut, bevor etwas gezeichnet ist
  ([pageLayout.ts](../src/common/objektplan/pageLayout.ts)). Gezeichnet werden
  nur die sichtbaren Seiten plus eine Bildschirmhöhe davor und danach; weiter
  entfernte Canvas werden auf 0 × 0 gesetzt und geben ihren Speicher frei —
  ein Plan mit 25 A0-Seiten als volle Canvas sprengte das Handy.
- „Seite x von y" folgt der Seite in der Bildschirmmitte; die Pfeile springen
  zur Nachbarseite. Ein Suchtreffer springt auf seine Seite und zur Markierung.
- **Beim Zoomen bleibt die Stelle stehen**, an der gezoomt wird: zwischen den
  Fingern, unter dem Mauszeiger (Strg + Mausrad) oder, bei den Knöpfen, in der
  Bildschirmmitte. `mapPointBetweenLayouts` rechnet den Punkt auf dieselbe
  Stelle derselben Seite im neuen Layout um — der Abstand zwischen den Seiten
  wächst nicht mit —, danach rückt die Scrollposition so nach, dass er wieder
  am selben Bildschirmpunkt liegt.
- **Plan vergrößern** (Knopf ganz rechts) blendet Suche und Unterlagenliste
  aus, damit der Plan auf dem Handy den ganzen Bildschirm hat; der Zoom bleibt.
  „Breite einpassen" ist davon getrennt und setzt nur den Zoom zurück — beide
  in einem Knopf hatten Benutzer verwechselt.
- **Verschieben mit der Maus:** Ziehen mit gedrückter linker Taste scrollt den
  Plan (Cursor „grab"), auf Touch-Geräten wie gewohnt mit dem Finger.
- **WebAssembly-Decoder:** pdfjs dekodiert JBIG2- und JPEG-2000-Bilder per
  WebAssembly und bekommt dafür `wasmUrl`. Fehlt sie, lässt pdfjs diese Bilder
  still weg — bei Scans aus Kopierern sind das oft gerade Linien und Schrift
  (OBI: nur der farbige Hintergrund blieb). `scripts/copyPdfjsAssets.mjs` legt
  die Dateien samt ihren JavaScript-Rückfällen (`*_nowasm_fallback.js`) vor
  `dev`, `dev:https` und `build` nach `public/pdfjs/wasm/` (gitignored, damit
  sie zur installierten pdfjs-Version passen); der Service Worker nimmt sie mit
  `public/**` in den Precache. Der Aufruf steht **im Skript selbst**
  (`node scripts/copyPdfjsAssets.mjs && next build`), nicht in einem
  `prebuild`-Hook: `.npmrc` setzt `ignore-scripts=true`, und damit laufen
  `pre*`/`post*`-Hooks bei `npm run` nicht — auch nicht im Docker-Build. Mit
  dem Hook fehlten die Dateien in dev und prod (404), und gescannte Pläne mit
  Farbebene und JBIG2-Maske (Autohaus Eisner) zeigten nur verwaschene Blöcke.
  `scripts/packageScripts.test.ts` hält das fest. Wer lokal `npx next build`
  statt `npm run build` aufruft, kopiert nichts.

- Die Canvas-Fläche ist auf 16 Mio. Pixel begrenzt (iOS verweigert mehr);
  darüber wird mit geringerer Auflösung gerendert und gestreckt.
- Zwei-Finger-Zoom skaliert während der Geste nur per CSS (um den Punkt
  zwischen den Fingern, der mit den Fingern wandert) und rendert beim
  Loslassen neu, sonst rendert pdfjs bei jeder Bewegung.
- **Offline:** Jede geöffnete Datei landet im Cache `objektplaene-v1` (Cache
  API, nicht der Precache des Service Workers), Schlüssel mit der SHA-256 der
  Datei — ein ersetzter Plan wird neu geladen. Die Daten (Liste, Melder, Text)
  hält der Firestore-Cache. Ungeöffnete Unterlagen sind offline nicht da.

## Abgleich mit dem Drive-Link

Steht am Objekt (`risikoobjekt/{id}.link`) ein Link auf einen Drive-Ordner
oder eine Drive-Datei, holt die App die Unterlagen von dort selbst. Hochladen
in der App bleibt daneben möglich.

- **Der Link muss bis in die Cluster:** Die Karte liest Risikoobjekte aus
  `clusters6`, nicht aus `risikoobjekt`. Ob abgeglichen wird, entscheidet der
  Dialog am Link der Cluster-Kopie; nach dem Setzen des Links also
  `npm run updateClusters`. Die Server Action selbst liest den Link am
  Objekt.
- **Wann:** beim Öffnen der Pläne, einmal je Öffnen und nur online
  ([useDriveSync.ts](../src/components/Objektplan/useDriveSync.ts)). Es gibt
  keinen Zeitplan: die Pläne ändern sich selten, und ein Objekt, das nie
  jemand öffnet, braucht keinen Abgleich. Der erste, der ein neu verknüpftes
  Objekt öffnet, wartet auf das Herunterladen und Indizieren; neue Dokumente
  erscheinen über den Firestore-Listener.
- **Wer:** jeder angemeldete Benutzer (`actionUserRequired`). Die Quelle ist
  nicht wählbar, die Server Action liest den Link selbst am Objekt — sie
  spiegelt nur, was ein Admin dort hinterlegt hat. Ein Benutzer kann damit
  nichts anderes aus dem Drive holen.
- **Was:** PDFs und Bilder im Ordner und in Unterordnern bis zur Tiefe 2.
  Unterordner, deren Name mit `Archiv`, `Alt`, `Alte`, `Old` oder `Veraltet`
  beginnt, bleiben draußen. CAD-Dateien, Formulare und Dateien über der
  Größengrenze werden übersprungen.
- **Google-Dokumente als PDF:** Docs, Tabellen, Präsentationen und
  Zeichnungen haben keine Datei zum Herunterladen. Der Abgleich holt sie über
  `files/{id}/export` als PDF (Endung `.pdf` am Namen) und behandelt sie
  danach wie jedes andere PDF — Viewer, Textebene, Melder, offline. Drive
  exportiert höchstens 10 MB; ein größeres Dokument scheitert und zählt als
  „fehlgeschlagen".
- **Erkennung von Änderungen über die md5 der Drive-Datei** (`driveMd5`),
  bei Google-Dokumenten, die keine md5 haben, über ihre `version`
  (`driveVersion`). Die
  Dokument-ID ist `drive-{fileId}`: Zwei Benutzer, die gleichzeitig öffnen,
  schreiben dasselbe Dokument statt zweier. Verschwindet eine Datei aus dem
  Ordner, fallen Dokument und Storage-Datei weg — aber nur, wenn die Liste
  gelesen werden konnte. Scheitert das Lesen, bleibt alles, wie es ist.
- **Nacheinander, auf dem Server.** Die Bytes laufen hier doch über Cloud Run,
  aber nicht als Request, sondern als Download des Dienstes; ein Plan nach
  dem anderen, weil der Dienst 1 GiB hat.
- **Texterkennung daneben, nicht dazwischen**
  ([driveSyncRunner.ts](../src/server/objektplan/driveSyncRunner.ts)): Jeder
  Plan wird gleich nach dem Indizieren als Dokument geschrieben und erscheint
  damit sofort in der Liste. Braucht er OCR, läuft sie im Hintergrund weiter,
  während der nächste Plan schon geladen wird; danach wird das Dokument mit dem
  erkannten Text noch einmal geschrieben. Vision arbeitet außerhalb des
  Dienstes, gleichzeitige Erkennungen kosten Cloud Run keinen Speicher. Der
  Abgleich endet erst, wenn alle Erkennungen fertig sind. Bricht er vorher ab
  (Zeitlimit), steht das Dokument ohne erkannten Text da — der Knopf „Text
  erkennen (OCR)" oder „Neu einlesen" holt das nach.
- **pdfjs unter Node:** Den Fake-Worker holt pdfjs sonst per dynamischem
  Import über `workerSrc` — den verfolgt das Bündeln nicht. Er wird deshalb
  vorab geladen und unter `globalThis.pdfjsWorker` abgelegt
  ([driveSyncDeps.ts](../src/server/objektplan/driveSyncDeps.ts)).
  `serverExternalPackages` geht nicht, pdfjs-dist ist reines ESM.
- **Löschen in der App gibt es für Drive-Dokumente nicht** — der nächste
  Abgleich brächte sie zurück. Entfernt wird im Drive.
- **Freigabe und Texterkennung laufen mit:** Neue Dateien bekommen die Gruppen
  des Objekts als Metadatum; ein Scan ohne Textebene geht nach dem Herunterladen
  gleich durch die Texterkennung. Scheitert sie, wird der Plan trotzdem
  abgelegt und lässt sich später im Dialog erkennen.
- **Der Service Account muss Mitglied im Shared Drive sein**, wie bei den
  Einsatz-Fotos ([einsatz-drive-fotos.md](einsatz-drive-fotos.md)). Fehlt das
  Recht, zeigt der Dialog „Der Drive-Ordner ist für die App nicht lesbar."

## Freigabe an Gruppen

Die Pläne zeigen Grundrisse, Zugänge und Schlüsseldepots. Sie sieht deshalb
nicht jeder Benutzer, sondern nur die Feuerwehren, die das Objekt betreuen.

- **`groups` am Objekt** (`{art}/{id}.groups`) ist die Freigabeliste.
  Die Daten des Objekts (Name, Adresse, Lage) bleiben für alle lesbar — die
  Karte braucht sie, und sie stehen ohnehin im GIS. Nur Unterlagen und Index
  hängen an der Freigabe. Ein Objekt **ohne** Gruppen sieht nur der globale
  Admin; der Dialog sagt dann „nicht freigegeben".
- **Firestore:** Die Regel des Unterdokuments liest `groups` am Objekt per
  `get()` und vergleicht mit dem Claim `groups` im Token.
- **Storage:** Ein `firestore.get` aus den Storage-Regeln scheitert an der
  Dev-Datenbank `ffndev`. Jede Datei trägt die Gruppen deshalb selbst als
  Metadatum `groups` (kommagetrennt, sortiert). Ändert sich die Freigabe,
  schreibt die Server Action das Metadatum aller Dateien des Objekts neu
  ([risikoobjektStore.ts](../src/server/objektplan/risikoobjektStore.ts)).
- **Pflegen** ist das Recht `risikoobjekte.manage` (Rolle `gruppenadmin`,
  siehe [berechtigungen.md](berechtigungen.md)). Wer es in einer freigegebenen
  Gruppe hat, lädt hoch, löscht hochgeladene Unterlagen, bearbeitet das Objekt
  und gibt es weiteren Gruppen frei — nur für Gruppen, in denen er das Recht
  selbst hat, und keine entziehen, die er nicht pflegt.
- **Auswahl als Gruppenbaum**, wie bei den Rollen eines Benutzers
  (`GroupTreeChecklist`). Anders als dort wird eine Elterngruppe beim
  Freigeben nicht mitgeschrieben (`implyAncestors={false}`) — freigegeben ist
  genau, was angehakt ist. Gruppen, in denen der Bearbeitende das Recht nicht
  hat, sind gesperrt (`isDisabled`).
- **Neue Objekte** legt ein Gruppen-Admin auf `/risikoobjekte` für seine Gruppe
  an (`quelle: 'app'`); das Objekt ist gleich für sie freigegeben und landet in
  derselben Transaktion in `clusters6`, sonst fehlte es auf der Karte. Objekte
  aus dem GIS-Import darf ein Gruppen-Admin nur verknüpfen (Drive-Link), nicht
  umbenennen oder verschieben — der nächste Import überschriebe es. Löschen
  lassen sich nur Objekte aus der App.
- **Bestand:** Objekte von vor der Freigabe haben keine Gruppen. Der Admin
  sieht auf `/risikoobjekte` einen Hinweis und gibt sie mit „Alle freigeben"
  auf einmal frei — Risikoobjekte und gefährdete Objekte.
- **Hochladen im Browser:** Das Dokument trägt `gruppe` — die freigegebene
  Gruppe, in der der Hochladende das Recht hat; daran prüft die Firestore-Regel
  das Recht per `hasPerm`. Ändern und Löschen nur Admin oder Server Action,
  weil zum Löschen auch die Datei in Storage gehört.

## Texterkennung (OCR)

Von den Brandschutzplänen haben rund zwei Drittel keine Textebene — Scans.
Ohne Text gibt es weder Volltextsuche noch Melder. Die Texterkennung macht
Cloud Vision ([visionOcr.ts](../src/server/objektplan/visionOcr.ts)).

- **Wann:** gleich nach dem Hochladen eines PDFs mit Status `ohneText` — oder
  eines PDFs mit Textebene, in der kein einziger Melder steht (`wantsOcr`) —,
  beim Drive-Abgleich ebenso; für vorhandene Unterlagen per Knopf „Text
  erkennen (OCR)" in der Unterlagenliste. Nur wer das Objekt pflegt, löst sie aus
  (`ocrObjektDokumentAction`), und nur einmal je Dokument: `ocr: true`
  vermerkt den Versuch, auch wenn kein Text herauskam.
- **Kleine Pläne direkt, große asynchron** (`ocrPdf` in
  [visionOcr.ts](../src/server/objektplan/visionOcr.ts)). Bis fünf Seiten geht
  der synchrone Aufruf `files:annotate`: Vision liest das PDF aus dem Bucket und
  antwortet in Sekunden. Der asynchrone Weg dauert auch für eine Seite 30–60 s,
  fast nur Warteschlange bei Vision — die meisten Pläne sind ein- bis
  zweiseitige Scans. Ist die Seitenzahl unbekannt (`seiten` fehlt), wird der
  direkte Aufruf mit fünf Seiten versucht; meldet Vision mehr (`totalPages`),
  geht es asynchron weiter.
- **`files:asyncBatchAnnotate` für alles darüber**, weil der synchrone Aufruf
  nur fünf Seiten nimmt. Vision liest das PDF direkt aus dem Bucket und schreibt
  das Ergebnis als JSON unter `ocr-ausgabe/` zurück; die Server Action fragt
  alle 3 s nach (höchstens 4 min), liest die Ausgabe und löscht sie. Die
  Bytes laufen auf beiden Wegen nicht durch Cloud Run. Höchstens 200 Seiten je
  Plan.
- **EU-Endpunkt** `eu-vision.googleapis.com`: Die Pläne zeigen Grundrisse und
  Zugänge, die Verarbeitung bleibt in der EU.
- **Melder über die Zeichen, nicht über den Seitentext**
  ([ocrIndex.ts](../src/common/objektplan/ocrIndex.ts)). Vision trennt `4/01E`
  gern in `4`, `/` und `01E`. Der Text eines Absatzes wird aus den Zeichen
  zusammengesetzt (Leerzeichen nur, wo Vision einen Umbruch meldet), jedes
  Zeichen behält seine Box, und ein Treffer bekommt die Hülle seiner Zeichen —
  dieselbe normierte Form wie aus der Textebene, die Suche merkt keinen
  Unterschied. Die Ausschlüsse der Melderkennung gelten unverändert.
- **Ergebnis:** Mit Text wird das Dokument `ok` und trägt ein Chip „OCR" —
  erkannter Text ist nicht so verlässlich wie eine Textebene. Ohne Text bleibt
  es `ohneText`. Hatte das PDF schon eine Textebene, bleibt sie stehen; der
  erkannte Text kommt je Seite dazu (beides zusammen unter der Obergrenze), die
  Melder ebenso. Die Textebene allein verlieren hieße Wörter verlieren, die
  Vision schlechter liest; nur die Erkennung allein fände die Linien-Kennungen
  nicht.
- **Voraussetzung:** API `vision.googleapis.com` im Projekt (terraform,
  `project-base`). Der Dienst ruft sie mit seinem Service Account auf, der
  ohnehin den Bucket lesen und schreiben darf.

## Neu einlesen

Der Index entsteht beim Hochladen bzw. beim Drive-Abgleich und bleibt dann
stehen. Wird die Erkennung besser (Melder mit vierstelliger Gruppe, OCR auch für
PDFs mit Textebene ohne Melder, JBIG2-Masken), haben die vorhandenen Pläne
noch den alten Stand — der Drive-Abgleich holt sie erst bei einer neuen md5.

- **Je Plan:** Knopf „Neu einlesen" neben jeder PDF-Unterlage für alle, die das
  Objekt pflegen (`reindexObjektDokumentAction`). Die Datei kommt aus Storage,
  nicht noch einmal aus Drive; Herkunft, Ersteller und Drive-Kennungen bleiben.
- **Alle Pläne:** unter `/admin/actions` („Find plan documents"). Die Liste
  (`listObjektDokumenteForReindex`, nur Admins) zeigt alle PDFs, die ohne Melder
  zuerst; eingelesen wird nacheinander vom Browser aus, je Plan ein Aufruf
  derselben Action. Ein einzelner Aufruf für alle liefe bei 55-MB-Plänen und
  minutenlanger Texterkennung in das Zeitlimit von Cloud Run. Abbrechen geht
  zwischen zwei Plänen.
- **Alle Drive-Ordner abgleichen:** „Sync all from Drive" unter `/admin/actions`
  gleicht jedes Objekt mit Drive-Link ab (`listRisikoObjekteWithDriveLink`, nur
  Admins), ohne dass jemand jedes Objekt öffnen muss. Wie beim Öffnen holt der
  Abgleich neue und geänderte Dateien, indiziert sie und erkennt den Text, wo es
  lohnt; unveränderte bleiben, wie sie sind. Danach lädt die Seite die Liste
  zum Neu-Einlesen.
- **Drei Objekte gleichzeitig, im Server:** Der Browser schickt Blöcke zu drei
  Objekten an `syncRisikoObjekteFromDrive`, das sie mit `Promise.all`
  gleichzeitig abgleicht. Gleichzeitig nur dort: Next.js schickt die Server
  Actions eines Clients **nacheinander** ab, ein `Promise.all` im Browser
  liefe still seriell. Der Abgleich wartet meist auf Drive, Storage und Cloud
  Vision, das überlappt gut. Mehr als drei nicht, weil pdfjs jeden Plan beim
  Indizieren ganz im Speicher hält und der Dienst 1 CPU und 1 GiB hat; die
  Action nimmt höchstens acht je Aufruf. Ein Block dauert so lange wie sein
  langsamstes Objekt, und jeder Block muss ins Zeitlimit von 300 s passen.
  Ein Fehler betrifft nur sein Objekt; scheitert der ganze Aufruf, zählen alle
  Objekte des Blocks als fehlgeschlagen.
- **Der OCR-Vermerk fällt weg** ([reindexRunner.ts](../src/server/objektplan/reindexRunner.ts)):
  Index und `ocr` werden aus der Datei neu bestimmt, sonst verhinderte der alte
  Versuch einen neuen. Danach gilt `wantsOcr` wie beim Hochladen; scheitert die
  Texterkennung, bleibt der neue Index ohne sie.
- **pdfjs auf dem Server** teilen sich Drive-Abgleich und Neu-Einlesen
  ([pdfjsNode.ts](../src/server/objektplan/pdfjsNode.ts)).

## Bewusst noch nicht umgesetzt

- **Meldersymbole ohne Nummer** auf Scans: Die Texterkennung findet nur
  geschriebene Kennungen. Bilder (JPEG, PNG) gehen nicht durch die
  Texterkennung.
- Objektinfos (BMZ, Schlüsseldepot, Absperrungen) als strukturierte Felder.
- Vorladen aller Unterlagen des Einsatzgebiets für offline.
- Melder aus dem Alarmtext erkennen und den Plan direkt vorschlagen; Werkzeug
  für den Sprach-Assistenten.

## Risikoobjekte zum Einsatz

Die Einsatzseite (Abschnitt „Details“) zeigt unter der Übersicht „Mögliche
Risikoobjekte und gefährdete Objekte“, ein Klick öffnet die Pläne. Ohne Treffer bleibt der Block weg.
Das Matching liegt in
[risikoobjektMatch.ts](../src/common/objektplan/risikoobjektMatch.ts), die
Anzeige in
[RisikoobjektMatches.tsx](../src/components/Objektplan/RisikoobjektMatches.tsx).

- **Unscharf, weil keine Quelle genau ist.** Die Alarmkoordinate liegt oft
  auf der Straße oder in der Ortsmitte, und die Adressen der Objekte sind von
  Hand erfasst: „Wienerstraße“ gegen „Wiener Straße“, „Franz Liszgasse“,
  „Erwin Schrädingerstr“, „Kardinal Franz Königplatz“. Deshalb zählen drei
  Hinweise je für sich und werden wie unabhängige Wahrscheinlichkeiten
  verknüpft (`1 − Π(1 − s)`); ab 0,4 erscheint ein Objekt, höchstens fünf.
- **Lage:** kürzeste Entfernung zum Einsatz oder zu einem Einsatzort. Bis
  30 m voller Wert, bei 400 m nichts mehr.
- **Adresse:** Straßennamen werden vereinheitlicht (Umlaute ausgeschrieben,
  „Str.“/„Pl.“ ausgeschrieben, ohne Leerzeichen und Bindestriche) und über
  Trigramme verglichen, das fängt Tippfehler. Im Alarmtext ist die Straße
  nicht markiert; geprüft wird jedes Fenster aus ein bis vier Wörtern
  zwischen den `/`. Die Hausnummer steht im Alarm im nächsten Abschnitt,
  sonst direkt dahinter; Bereiche („Pionierweg 1-3“) und Zusätze („1a“)
  zählen mit. Die Straße **ohne** passende Hausnummer wiegt umso weniger, je
  mehr Objekte dort liegen — an der Wienerstraße liegen über ein Dutzend.
  Einsatzorte liefern Straße und Nummer getrennt.
- **Name:** Wörter des Objektnamens im Text, mit Tippfehlern ab fünf
  Buchstaben, kurze Kürzel („AMS“, „BH“) nur exakt. Gewichtet nach Seltenheit
  über alle Objekte: „Autohaus“ trägt weniger als „Kamper“. Zählt erst ab der
  Hälfte des Gewichts. **Ortsnamen** (Feuerwehr des Einsatzes, Ort der
  Einsatzorte) zählen nicht, sonst passte „BH Neusiedl am See“ auf jeden
  Alarm.
- **Gelesen werden `risikoobjekt` und `gefahrobjekt`**, nicht die Cluster, wie auf der Seite
  `/risikoobjekte`; der Firestore-Cache hält die Liste offline. Name und Lage
  sehen alle, die Pläne nur die freigegebenen Gruppen — das zeigt der Dialog.
- **Grenzen:** Zwei ähnliche Straßen („Obere“ und „Untere Hauptstraße“)
  können sich gegenseitig treffen, mit gleicher Hausnummer auch als
  „Adresse“. Der Ort einer Objektadresse („…, 7111 Parndorf“) wird nicht
  mit dem Einsatzort verglichen. Die Liste ist ein Vorschlag zum Prüfen,
  nichts wird automatisch am Einsatz verknüpft.
