# Geräte & Material

Geräte und Lagerartikel einer Gruppe: Stammdaten aus dem Sybos-Export, Bestand je
Lagerort, Zuordnung und Verbrauch im Einsatz, Meldung „bitte nachbestellen" beim
Unterschreiten eines Mindestbestands. Anlass war ein Feature-Wunsch aus dem
Bug-Report-Dialog (Schadstoff- und Strahlenschutzmaterial: was im Einsatz
verbraucht wird, soll automatisch aus dem Lager ausgebucht werden).

| Teil | Ort |
| --- | --- |
| Typen, Sammlungsnamen, `lagerortKey`, `formatLagerort` | [`src/common/geraet.ts`](../src/common/geraet.ts) |
| Bestandslogik (rein, ohne Firestore) | [`src/common/geraetBestandLogic.ts`](../src/common/geraetBestandLogic.ts) |
| Sets: Prüfung, Code-Suche, Auflösen im Einsatz (rein) | [`src/common/geraetSet.ts`](../src/common/geraetSet.ts) |
| Chargen: Töpfe, FEFO, Kürzen, Ablaufstatus (rein) | [`src/common/geraetCharge.ts`](../src/common/geraetCharge.ts) |
| Sybos-Import: Parser und Plan | [`src/common/geraetImport.ts`](../src/common/geraetImport.ts) |
| Server Actions | [`src/components/Geraete/geraeteActions.ts`](../src/components/Geraete/geraeteActions.ts) |
| Nachbestellmail | [`src/components/Geraete/notifyNachbestellung.ts`](../src/components/Geraete/notifyNachbestellung.ts) |
| Ablauf-Sammelmail: Text und Versand je Gruppe | [`buildAblaufEmail.ts`](../src/components/Geraete/buildAblaufEmail.ts), [`sendAblaufReports.ts`](../src/components/Geraete/sendAblaufReports.ts) |
| Ablauf-Sammelmail: Endpoint für Cloud Scheduler | [`src/app/api/geraete/ablauf-report/route.ts`](../src/app/api/geraete/ablauf-report/route.ts) |
| Verbrauch nachholen (Offline-Warteschlange) | [`src/components/Geraete/geraetVerbrauchQueue.ts`](../src/components/Geraete/geraetVerbrauchQueue.ts) |
| Pflege-Seite | `/geraete` |
| Abschnitt im Einsatz | `/einsatz/<id>/geraete` |

## Datenmodell

| Sammlung | Inhalt | Schreibt |
| --- | --- | --- |
| `groups/{groupId}/geraet/{id}` | Stammdaten je Artikel, `id` = Sybos-`ID` bzw. generiert; bei Verbrauchsmaterial die Chargen (`chargen`, samt archivierten) und `ablaufVorlaufTage` | nur Server Actions |
| `groups/{groupId}/geraetBestand/{id}` | Bestand je Artikel **und** Lagerort (`lagerort`, `lagerortKey`, `anzahl`), Aufteilung auf Chargen als Map `chargen` (Charge-ID → Menge) | nur Server Actions |
| `groups/{groupId}/geraetBuchung/{id}` | Protokoll jeder Bestandsänderung, `menge` vorzeichenbehaftet, `chargeId` der bewegten Charge (fehlt = ohne Charge); Art `aufteilung` mit Menge 0 | nur Server Actions |
| `groups/{groupId}/geraetSet/{id}` | Set: Name, Codes, Inhalte (`geraetId`, `menge`, fester `bestandId`), optional `sybosSetArtikelId` | nur Server Actions |
| `call/{firecallId}/geraetEinsatz/{id}` | Zuordnung oder Verbrauch im Einsatz; aus einem Set mit `setId`, `setName`, `setZuordnungId`; beim Verbrauch die Aufteilung `chargen` (`{chargeId, menge}[]`, `chargeId: null` = ohne Charge) und `chargenGeprueft` | Client (lokal, auch offline) |

Die Feldnamen sind deutsch wie im übrigen Datenmodell (`bezeichnung`,
`bestandGesamt`, `mindestbestand`, `nachbestellenSeit`, `anzahl`, `menge`).

## Das Sybos-Exportformat

Der Sybos-Artikelexport (XLSX) hat **eine Zeile je Artikel und Lagerort**: Dieselbe
`ID` steht mehrfach, jede Zeile mit eigener `Anzahl`. Der Geräte-Export der FF
Neusiedl hatte 1106 Zeilen zu 765 IDs. Daraus folgt die Aufteilung in Stammdaten
(`geraet`, eine je ID) und Bestand (`geraetBestand`, eine je Zeile); der Parser
gruppiert nach `ID`.

`Lagerort` ist `Fahrzeug` (mit `Fahrzeug-Name` und `Laderaum`), `Raum` (mit
`Standort` und `Raum`) oder `Set-Artikel`. Der Fahrzeug-Lagerort ist **ein Text,
keine Pflichtverknüpfung** mit den Fahrtenbuch-Fahrzeugen — die Namen sind in Sybos
und im Fahrtenbuch nicht gleich gepflegt; `vehicleId` ist eine optionale
Zusatzangabe.

**Die Lagerort-Spalten lassen sich in Sybos abwählen.** Ein Export ohne sie (der
zweite Geräte-Export vom 5. 10. 2026: dieselben 1106 Zeilen, aber keine Spalten
`Lagerort` bis `Anzahl`) sagt über den Bestand nichts. `parseGeraetExport` meldet
das (`withBestand: false`) und der Import übernimmt dann nur Stammdaten — sonst
zählte jeder vorhandene Lagerort als „in der Datei fehlt" und würde auf 0 gesetzt.

Der dritte Export (wieder mit Lagerort-Spalten) bestätigt das Format: 1106 Zeilen,
765 IDs, 1099 Lagerorte — 939 `Fahrzeug`, 134 `Raum`, 26 `Set-Artikel` — und 7
Artikel ganz ohne Lagerort, die ohne Bestand angelegt werden. Je ID sind die
Stammdaten in allen Zeilen gleich, kein Lagerort steht doppelt. Zwei
Beobachtungen:

