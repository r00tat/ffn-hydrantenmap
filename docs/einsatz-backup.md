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
| `history` | `history` | je Eintrag `snapshotItems` und `snapshotLayers` |
| `location` | `locations` | Einsatzorte |
| `kostenersatz` | `kostenersatz` | |
| `auditlog` | `auditlog` | |
| `chat` | `chat` | |
| `crew` | `crew` | Besatzung je Fahrzeug |

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

## Bekannte Grenzen

- Der Export hält den gesamten Einsatz inklusive aller Anhänge als Base64 im
  Speicher. Bei sehr vielen Fotos wird die Datei entsprechend groß.
- History-Snapshots enthalten keine Zeichenstriche: `useSaveHistory` kopiert nur
  `item` und `layer`, nicht die `stroke`-Untersammlung. Das ist eine Lücke der
  History selbst und schlägt auf die Sicherung durch.
