# Einsatz sichern und zurückspielen

Der Download-Knopf an einem Einsatz (`FirecallExport`) schreibt den kompletten
Einsatz als eine JSON-Datei; `FirecallImport` auf der Einsatz-Übersicht legt
daraus eine **Kopie** an. Ein Zurückspielen auf die ursprüngliche ID gibt es
nicht — der Import ist immer „Einsatz X Kopie <Zeitstempel>“.

Beides steckt in [`src/hooks/useExport.ts`](../src/hooks/useExport.ts).

## Was in der Datei steht

Das Einsatz-Dokument selbst plus alle Untersammlungen unter `call/{id}`:

| Untersammlung | Feld im JSON | Anmerkung |
| --- | --- | --- |
| `item` | `items` | inklusive der `stroke`-Untersammlung an Zeichnungen |
| `layer` | `layers` | IDs bleiben erhalten, `item.layer` zeigt darauf |
| `mapLayer` | `mapLayers` | eigene WMS-/WMTS-Kartenebenen, s. [eigene-kartenebenen.md](eigene-kartenebenen.md) |
| `history` | `history` | je Eintrag `snapshotItems` (mit den Strichen der Zeichnungen) und `snapshotLayers` |
| `location` | `locations` | Einsatzorte |
| `kostenersatz` | `kostenersatz` | |
| `auditlog` | `auditlog` | |
| `chat` | `chat` | |
| `crew` | `crew` | Besatzung je Fahrzeug |
| `atemschutzFuellung` | `atemschutzFuellungen` | Füllprotokoll, s. [atemschutzsammelplatz.md](atemschutzsammelplatz.md) |
| `atemschutzTrupp` | `atemschutzTrupps` | je Zeile eine Bereitstellung; `truppKey` bindet sie zusammen und bleibt erhalten |
| `atemschutzAusgabe` | `atemschutzAusgaben` | Ausgabe der Ausrüstung; `geraetId` zeigt auf `groups/{groupId}/atemschutzGeraet` |

Anhänge — die des Einsatzes und die an Markern — werden aus dem Storage geladen
und als Base64 in die Datei geschrieben. Der Import lädt sie wieder hoch.

`backupVersion` steht für das Format der Datei. Dateien ohne das Feld stammen
aus der Zeit davor und gelten als Version 1. Ist die Version höher als die der
laufenden App, warnt der Import — die Datei kann Daten enthalten, die er nicht
kennt.

## Was bewusst nicht drin ist

- **`livelocation`** (`call/{id}/livelocation`): Standorte sind nur während des
  laufenden Einsatzes gültig und wären in einer Kopie irreführend.
- **Einsatz-Fotos im Google Drive** (siehe
  [einsatz-drive-fotos.md](einsatz-drive-fotos.md)): Die Fotos bleiben im Drive.
  Gesichert wird nur `driveFolderId`, und der bleibt beim Import stehen — die
  Kopie zeigt absichtlich auf denselben Ordner.
- **Fahrtenbuch-Einträge**: Sie liegen unter `groups/{groupId}/fahrtenbuch` und
  verweisen auf den Einsatz, gehören aber nicht zum Einsatz.
- **Atemschutz-Stammdaten** (`groups/{groupId}/atemschutzGeraet`): Sie gehören
  der Gruppe, nicht dem Einsatz — wie die Fahrtenbuch-Fahrzeuge. Die Kopie
  eines Einsatzes zeigt mit `atemschutzAusgabe.geraetId` weiterhin auf
  denselben Bestand. Wird ein Einsatz in eine *andere* Gruppe importiert,
  laufen diese Verweise ins Leere; der Ausrüstungsreiter zeigt die Zeile dann
  nicht mehr an, das Füllprotokoll bleibt vollständig (es trägt die
  Flaschennummer im Klartext).
- **Ausrüstungsmängel** (`groups/{groupId}/mangel` mit
  `itemType: 'atemschutz'`): Sie liegen wie die Fahrzeugmängel bei der Gruppe
  und überdauern den Einsatz — genau dafür sind sie da.

## Was der Import ändert

Ein paar Felder der Quelle gelten für eine Kopie nicht und werden verworfen
oder überschrieben:

- **`group`** wird im Import-Dialog gewählt. Vorbelegt ist die Gruppe aus der
  Datei, sofern sie für den Benutzer freigegeben ist. Pseudo-Gruppen aus
  `NON_TENANT_GROUP_IDS` stehen nicht zur Auswahl.
- **`fahrtenbuchEntryCount`** fällt weg: Die Kopie hat keine eigenen Fahrten.
  Bliebe der Zähler stehen, meldete die Übersicht erfasste Fahrten, die es nicht
  gibt — und niemand trägt sie mehr ein. `fahrtenbuchRoute` bleibt dagegen: Der
  Weg zum Einsatzort ist derselbe.
- **`attachments`** wird nicht übernommen, sondern aus dem Ergebnis des
  Wiederhochladens gesetzt. Die alten URLs zeigen auf die Dateien des
  Quell-Einsatzes; stünden sie in der Kopie, verlöre diese ihre Anhänge, sobald
  das Original gelöscht wird. Eine alte Sicherungsdatei ohne eingebettete
  Anhänge behält ihre URLs — dort gibt es nichts hochzuladen.