- **Eine Set-Komponente liegt „im Set-Artikel"**, ohne Fahrzeug, Raum oder Angabe,
  *welches* Set. Die Spalten verraten die Zuordnung nicht (nur manche
  Bezeichnungen wie „Spreizer - SRF"), darum bleibt es beim Schlüssel `set` und
  der Anzeige „Teil eines Set-Artikels". Der Set-Artikel selbst hat einen
  normalen Lagerort.
- **Rollcontainer und Paletten stehen dort auch als `Fahrzeug-Name`**
  („CBRN - Rollcontainer 1 (DEKON)", „Höhenrettung - Palette"). Der Import nimmt
  sie, wie sie kommen, als Fahrzeug-Lagerort; eine Verknüpfung mit einem
  Container-Artikel gleichen Namens zieht er nicht.

### Container als Lagerort

Rollcontainer, Paletten und Kisten sind in Sybos **eigene Artikel** der Kategorie
`Container` (eigener Export, mit Versicherungsspalten), keine Fahrzeuge. Als
Lagerort verweisen sie deshalb auf ihren Artikel: `art: 'container'` mit
`containerId` und der Bezeichnung als Kopie in `container`. Der Schlüssel ist
`container|<containerId>` — zwei Container dürfen gleich heißen, und ein
umbenannter Container bleibt derselbe Lagerort. Die Bezeichnung setzt der Server
aus dem Artikel, nicht aus dem Browser, und nimmt nur Artikel mit
`kategorie: Container` (`isContainer`); ein Container kann nicht sein eigener
Lagerort sein.

Der Export kennt diesen Lagerort nicht. Ein Import setzt einen Container-Bestand
deshalb **nie** auf 0, auch wenn er in der Datei fehlt — er fehlte in jeder.

Im Einsatz zählt ein Lagerort im Container als „im Einsatz", sobald der Container
selbst dem Einsatz zugeordnet ist; der Verbrauch wird dann von dort vorbelegt,
wie bei einem Fahrzeug des Einsatzes.

### Weitere Stammdaten aus dem Export

Neben Bezeichnung, Klassen und Kennungen übernimmt der Import `Vorlage`
(`vorlage`, die Gattung wie „Gasmessgerät"), `Zubehör` (`zubehoer`),
`Anschaffungs-Datum`, `Verfügbar bis` (beide als `YYYY-MM-DD`, die Datei trägt
Excel-Seriennummern) und `Lebensdauer` mit der Spalte `Einheit` als
`lebensdauerEinheit`. Diese `Einheit` ist die der Lebensdauer, **nicht** die
Zähleinheit des Artikels (`einheit`, von Hand gepflegt) — sie steht in jeder Zeile
und wird nur zusammen mit einer Lebensdauer übernommen.

Ebenso übernommen: `Verfügbar von` (`verfuegbarVon`; der Steckbrief zeigt es nur,
wenn es vom Anschaffungs-Datum abweicht), `Herstellungs-Monat` (`baumonat`, 1–12,
angezeigt als „05/2020" am Baujahr), `Einkaufspreis` (`einkaufspreis`, Euro) und
die drei Versicherungsspalten des Container-Exports (`versicherung`,
`polizzenummer`, `kasko`).

Alle diese Felder lassen sich im Bearbeiten-Dialog auch von Hand pflegen —
für Artikel ohne Sybos. Bei einem importierten Artikel überschreibt sie der
nächste Import; die App-Felder (Verbrauchsmaterial, Einheit, Mindestbestand,
Kostenersatz-Position) fasst er nie an. `saveGeraet` verwirft unsinnige Werte
still (Datum nicht `YYYY-MM-DD`, Monat außerhalb 1–12, negative Preise), der
Dialog meldet sie vorher.

Bewusst **nicht** übernommen:

- `Dienststelle` und `Feuerwehr-Nummer` — in jeder Zeile dieselben, die Gruppe
  sagt dasselbe.
- `Kurzbezeichnung Klasse 1–3` — fast immer leer, sonst „Sonstiges"; die Klassen
  selbst sind da.

Suche und Auswahl im Einsatz nutzen das: Gesucht wird auch in Vorlage, Kategorie,
Klassen, Bemerkung und Zubehör, Treffer in der Bezeichnung stehen vorn. Die zweite
Zeile einer Option nennt Vorlage, Hersteller und Typ, Seriennummer und Lagerort —
„Mehrgasmessgerät 1" und „2" unterscheiden sich nur dort (X-am 5000 gegen X-am
2800).

### `lagerortKey`

Die Identität eines Bestands über mehrere Importe hinweg ist Artikel-ID plus
`lagerortKey` — Sybos liefert für die Zeile selbst keine ID. Der Schlüssel wird aus
den Lagerort-Spalten gebildet, kleingeschrieben und mit zusammengefassten
Leerzeichen (`fahrzeug|srf|gr 2`, `raum|feuerwehrhaus|lager`, `set`). `bemerkung` und
`vehicleId` gehören bewusst nicht dazu: Eine geänderte Lagerort-Bemerkung soll beim
nächsten Import keinen zweiten Bestand anlegen.

Abweichungen im Import werden mit `deviationKey()` adressiert —
`${geraetId}|${lagerortKey}`. Die ID steht vorne, weil `lagerortKey` selbst `|`
enthält und sich nur so eindeutig zerlegen lässt.

## Warum `verbrauchsmaterial` ein eigenes Flag ist

Naheliegend wäre, den Sybos-`Material-Typ` zu nehmen: `Massenartikel` gleich
Verbrauchsmaterial. Das stimmt nicht — ein Kupplungsschlüssel ist in Sybos ebenfalls
Massenartikel, wird im Einsatz aber nicht verbraucht. Ob eine Zuordnung im Einsatz
vom Lager abbucht, ist daher das eigene Flag `verbrauchsmaterial`.

Es wird **von Hand** gepflegt. Der Import schlägt es beim Anlegen nur vor
(`suggestConsumable`: `Kategorie` enthält „verbrauch" oder „lagerartikel") und
schreibt es danach nie mehr, ebenso wenig `mindestbestand`, `einheit` und
`kostenersatzRateId`. Im Geräte-Export steht in `Kategorie` durchgehend „Gerät",
dort wird also nichts vorgeschlagen.

Auch keine andere Spalte trägt die Unterscheidung (geprüft am Geräte-Export mit
765 Artikeln): `Massenartikel` umfasst Strahlrohre, Druckschläuche und Schäkel,
die Klasse „Auffangbeh., Bindemittel, Dicht." mischt Bindemittel mit
Auffangwannen und IBC-Containern, und `Einheit Verwendungsnachweis` = `stk`
steht auch an Einzelartikeln mit Seriennummer. Eine Vorbelegung über
Stichwörter in der Bezeichnung wäre Raten, das ohnehin nachzuprüfen wäre.

Nach einem Import ist deshalb jeder Artikel ein Gerät, und die Verbrauchsartikel
werden von Hand markiert — auf zwei Wegen:

- **Einzeln** mit dem Schalter im Detaildialog des Artikels. Er schreibt über
  `saveGeraet` nur `verbrauchsmaterial`, beim Abschalten auch
  `mindestbestand: null`.
- **Mehrere auf einmal** im Auswahlmodus der Artikelliste: Filter und Suche
  grenzen ein („Binde", Klasse „Schadstoffausrüstung"), „Alle N auswählen"
  nimmt alle gefilterten, nicht nur die angezeigte Seite.
  `setGeraeteVerbrauchsmaterial` schreibt in Batches und lässt Artikel aus,
  die den Wert schon haben.

Beim Abschalten fallen in beiden Fällen Mindestbestand und offene
Nachbestellmeldung weg — wie im Bearbeiten-Dialog, beide gelten nur für
Verbrauchsmaterial.

## Geräte werden zugeordnet, Material wird verbraucht

Ein `geraetEinsatz`-Eintrag hat `art: 'zugeordnet'` oder `'verbraucht'`.

- **Zugeordnet** dokumentiert nur, dass das Gerät im Einsatz war (mit Stück oder
  Stunden, je nach `Einheit Verwendungsnachweis`). Am Bestand ändert sich nichts.
  Eine Ausgabe und Rücknahme wie beim Atemschutzsammelplatz gibt es bewusst nicht:
  Geräte bleiben auf dem Fahrzeug, und eine Rücknahme, die niemand bucht, ließe
  den Bestand verfallen.
- **Verbraucht** gibt es nur bei Verbrauchsmaterial und braucht einen Lagerort
  (`bestandId`), von dem abgebucht wird.

Beim Erfassen lassen sich mehrere Artikel nacheinander anklicken
(`Autocomplete` mit `multiple` und `disableCloseOnSelect`; der Suchbegriff bleibt
nach jeder Auswahl stehen). Bei genau einem Artikel zeigt der Dialog Lagerort,
Menge und Stunden wie bisher. Bei mehreren entstehen die Einträge mit den
Vorgaben — Menge 1, Verbrauch vom vorbelegten Lagerort (`pickDefaultBestand`),
Stunden leer — und werden bei Bedarf danach je Eintrag ergänzt. Im Einsatz zählt,
dass alles schnell drin ist; jeder Eintrag läuft durch denselben Abgleich wie ein
einzeln erfasster.

## Lagerort ändern und löschen

`updateGeraetBestand` ändert den Lagerort eines Bestands samt `lagerortKey`; Menge
und Buchungen hängen an der Bestands-ID und bleiben. Der neue Schlüssel ist ab dann
die Import-Identität: Führt Sybos den alten Lagerort weiter, legt der nächste
Import ihn wieder an — einen in der App umbenannten Fahrzeug-Lagerort also auch in
Sybos umbenennen.

`deleteGeraetBestand` bucht einen Restbestand als `inventur` aus, die Bemerkung
nennt den Lagerort („Lagerort gelöscht: SRF · GR 2"), weil die Buchung ihn
überdauert. Danach:

- **Kein Verbrauch im Einsatz** zeigt auf ihn → das Dokument wird gelöscht.
- **Ein Verbrauch zeigt auf ihn** → er wird nur archiviert (`archiviert: true`,
  Anzahl 0). `useGeraete` lässt ihn in `bestaende` und `bestaendeByGeraet` weg, in
  `bestandById` bleibt er, damit der Einsatz seinen Lagerort weiter zeigt. Ein
  Löschen oder Ändern des Verbrauchs bucht dorthin zurück; `syncGeraetVerbrauch`
  holt den Lagerort dann zurück, weil Bestand an einem unsichtbaren Ort verloren
  wäre. Legt jemand denselben Lagerort neu an oder führt der Import ihn, wird der
  archivierte wiederbelebt statt ein zweiter mit gleichem Schlüssel angelegt.

## `bestandGesamt` ist mitgeführt

Der Mindestbestand gilt **je Artikel über alle Lagerorte** — zehn Bindevlies auf dem
SRF und vierzig im Lager sind zusammen der Bestand der Feuerwehr, nachbestellt wird
für alle. Damit Liste, Filter „unter Mindestbestand" und die Prüfung beim Verbrauch
nicht über alle `geraetBestand`-Dokumente aggregieren müssen, trägt der Artikel die
Summe als `bestandGesamt`.

Der Preis ist die Pflicht zur Konsistenz: `bestandGesamt` wird **nur in
Transaktionen** geändert, die auch `geraetBestand` ändern, und die Clients dürfen
keine der drei Gruppen-Sammlungen schreiben. Eine Umbuchung ändert zwei Bestände,
aber nicht die Summe.

Ein Bestand darf negativ werden. Wird mehr verbraucht, als laut Lager vorhanden war,
geht die Realität vor; die Inventur bringt es später wieder in Ordnung.

## Verbrauch im Einsatz: Abgleich statt Buchung

Der Eintrag im Einsatz wird lokal geschrieben (`addDocLocal`) und ist sofort
sichtbar, auch offline. Das Abbuchen übernimmt die Server Action
`syncGeraetVerbrauch(firecallId, einsatzEintragId)`, aufgerufen über `runOrQueue`
([`offlineQueue.ts`](../src/lib/offlineQueue.ts)) — online sofort, offline beim
Reconnect (siehe [offline-modus.md](offline-modus.md), Gruppe „Nachholen").

Die Action bucht nicht „einmal ab", sondern **gleicht ab**: Sie liest den Eintrag
per Admin SDK und bildet das Ziel —

- Eintrag existiert, `art === 'verbraucht'`, `bestandId` gesetzt → `{bestandId, menge}`,
- sonst (gelöscht, auf „zugeordnet" geändert) → kein Verbrauch —

summiert alle vorhandenen Buchungen mit dieser `einsatzEintragId` je Bestand und
bucht nur die Differenz (`reconcileVerbrauch`). Daraus folgt:

- **Idempotent.** Die Warteschlange darf einen Eintrag zweimal ausführen (Zeitgrenze
  überschritten, Antwort verloren); der zweite Lauf findet nichts zu tun.
- **Ändern und Löschen sind derselbe Weg.** Menge geändert → Differenzbuchung.
  Lagerort gewechselt → Rückbuchung am alten, Abbuchung am neuen. Eintrag gelöscht →
  alles zurück. Eine eigene Storno-Action, die offline in die richtige Reihenfolge
  mit dem Anlegen gebracht werden müsste, entfällt.
- **Die Reihenfolge der Warteschlange ist egal.** Jeder Lauf liest den aktuellen
  Stand des Eintrags. Vor dem Durchlauf wartet die Warteschlange auf die
  ausstehenden Firestore-Schreibvorgänge (`prepareQueueRun`), sonst sähe die Action
  den Eintrag noch nicht.

Danach setzt die Action `gebucht: true` am Eintrag (falls er noch existiert). Die
Oberfläche zeigt daran, ob ein Verbrauch schon vom Lager abgebucht ist.

Berechtigt ist jeder mit Zugriff auf den Einsatz
(`actionUserAuthorizedForFirecall`) — wer im Einsatz Material verbraucht, ist nicht
unbedingt Gerätemeister. Zusätzlich muss der Artikel zur Gruppe des Einsatzes
gehören; sonst könnte ein Einsatz-Gast über einen fremden Artikel das Lager einer
anderen Feuerwehr verändern.

## Nachbestellmeldung nur beim Unterschreiten

`applyStockDelta` liefert `crossedBelow` **nur beim Übergang** von
`bestandGesamt >= mindestbestand` auf `< mindestbestand`. Dann wird
`nachbestellenSeit` gesetzt und nach dem Commit eine Mail verschickt. Jeder weitere
Verbrauch unter dem Minimum bleibt still — sonst bekäme der Gerätemeister im
Großeinsatz bei jedem Sack Ölbindemittel eine Mail. Bringen Zugang oder Inventur den
Bestand wieder auf das Minimum, wird `nachbestellenSeit` gelöscht; beim nächsten
Unterschreiten kommt wieder eine Mail.

Steht ein Artikel schon unter dem Minimum, ohne dass `nachbestellenSeit` gesetzt ist
(etwa weil das Minimum gerade erst eingetragen wurde), wird es nachgetragen, aber
ohne Mail. Ohne Mindestbestand gibt es nie eine Meldung.

Die Mail wird **nach** dem Commit verschickt, nie in der Transaktion: Firestore
wiederholt Transaktionen bei Konflikten, eine Mail darin ginge mehrfach hinaus.
Fehler beim Versand werden geloggt und geschluckt — die Buchung ist richtig, auch
wenn die Mail scheitert, und die Liste „Nachzubestellen" auf der Pflege-Seite zeigt
den Artikel ohnehin.

### Empfänger: die Mängel-E-Mail

Empfänger sind die Adressen aus `FahrtenbuchConfig.mangelEmails` der Gruppe, Versand
wie in [`notifyMangel.ts`](../src/components/Fahrtenbuch/notifyMangel.ts). Eine
eigene Empfängerliste wäre eine weitere Einstellung, die gepflegt werden muss, und
landete bei denselben Leuten: Wer Fahrzeugmängel bearbeitet, kümmert sich in der
Regel auch um die Beladung.

## Sets

Ein Set fasst Geräte und Verbrauchsmaterial zusammen („Ölspur": Besen, 3 Sack
Bindemittel, Schaufel) und wird im Einsatz als Ganzes erfasst. Gepflegt wird es
im Reiter „Sets" der Pflege-Seite, optional an einen Sybos-**Set-Artikel**
gebunden (`materialTyp === 'Set-Artikel'`).

**Warum eine eigene Sammlung und nicht der Sybos-Export.** Der Export kennt
Set-Artikel und Set-Komponenten, verrät aber nicht, welche Komponente zu welchem
Set gehört (oben: „Eine Set-Komponente liegt im Set-Artikel"). Die Zuordnung
entsteht deshalb in der App, in `geraetSet` — der Import fasst die Sammlung nie
an, und ein Set ohne Sybos-Bindung ist genauso möglich.

**Warum Einzeleinträge.** Beim Zuordnen entsteht je Inhalt ein normaler
`geraetEinsatz`-Eintrag, kein Set-Eintrag. Abgleich, Rückbuchung beim Löschen,
Sybos-Übertrag und Chrome-Erweiterung arbeiten damit unverändert; ein Verbrauch
aus dem Set ist ein Verbrauch wie jeder andere. Zusammengehalten werden die
Einträge nur durch `setZuordnungId` — eine neue ID je Set und Speichern. Dasselbe
Set darf zweimal im Einsatz stehen, und „Ganzes Set entfernen" löscht genau eine
Zuordnung (je Eintrag, also mit Rückbuchung). `setName` ist eine Kopie, damit die
Überschrift auch für Gäste und nach dem Löschen des Sets lesbar bleibt; `setId`
wird außer zur Herkunft nicht ausgewertet.

**Der gebundene Set-Artikel bekommt selbst einen Eintrag**, als erster, immer
`zugeordnet` mit Menge 1 — auch wenn er in Sybos als Massenartikel oder mit
Stunden geführt ist. So steht die Kiste mit ihrem Inhalt im Einsatz und in Sybos.

**Codes: „Set gewinnt".** Ein Set trägt eigene Codes (Barcode, QR) und erbt die
seines Set-Artikels, ohne sie einzutragen (`setCodesOf`). Ein eigener Code darf
weder an einem Artikel noch an einem anderen aktiven Set stehen, sonst wäre der
Scan mehrdeutig; `validateGeraetSet` prüft das im Dialog und `saveGeraetSet`
noch einmal gegen den Stand der Gruppe. Scannt jemand den Set-Artikel, liefert
`findByCode` das Set und lässt den Artikel aus den Treffern — wer die Kiste
scannt, will ihren Inhalt.

**Fester Lagerort mit Rückfall.** Ein Verbrauchsmaterial im Set kann einen festen
Lagerort tragen (das Bindemittel kommt immer vom SRF). Fehlt er oder gibt es ihn
nicht mehr, gilt wie beim Einzelerfassen `pickDefaultBestand`. Hat der Artikel gar
keinen Lagerort, wird er übersprungen (`noBestand`) statt ohne Lagerort angelegt —
ebenso gelöschte (`missing`) und inaktive (`inactive`) Artikel. Die Vorschau im
Dialog zeigt sie ausgegraut mit Grund; Menge, Stunden und Lagerort sind dort je
Zeile änderbar.

**Gäste** lesen keine Sets (`fahrtenbuchMember()`), `useGeraetSets` abonniert ohne
Gruppenmitgliedschaft nichts. Sie erfassen einzelne Artikel und sehen bestehende
Set-Einträge unter dem kopierten Namen.

## Chargen

Zu einem Verbrauchsartikel kann es mehrere Chargen geben — Lieferungen mit
eigenem Einkaufs- und Ablaufdatum, LOT, Bezeichnung und Kommentar. Die Frage,
um die es geht: Wie viel von der Charge, die im März abläuft, liegt noch auf
dem SRF?

**Nur ein Nummernfeld: LOT.** Auf der Verpackung steht „LOT", gemeint ist die
Produktions- bzw. Chargennummer des Herstellers. Eine eigene Los-Nummer daneben
gibt es nicht; ein zweites Feld führte nur dazu, dass dieselbe Nummer mal hier,
mal dort steht. Gespeichert wird sie im Feld `produktionsNummer`, angezeigt als
„LOT / Chargennummer", in der Kurzform als „LOT 4711".

### Modell: Aufteilung im Lagerort

Die Stammdaten einer Charge stehen als Array am Artikel (`geraet.chargen`), die
Mengen als Map am Bestand (`geraetBestand.chargen`: Charge-ID → Menge). Ein
Lagerort ist damit in **Töpfe** geteilt: je Charge einer, dazu der **Rest ohne
Charge** = `anzahl` − Σ `chargen`. Der Rest wird nur berechnet
(`restOhneCharge`, `chargePots`), nie gespeichert. `anzahl` bleibt die Summe
**und** die Wahrheit; `bestandGesamt`, Mindestbestand und Nachbestellmail
rechnen unverändert darüber und wissen von Chargen nichts. Eine Charge mit
Menge 0 fällt aus der Map, eine leere Map wird gelöscht statt als `{}` stehen
zu bleiben.

**Negativer Bestand ohne Aufteilung.** Ein Lagerort kann negativ werden, wenn im
Einsatz mehr verbraucht wird, als gebucht war — das galt schon vor den Chargen.
Ist der Lagerort nicht aufgeteilt, zeigt die Pflege-Seite dafür keinen Chip
„ohne Charge: -3": Er wiederholte nur die rote Anzahl und sähe aus wie ein
Fehler der Chargen. Korrigiert wird so ein Bestand per Inventur.

**Warum keine eigene Bestandszeile je Charge.** Naheliegend wäre ein
`geraetBestand` je Lagerort und Charge. Das bräche alles, was am Bestand hängt:

- `geraetId` + `lagerortKey` ist die Import-Identität — Sybos liefert eine Zeile
  je Lagerort, nicht je Charge, und könnte sie nicht mehr zuordnen.
- `reconcileVerbrauch` gleicht je `bestandId` ab, ein Einsatz-Eintrag zeigt auf
  genau einen Bestand.
- Sets halten einen festen `bestandId`.
- Löschen und Archivieren eines Lagerorts arbeiten je Bestand.

Die Aufteilung im Dokument lässt das alles stehen; was sich ändert, ist nur,
*welcher Teil* von `anzahl` sich bewegt.

**Warum nicht bloß Information.** Chargen ohne Abbuchen wären schnell gebaut,
aber nach dem ersten Einsatz stimmten die Mengen je Charge nicht mehr, und die
Frage von oben ließe sich nicht beantworten. Verbrauch, Umbuchung, Inventur und
Ausbuchen bewegen deshalb echte Mengen je Charge, jede Buchung trägt ihre
`chargeId`.

**Nur Verbrauchsmaterial.** Ein Gerät (Kupplungsschlüssel, Gasmessgerät) hat
keine Lose und wird nicht abgebucht; die Server Actions lehnen eine
Chargenangabe dort mit 400 ab. Wird ein Artikel vom Verbrauchsmaterial wieder
zum Gerät, bleiben seine Chargen gespeichert und werden nur nicht mehr
angezeigt — kein Datenverlust, falls es ein Irrtum war. Der Import fasst
`chargen` und `ablaufVorlaufTage` nie an, wie die übrigen App-Felder.

**FEFO** (first expired, first out) ist die Reihenfolge überall dort, wo die App
selbst eine Charge wählt (`sortFefo`): nach Ablaufdatum aufsteigend, Chargen
ohne Ablaufdatum danach (nach Einkaufsdatum, dann ID), der Rest ohne Charge
zuletzt. Wer Material nimmt, soll das zuerst ablaufende nehmen.

### Pflege

Im Detaildialog eines Verbrauchsartikels (Abschnitt „Chargen“) stehen die
Chargen in FEFO-Reihenfolge mit Ablauf (farbig nach `expiryStatus`) und Menge;
jede Bestandszeile zeigt ihre Töpfe als Chips, ein negativer Topf ist markiert.
Angelegt und geändert wird eine Charge über `saveGeraetCharge` — **je Charge in
einer Transaktion** auf dem Artikel, nicht als ganzes Array aus dem
Bearbeiten-Dialog: Das überschriebe eine Charge, die ein Zugang gerade
angelegt hat. Daten nur als `YYYY-MM-DD`, sonst verworfen — ein falsches
Ablaufdatum brächte die FEFO-Reihenfolge durcheinander. Weil die Chargen im
Artikel-Dokument liegen, sind sie begrenzt: Texte (und die Bemerkung beim
Ausbuchen) höchstens `GERAET_CHARGE_MAX_TEXT` = 500 Zeichen, je Artikel
höchstens `GERAET_CHARGEN_MAX` = 200 Chargen samt archivierten; darüber lehnt
der Server mit 400 ab, die Dialoge begrenzen die Felder schon bei der Eingabe.

**Menge gleich beim Anlegen.** Wer eine neue Lieferung erfasst, will die Charge
und ihre Menge in einem Schritt eintragen, nicht erst anlegen und dann je
Lagerort einen Zugang buchen. Der Dialog „Neue Charge“ zeigt deshalb je Lagerort
des Artikels ein Mengenfeld, dazu „ohne Lagerort“. Jede Menge ist ein **Zugang**
auf die neue Charge (`saveGeraetCharge` mit `zugaenge`): Charge, Bestände,
Buchungen und `bestandGesamt` werden in einer Transaktion geschrieben. Eine
Charge, deren Zugang danach scheitert, bliebe sonst ohne Menge stehen.
Vorhandenen Bestand ordnet weiterhin „Aufteilen“ zu. Zwei Bedeutungen in einem
Feld führten zu stillen Doppelzählungen. Beim Ändern einer Charge gibt es keinen
Zugang (400).

**„Ohne Lagerort“ ist ein eigener Lagerort** (`art: 'unbestimmt'`,
`lagerortKey` `unbestimmt`, `GERAET_LAGERORT_UNBESTIMMT`), je Artikel höchstens
einer. Er wird beim ersten Zugang angelegt, ein archivierter wird wieder
aufgenommen. Die Menge liegt damit an einem echten `geraetBestand`, und
`bestandGesamt`, Mindestbestand und Abbuchung im Einsatz rechnen ohne
Sonderfall. Eine Charge „ohne Bestandszeile“ bräche genau das. Sybos kennt den
Lagerort nicht, deshalb setzt der Import ihn so wenig auf 0 wie einen Container.
An den richtigen Platz kommt die Ware per Umbuchung. Alternativ bekommt der
Lagerort „ohne Lagerort“ über „Lagerort bearbeiten“ einen echten Platz.

**Bestand beim Bearbeiten korrigieren.** Beim Bearbeiten einer Charge steht je
Lagerort die Menge dieser Charge (dazu „ohne Lagerort“), beim Bearbeiten eines
Lagerorts je aktiver Charge die Menge und der Rest ohne Charge — vorbefüllt mit
dem gespeicherten Stand. Eine geänderte Zahl ist der **gezählte Ist-Bestand**
dieses Topfs: `korrigiereGeraetChargenBestand` bucht die Differenz als
**Inventur** (je geändertem Topf eine Buchung, mit `chargeId`, beim Rest ohne;
Bemerkung „Korrektur Charge“ bzw. „Korrektur Lagerort“), `anzahl` und
`bestandGesamt` ändern sich mit, die Nachbestellmail greift wie bei jeder
Inventur. Wer im Bearbeiten-Dialog eine Zahl ändert, hat nachgezählt und will,
dass danach genau das dasteht — eine Aufteilung, die `anzahl` festhält,
verschöbe die Differenz still in den Rest ohne Charge, und die Summe am
Lagerort wäre falsch. Zum bloßen Zuordnen vorhandener Ware ohne
Mengenänderung bleibt „Aufteilen“. Gesendet werden nur geänderte Zeilen, nach
dem Speichern der Charge bzw. des Lagerorts; ein unveränderter negativer Rest
bleibt stehen. „Ohne Lagerort“ lässt sich so korrigieren, ohne ihm einen
Platz zu geben: Bleiben die Felder des Platzes leer, wird nur korrigiert.

| Vorgang | Wirkung auf die Chargen |
| --- | --- |
| Zugang | mit vorhandener oder in derselben Transaktion neu angelegter Charge: `anzahl` und Anteil der Charge steigen; ohne Charge wächst nur der Rest |
| Aufteilen (`aufteilenGeraetBestand`) | ordnet vorhandenen Bestand Chargen zu, **ohne** `anzahl` zu ändern — für die Ware, die vor den Chargen da war. Mehr als `anzahl` lässt sich nicht zuordnen. Protokolliert als Buchung `aufteilung` mit Menge 0, die Bemerkung nennt je Topf vorher → nachher |
| Umbuchung | mit Charge wandert deren Anteil mit; ohne wird am Quell-Lagerort nach FEFO verteilt (`allocateFefo`) — wer ins Fahrzeug umlagert, nimmt die zuerst ablaufende Ware. Je bewegtem Topf eine Buchung. Eine ausdrücklich gewählte Charge lässt sich nur bis zu ihrem Bestand am Quell-Lagerort umbuchen, sonst 400 — der Überhang bliebe dort als negativer Topf zurück |
| Korrektur beim Bearbeiten (`korrigiereGeraetChargenBestand`) | setzt je Topf (Lagerort + Charge oder Rest) die gezählte Menge; die Differenz ist eine Inventur-Buchung, `anzahl` und `bestandGesamt` ändern sich mit. „Ohne Lagerort“ wird bei Bedarf angelegt |
| Inventur | wahlweise je Charge gezählt (plus Rest ohne Charge): setzt Aufteilung und `anzahl`, je geändertem Topf eine Buchung. Ohne Zählung je Charge wird die Aufteilung gekürzt (siehe unten) |
| Charge ausbuchen (`ausbuchenGeraetCharge`) | abgelaufen, zurückgerufen, entsorgt: je Lagerort mit Bestand eine Inventur-Buchung mit `chargeId`, danach archiviert — in einer Transaktion. Ein negativer Topf wird nur aus der Aufteilung entfernt, ohne Buchung und ohne `anzahl` zu ändern — er ist keine Ware, die ausgebucht werden könnte |
| Archivieren (`archiveGeraetCharge`) | nur, wenn an keinem Lagerort mehr etwas von ihr liegt — sonst verschwände Bestand aus den Listen, der physisch noch im Lager steht |
| Lagerort löschen | der Restbestand wird je Topf als Inventur ausgebucht |

Eine archivierte Charge bleibt im Array, damit Einsatz-Einträge und Buchungen
ihre LOT weiter anzeigen. Bebuchen lässt sie sich nicht mehr, nur
leeren: Ein Zugang darauf holte sie still zurück, ohne dass sie in den Listen
wieder auftaucht.

### Im Einsatz: FEFO im Client

Beim Verbrauch entscheidet die Zahl der Töpfe mit Bestand am gewählten Lagerort
(`needsChargeChoice`):

- **Ein Topf** → die Charge wird ohne Rückfrage genommen.
- **Mehrere** → der Einzeldialog zeigt ein Mengenfeld je Topf, vorbelegt nach
  FEFO; Speichern geht erst, wenn die Summe der Menge entspricht. Ändert sich
  Menge oder Lagerort, rechnet die Vorbelegung neu, solange niemand die Felder
  angefasst hat. Beim Bearbeiten zählt der schon gebuchte Verbrauch des Eintrags
  wieder zum Bestand (`bestandForEdit`), sonst fehlte die gerade verbrauchte
  Charge in der Auswahl.
- **Schnellwege** (Mehrfachauswahl, Set) fragen nicht nach: Die Aufteilung kommt
  aus `allocateFefo`, und gab es mehrere Töpfe, steht der Eintrag mit
  `chargenGeprueft: false` da. Die Liste zeigt dann den Chip „Charge prüfen“, ein
  Klick öffnet den Einzeldialog. Im Einsatz zählt, dass alles schnell drin ist —
  die Charge lässt sich danach in Ruhe richtigstellen.

**Warum FEFO im Client und nicht im Abgleich.** Der Eintrag trägt seine
Aufteilung selbst (`geraetEinsatz.chargen`). `syncGeraetVerbrauch` bucht nur
nach, was dasteht, und bleibt dadurch deterministisch und idempotent: Würde der
Server bei jedem Lauf neu nach FEFO verteilen, wanderte ein Verbrauch beim
zweiten Lauf oder nach einem Zugang auf eine andere Charge. Der Client kennt
Artikel und Bestand ohnehin aus dem Cache, die Vorbelegung geht also auch
offline.

`reconcileVerbrauch` gleicht dafür je **Topf** (`bestandId`, `chargeId`) ab statt
je Lagerort; ein Chargenwechsel ohne Mengenänderung wird zur Rückbuchung auf der
einen und Abbuchung auf der anderen Charge. Alte Buchungen ohne `chargeId`
zählen als Rest ohne Charge. Ist die Aufteilung eines Eintrags nicht stimmig
(`validChargenTeile`: Summe ungleich der Menge, eine Charge nicht vom Artikel,
ein Topf doppelt), verwirft der Abgleich sie, bucht alles auf den Rest ohne
Charge und loggt das — lieber stimmt die Summe am Lagerort als eine erfundene
Charge. Eine archivierte Charge gilt dabei noch als gültig, weil der Eintrag
älter sein kann als das Archivieren. Mehrere Töpfe desselben Lagerorts werden an
einer Arbeitskopie gesammelt und mit einem Schreibvorgang geschrieben; zwei
Updates aus demselben Snapshot überschrieben einander.

### Import und Kürzen

Sybos kennt keine Chargen; der Import setzt nur `anzahl`. Sinkt `anzahl` ohne
Chargenangabe — Import, Inventur ohne Zählung je Charge —, schrumpft die
Aufteilung mit (`shrinkChargen`): zuerst der Rest ohne Charge, soweit positiv,
danach die Chargen in FEFO-Reihenfolge, keine unter 0, und liegt die Map dann
noch darüber, auch Einträge zu unbekannten Chargen. Sonst läge mehr auf
Chargen, als am Lagerort ist. Steigt `anzahl`, wächst nur der Rest.

Bekannte Unschärfe: Der Import rechnet die neue Aufteilung vom gelesenen Stand
aus, ändert `anzahl` selbst aber per `increment`. Läuft gleichzeitig ein
Verbrauch, kann die Aufteilung um diesen abweichen — die Summe stimmt, und die
nächste Inventur je Charge bringt die Töpfe wieder in Ordnung.

### Ablaufwarnung

Eine Charge ist **abgelaufen** vor ihrem Ablaufdatum und läuft **bald ab** bis
einschließlich heute plus Vorlauf (`expiryStatus`). Der Vorlauf steht je Artikel
in `ablaufVorlaufTage`, ohne Angabe 60 Tage — Löschschaummittel hat andere
Fristen als Bindemittel.

- **Auf der Pflege-Seite** listet der Reiter „Läuft bald ab“ alle nicht
  archivierten Chargen aktiver Verbrauchsartikel mit Bestand, die abgelaufen
  sind oder bald ablaufen (`expiringChargen`), nach Ablaufdatum sortiert. Der
  Reiter verschwindet, sobald nichts mehr abläuft.
- **Per Mail** schickt Cloud Scheduler jeden Montag um 07:00 (Europe/Vienna)
  einen POST an `/api/geraete/ablauf-report` (`cronRequired`, derselbe Invoker
  wie der Wochenbericht des Fahrtenbuchs). Je Gruppe geht eine Sammelmail an
  die Mängel-E-Mail — dieselben Empfänger wie die Nachbestellmail —, **nur wenn
  die Liste nicht leer ist**. „Heute“ ist der Kalendertag in Wien. Die Mail
  nennt je Charge Artikel, Ablaufdatum und Menge je Lagerort samt Link auf
  `/geraete`. Ein Route Handler und keine Server Action, weil der Aufrufer ein
  Zeitplan mit OIDC-Token ist. Bei einem Teilerfolg antwortet der Endpoint mit
  200, damit die Wiederholung des Schedulers keiner Gruppe die Mail doppelt
  schickt.
- In **dev** ist der Job pausiert (`ablauf_report_paused`), wie der
  Wochenbericht: Beide Umgebungen schrieben sonst an dieselbe Verteilerliste.

## Historie je Artikel

Im Detail eines Artikels steht ein zugeklappter Bereich „Historie": was von wem
wann geändert wurde — Verbrauch, Zugang, Umbuchung, Inventur, Änderungen an
Stammdaten, Chargen, Lagerorten und Sets, dazu die Zuordnung zu einem Einsatz.

### Warum `geraetBuchung` und keine neue Sammlung

Das Protokoll ist `geraetBuchung`, erweitert um Arten ohne Mengenänderung. Eine
zweite Sammlung hieße zwei Abfragen, die man für die Anzeige zeitlich
zusammenmischen müsste, einen zweiten Index und zwei Stellen für die
Berechtigung. So ist es eine Abfrage (`geraetId`, absteigend nach `createdAt`),
und die bestehenden Buchungen sind schon Historie — ohne Migration.

### Mengenarten gegen Protokollarten

| Gruppe | Arten | `menge` |
| --- | --- | --- |
| Menge | `verbrauch`, `zugang`, `umbuchung`, `inventur`, `import`, `storno`, `aufteilung` | echt |
| Protokoll | `stammdaten`, `angelegt`, `archiviert`, `charge`, `lagerort`, `set`, `zuordnung`, `zuordnungEnde` | `0` |

`isBestandBuchung(art)` (in `src/common/geraet.ts`) trennt die beiden. **Jede
Stelle, die Buchungen auswertet, muss darauf filtern**, sonst zählt ein
Protokolleintrag als Bewegung: `deleteGeraet` (was als „echte Buchung" das
Löschen verhindert, sind Mengenarten außer `import`; Protokolleinträge allein
verhindern es nicht und werden mitgelöscht), `syncGeraetVerbrauch` (summiert nur
`verbrauch`/`storno`) und `previewGeraetImport` (Abweichungen nur gegen
Mengenbuchungen). Wer eine neue Auswertung baut, filtert ebenfalls. `bestandId`
ist deshalb optional: Ein Stammdateneintrag hat keinen Lagerort.

### Werte als Text

Änderungen stehen als `aenderungen: { feld, vorher?, nachher? }[]` am Eintrag.
Die Werte sind schon beim Schreiben Text (`formatFeldwert` in
`src/common/geraetProtokoll.ts`: Zahlen wie sie sind, Booleans „ja"/„nein",
Arrays mit „, " verbunden, ein Lagerort über `formatLagerort`). Das Protokoll
soll lesbar bleiben, auch wenn sich ein Feld später vom Text zur Zahl oder zum
Objekt wandelt — ein gespeicherter Typ würde sonst jede Anzeige an die
Datenmodell-Geschichte binden. `undefined`, `null` und `''` gelten als gleich
„leer", und `diffFields` liefert nur echte Unterschiede: Ein Speichern ohne
Änderung schreibt **keinen** Eintrag. Ein fehlender Schlüssel `vorher` heißt
„war leer".

### Zum Schreibzeitpunkt festgehalten

Vier Angaben stehen als Kopie am Eintrag, nicht als Verweis:

- `createdByName` (Anzeigename, sonst E-Mail): Die Sammlung `user` darf jeder nur
  für sich selbst lesen; das Protokoll könnte fremde Namen sonst nicht auflösen.
- `firecallName` und `firecallArt`: Ein Einsatz kann umbenannt oder gelöscht
  werden, das Protokoll soll weiter sagen, wofür verbraucht wurde und ob es eine
  Übung war.
- `lagerortText`: Ein Lagerort kann umbenannt oder gelöscht werden.

Ältere Einträge haben diese Felder nicht und zeigen „—"; sie werden nicht
nachgetragen.

### Welche Aktion schreibt was

| Aktion | Eintrag |
| --- | --- |
| `saveGeraet` (neu) / Import (neu) | `angelegt`, gesetzte Felder als Änderungen |
| `saveGeraet` (geändert), `setGeraeteVerbrauchsmaterial`, Import mit geänderten Stammdaten | `stammdaten` mit Diff über `STAMMDATEN_FIELDS` |
| `deleteGeraet`, wenn nur deaktiviert | `archiviert` |
| Charge anlegen, ändern, archivieren | `charge` mit `chargeId`, `bemerkung` „angelegt"/„geändert"/„archiviert" (zusätzlich zu den Zugangsbuchungen) |
| Lagerort anlegen, ändern, löschen ohne Bestand | `lagerort` |
| `saveGeraetSet`, `deleteGeraetSet` | `set` |
| `syncGeraetVerbrauch` | `verbrauch`/`storno` wie bisher, jetzt mit Einsatzname und -art |
| `syncGeraetZuordnung` | `zuordnung`, `zuordnungEnde` |

Mengenbuchungen (Zugang, Umbuchung, Inventur) schreiben wie bisher; neu ist an
ihnen nur `createdByName` und `lagerortText`.

### Sets

Das Set ist kein Artikel mit eigener Historie, sondern Zugehörigkeit.
`setMembershipEntries` schreibt je Artikel, der in ein Set kommt oder aus ihm
fällt, einen Eintrag `set` („Set „X": hinzugefügt/entfernt/gelöscht"), und
einen am gebundenen Set-Artikel (`sybosSetArtikelId`), wenn die Bindung wechselt.
Eine Änderung nur am Namen, an den Codes oder an der Menge eines Inhalts ist
keine Änderung der Zugehörigkeit und schreibt nichts.

### Zuordnung von Geräten: über die Warteschlange

Eine Zuordnung (`geraetEinsatz` mit `art: 'zugeordnet'`) wird lokal geschrieben,
also auch offline. Das Protokoll kann deshalb nicht im Dialog entstehen:
`syncGeraetZuordnung(firecallId, einsatzEintragId)` ist wie
`syncGeraetVerbrauch` eine „nachholen"-Action, angestoßen über
`geraetZuordnungQueue.ts` (Typ `syncGeraetZuordnung`, Schlüssel je Einsatz und
Eintrag) nach dem Anlegen und Löschen eines Zuordnungseintrags.

Sie ist ein **Abgleich**: Sie liest den Eintrag und die bisherigen Protokolle
`zuordnung`/`zuordnungEnde` mit dieser Eintrags-ID und schreibt nur, was fehlt —
`zuordnung`, wenn der Eintrag besteht und der letzte Protokolleintrag keine
`zuordnung` ist, `zuordnungEnde` (mit dem Artikel der früheren Buchung), wenn der
Eintrag weg ist und der letzte eine `zuordnung` war, sonst nichts. Ein doppelt
abgearbeiteter Aufruf schreibt darum nichts doppelt, und für das Entfernen
braucht es keinen eigenen Typ in der Warteschlange.

**Grenze:** Wird ein Gerät offline zugeordnet und vor dem Abgleich wieder
entfernt, sieht der Server nie einen Eintrag — es entsteht keine `zuordnung` und
keine `zuordnungEnde`.

### Anzeige

`GeraetHistory` lädt erst beim ersten Aufklappen, 50 Einträge je Seite, „Mehr
laden" holt die nächste (`startAfter`). Die Abfrage `geraetId ==` mit
`orderBy createdAt desc` braucht den zusammengesetzten Index auf `geraetBuchung`
(`geraetId` aufsteigend, `createdAt` absteigend) in
`firebase/{dev,prod}/firestore.indexes.json`. Fehlt er in einer Umgebung, schlägt
die Abfrage dort mit einem Fehler fest und die Historie bleibt leer.

### Art am Einsatz

Damit das Protokoll Übungen vom Ernstfall trennt, hat ein Einsatz eine `art`
(`FirecallArt` in `src/common/firecallArt.ts`: `einsatz`, `uebung`, `sonstiges`);
fehlt sie, gilt `einsatz`. Sie wird im Dialog zum Anlegen und Bearbeiten des
Einsatzes gewählt; die Einsatzliste zeigt bei Übung und Sonstiges einen Chip.
Verbrauch, Storno und Zuordnung übernehmen sie als `firecallArt` in den Eintrag.

## Berechtigungen

Pflege — Artikel anlegen und ändern, Zugang, Umbuchung, Inventur, Import, Sets,
Chargen — dürfen
**Gruppen-Admin und Gerätemeister** der Gruppe
(`actionFahrtenbuchManagerRequired(groupId)`, plus `assertTenantGroup`). Der
Gerätemeister pflegt schon Fahrzeuge und Personen im Fahrtenbuch; die Beladung
dieser Fahrzeuge gehört zur selben Aufgabe. Eine eigene Rolle „Lagerverwalter" wäre
eine weitere Liste am Benutzerdokument, die in der Praxis dieselben Personen trüge.

Lesen dürfen alle Mitglieder der Gruppe (`fahrtenbuchMember()` in den
Firestore-Regeln), denn der Einsatz-Dialog braucht Artikel und Lagerorte — auch
offline aus dem Cache. Schreiben aus dem Client ist für `geraet`, `geraetBestand` und
`geraetBuchung` gesperrt, damit `bestandGesamt` und Protokoll nicht auseinanderlaufen;
für `geraetSet`, damit die Code-Eindeutigkeit nur an einer Stelle geprüft wird.
`call/{id}/geraetEinsatz` fällt unter die allgemeine Regel für Unterdokumente eines
Einsatzes; nur so kann der Eintrag offline lokal geschrieben werden. Rollen
allgemein: [berechtigungen.md](berechtigungen.md).

## Atemschutz bleibt getrennt

Atemschutzgeräte, Flaschen und Masken liegen weiter in `atemschutzGeraet`, nicht in
`geraet`, obwohl sie aus demselben Sybos-Export stammen könnten. Der Atemschutz hat
eigene Abläufe, die hier nicht passen: Ausgabe und Rücknahme am Sammelplatz,
Flaschensuche über sechs Kennungen, Füllprotokoll, Mängel je Gerät, Verrechnung.
Eine gemeinsame Sammlung hätte jede Abfrage beider Seiten um einen Filter ergänzt und
jede Änderung am einen Modell zu einem Risiko für das andere gemacht. Siehe
[atemschutzsammelplatz.md](atemschutzsammelplatz.md).

## Import

Datei-Upload (XLSX), erst Vorschau (`previewGeraetImport`), dann Übernahme
(`importGeraete`). Welche Zeilen importiert werden, sortiert die Feuerwehr vorab in
Sybos aus; der Import nimmt, was in der Datei steht. Geräte- und Lagerartikel-Export
haben dasselbe Format und landen in derselben Sammlung.

- **Neue Artikel** bekommen die Sybos-`ID` als Dokument-ID, ihre Bestände entstehen
  aus `Anzahl` mit einer Buchung `import`.
- **Stammdaten** vorhandener Artikel werden aktualisiert; ein in Sybos geleertes Feld
  wird am Artikel gelöscht (`removedFields`). Die von Hand gepflegten Felder
  (`verbrauchsmaterial`, `mindestbestand`, `einheit`, `kostenersatzRateId`) fasst der
  Import nie an.
- **`Status = inaktiv`** setzt `active: false`, wie beim Atemschutz-Import.
- **Artikel, die in der Datei fehlen, bleiben unberührt.** Geräte und Lagerartikel
  kommen aus getrennten Exporten; ein Geräte-Import darf die Lagerartikel nicht
  deaktivieren.
- **Doppelte Lagerorte** innerhalb einer ID werden zusammengezählt und als Hinweis
  gemeldet.

### Gebuchter Bestand wird nie still überschrieben

Sybos ist für Stammdaten die Quelle, für den Bestand nach dem ersten Import aber nicht
mehr: Ein Verbrauch im Einsatz steht hier, nicht in Sybos. Ein Folgeimport, der die
Anzahl aus Sybos übernähme, machte jeden Verbrauch seit dem letzten Import rückgängig.

Deshalb entscheidet je Artikel, ob es **seit dem letzten Import** (`importedAt`)
Buchungen gab:

- **Keine Buchungen** → geänderte Anzahlen werden übernommen, als Buchung `import`
  (`plan.bestandUpdate`). Hier ist Sybos noch die einzige Quelle.
- **Buchungen vorhanden** → die Vorschau zeigt jede Abweichung je Lagerort
  (`plan.deviations`). Wer importiert, übernimmt sie einzeln als `inventur` oder
  verwirft sie. Eine Abweichung ohne `bestandId` ist ein neuer Lagerort an einem
  gebuchten Artikel: Übernehmen legt den Bestand mit der importierten Anzahl an,
  Verwerfen legt nichts an.

Ein Lagerort, der in der Datei fehlt, zählt als importierte 0 — er folgt denselben
zwei Wegen. Steht er schon auf 0, bleibt er, wie er ist.

## Was bewusst (noch) fehlt

- Einsatztagebuch-Eintrag beim Verbrauch, Material im Sybos-Übertrag und
  Kostenersatz-Vorschläge aus `kostenersatzRateId` — die Felder sind angelegt, die
  Anbindung ist ein eigener Schritt.
- Ein Rückschreiben nach Sybos. Der Bestand in Sybos wird von Hand nachgeführt.
- Sets aus dem Sybos-Export ableiten (die Zuordnung steht nicht darin), Sets im
  Einsatz anlegen oder ändern, Sets im Set.
- Chargen bei Geräten — nur Verbrauchsmaterial wird abgebucht, ein Gerät hat
  keine Lose.
- Chargen im Sybos-Import und im Rückschreiben, im Sybos-Übertrag und im
  Einsatz-Ausdruck. Der Eintrag trägt seine Charge; das Nachziehen ist ein
  eigener Schritt.
- Die LOT per Scan (GS1-Barcode) erfassen.
- Der Wert von `Kategorie` im Lagerartikel-Export ist noch nicht bekannt; die
  Vorbelegung von `verbrauchsmaterial` greift erst, wenn er „verbrauch" oder
  „lagerartikel" enthält.