`blaulichtSmsAlarmIds` und die SumUp-Felder am Kostenersatz bleiben bewusst
stehen: Die Kopie soll weiter auf dieselben Alarme zeigen.

## Dateinamen von Anhängen

Anhänge liegen im Storage unter `<uuid>-<Dateiname>`, siehe
[`src/common/attachmentName.ts`](../src/common/attachmentName.ts). Der Präfix
trennt zwei Dateien, die am selben Einsatz gleich heißen.

Die Regel stand früher an acht Stellen als nacktes `substring(37)` im Code, und
der Import setzte den Präfix beim Wiederhochladen nicht. Damit überschrieben
sich gleichnamige Anhänge, und ein erneuter Export schnitt vom dann kurzen Namen
37 Zeichen ab — übrig blieb ein leerer Name. Wer Anhänge anfasst, benutzt
`storageFileName()` und `displayFileName()` statt eigener Arithmetik.

## Fehler werden angezeigt, nicht protokolliert

Export und Import melden jeden fehlgeschlagenen Anhang über `onWarning` an die
Oberfläche, die daraus eine Snackbar baut. Vorher landeten diese Fehler nur in
einem `console.warn`: Ein Anhang, der sich nicht laden ließ, fehlte still in der
Sicherung, und die Datei sah dabei vollständig aus. Bei einer Sicherungsfunktion
ist genau das die gefährlichste Eigenschaft — deshalb darf kein Fehlschlag mehr
lautlos bleiben.

## Zeichnungen in der History

Die Striche einer Zeichnung liegen nicht im Item-Dokument, sondern in der
Untersammlung `stroke` darunter — sowohl unter dem Einsatz als auch unter einem
History-Eintrag (`history/{id}/item/{itemId}/stroke`).

`useSaveHistory` hat lange nur `item` und `layer` kopiert. Jeder Snapshot
enthielt damit eine leere Zeichnung, und `useDrawingStrokes` las die Striche
immer vom aktuellen Stand — eine alte Lage zeigte also die Zeichnung von heute.
Beides ist behoben: Der Snapshot nimmt die Striche mit, und `useDrawingStrokes`
liest im History-Modus aus dem Snapshot.

**Snapshots von vorher haben keine Striche.** Sie zeigen ihre Zeichnungen jetzt
leer statt mit dem heutigen Stand — die Striche wurden damals schlicht nicht
gesichert. Nachträglich lässt sich das nicht reparieren.

## Fortschritt und Nebenläufigkeit

Export und Import melden ihren Stand über `onProgress`. Die Gesamtzahl steht
beim Export erst fest, wenn die Untersammlungen geladen sind — bis dahin meldet
die Phase `structure` eine Null und die Oberfläche zeigt einen unbestimmten
Balken. Danach zählt ein einziger Zähler über alle Phasen hinweg hoch, damit die
Anzeige nie zurückspringt. Eine Einheit ist: eine Zeichnung, ein
History-Eintrag, ein Anhang.

Beim Import ist die Gesamtzahl von Anfang an bekannt. Sie wird von
`countImportSteps` vorab berechnet — und weil eine solche Zahl leicht von den
tatsächlichen Schreibvorgängen abdriftet, hält ein Test in `useExport.test.ts`
beide gegeneinander („should announce exactly as many steps as it writes").

Zwei Dinge liefen vorher unbegrenzt parallel und laufen jetzt über
`mapWithConcurrency` mit `BACKUP_CONCURRENCY` Aufgaben gleichzeitig: die
History-Einträge — ein Einsatz mit 200 Auto-Snapshots stieß sonst über 400
Firestore-Abfragen auf einmal an — und die Anhänge, die sonst alle gleichzeitig
im Speicher landeten. Die acht Abfragen der Untersammlungen laufen umgekehrt
jetzt *gemeinsam* statt nacheinander; sie hängen nicht voneinander ab.

Byte-genauer Fortschritt innerhalb einer großen Datei ist nicht möglich:
`getBlob` aus dem Firebase-SDK hat kein Fortschrittsereignis, ein Gegenstück zu
`uploadBytesResumable` gibt es nicht. Das ginge nur über `getDownloadURL` plus
`fetch` und Lesen aus `response.body` — mit anderem Auth-Pfad und nur den
Aufwand wert, wenn im Storage einmal wirklich große Dateien liegen.

## Bekannte Grenzen

- Der Export hält den gesamten Einsatz inklusive aller Anhänge als Base64 im
  Speicher. Bei sehr vielen Fotos wird die Datei entsprechend groß. Ein
  ZIP-Format wäre die naheliegende Ablösung — `fflate` ist bereits Dependency
  und wird in `spectrumParser.ts` zum Lesen von Archiven benutzt. Näheres in
  der Diskussion zu PR #745; heute ist der Druck gering, weil die Masse der
  Fotos ohnehin im Drive liegt und nicht im Storage.
