# Audit-Log und Wiederherstellen von Elementen

Jede Änderung an einem Element des Einsatzes landet in `call/{id}/auditlog`
(Aktion, Typ, Element, Vor- und Nachher-Stand). Gelöschte Elemente lassen sich
wiederherstellen — aus der Ebenen-Ansicht, aus einem Verlauf-Snapshot oder aus
einem Audit-Log-Eintrag.

## Gelöscht wird weich

Ein Element wird nie entfernt, sondern bekommt `deleted: true`. Technisch ist
das ein Update über `useFirecallItemUpdate`. Welche Aktion im Protokoll steht,
entscheidet `auditActionForUpdate` (`src/common/auditAction.ts`) am Übergang
von `deleted`:

| vorher | nachher | Aktion |
| --- | --- | --- |
| nicht gelöscht | gelöscht | `delete` |
| gelöscht | nicht gelöscht | `restore` |
| sonst | | `update` |

Dieselbe Regel gilt für Einsätze (`Einsaetze.tsx`, `EinsatzDetails.tsx`) und
für den MCP-Server. Dort liefert ein Tool-Call nur geänderte Felder; fehlt
`deleted`, bleibt es beim bisherigen Wert.

## Vorzustand aus dem lokalen Cache

Fast kein Aufrufer von `useFirecallItemUpdate` übergibt einen Vorzustand, und
`FirecallItemBase.filteredData()` lässt `original` weg. Der Hook liest deshalb
vor dem Schreiben das Dokument aus dem lokalen Firestore-Cache
(`cachedDocData`). Der Cache antwortet auch offline und ohne Warten auf den
Server; fehlt das Dokument dort, bleibt es beim übergebenen Vorzustand.

Das Audit-Log zeigt die geänderten Felder (`changedFields`) über den beiden
Ständen an und hebt sie hervor; `updatedAt`/`updatedBy` zählen nicht.

## Warum jeder Eintrag bereinigt wird

Der Browser-Client von Firestore läuft **ohne** `ignoreUndefinedProperties`.
Ein einziges `undefined`-Feld im Vor- oder Nachher-Stand — etwa `rotation` vor
der ersten Drehung oder `original: undefined` — lässt das SDK den ganzen
Eintrag ablehnen. Weil ein Fehler beim Protokollieren bewusst nur in der
Konsole landet, fehlte so still jeder betroffene Eintrag. `useAuditLog` und
`logAuditChange` schicken deshalb alles durch `sanitizeAuditValue`: ohne
`undefined` und Funktionen, verschachtelte Arrays als JSON, Klasseninstanzen
als einfache Objekte. Der Server (Admin-SDK) ignoriert `undefined` ohnehin.

## Ebene löschen und wiederherstellen

Beim Löschen einer Ebene löscht `useFirecallItemUpdate` ihre noch sichtbaren
Elemente mit und markiert sie mit `deletedWithLayer: <ebenenId>`; jedes
bekommt einen eigenen `delete`-Eintrag. Wird die Ebene wiederhergestellt,
kommen genau diese Elemente mit zurück. Was vorher schon einzeln gelöscht war,
trägt die Markierung nicht und bleibt gelöscht.

## Die drei Wege zum Wiederherstellen

Alle laufen über `useFirecallItemRestore`, das immer `deleted: false` setzt
und `restore` protokolliert.

- **Gelöschte Elemente (Ebenen-Ansicht):** zugeklappter Abschnitt
  „Gelöschte Elemente (n)" unter den Ebenen, für Admins — globaler Admin oder
  `gruppe.manage` in der Gruppe des Einsatzes. Kein Schalter mehr: hinter dem
  Schalter war der Abschnitt nicht zu finden. Die Zahl im Kopf zeigt, ob es
  etwas zurückzuholen gibt; dafür läuft die Abfrage auf `deleted == true`,
  solange die Ansicht offen ist. Im Verlaufsmodus ausgeblendet, sonst stünde
  der aktuelle Stand neben dem Snapshot.
- **Verlauf-Snapshot:** Im Verlaufsmodus hat jede Element-Karte
  „Wiederherstellen", ebenso das Popup des Elements auf der Karte
  (`RestoreItemButton` in `FirecallItemPopup` sowie in den Popups von Fläche
  und Leitung). Der Stand aus dem Snapshot ersetzt den aktuellen
  vollständig (`merge: false`); bei einer Zeichnung ersetzen die gesicherten
  Striche die aktuellen, sonst bliebe ein Mischbild. Ein gelöschtes Element
  kommt nie mit der `historyId` zurück — sein Stand ist der aktuelle, die
  Striche des Snapshots gehörten nicht dazu.
- **Audit-Log:** „Vorherigen Stand wiederherstellen" an `update`- und
  `delete`-Einträgen mit Vorzustand. Hier wird **zusammengeführt**
  (`merge: true`), weil der Vorzustand oft nur die geänderten Felder enthält
  (`lat`/`lng` nach dem Verschieben). Einträge zu Einsatz, Einsatzorten,
  Kostenersatz und Kartenebenen sind keine Elemente und bieten das nicht an.

Verlauf und Audit-Log verlangen Schreibrecht am Einsatz, Nur-Lese-Gäste sehen
die Knöpfe nicht.

## Wer Einträge anlegen darf

Die Firestore-Regel für `call/{id}/auditlog` lässt das Anlegen nur mit
Schreibrecht am Einsatz (`callWriteAuthorized()`) und nur unter der eigenen
E-Mail (`user`) zu; Ändern und Löschen gar nicht. Ein schreibender Gast
protokolliert seine Änderungen also wie ein Mitglied.

Der Grund ist das Wiederherstellen: „Vorherigen Stand wiederherstellen" schreibt
den Vorzustand eines Eintrags mit den Rechten dessen, der den Knopf drückt.
Dürfte ein Nur-Lese-Gast Einträge anlegen, könnte er einen Vorzustand
erfinden, den ein Bearbeiter dann ahnungslos ins Element übernimmt.

Die allgemeine Regel `match /{coll}/{rest=**}` unter `call/{doc}` nimmt
`auditlog` deshalb vom Schreiben aus. Firestore verknüpft Regeln mit ODER —
ohne den Ausschluss hätte sie Ändern, Löschen und fremde E-Mails trotz der
eigenen Regel erlaubt.

Ausnahme ist der globale Admin: Er darf Einträge unter fremdem Namen anlegen,
damit eine Einsatz-Sicherung ihr Audit-Log vollständig zurückbringt. Alle
anderen spielen beim Import nur die eigenen Einträge zurück, die übrigen
fallen weg und werden als `auditlogSkipped` gemeldet (siehe
[einsatz-backup.md](einsatz-backup.md)).

## Bekannte Lücken

Nicht protokolliert sind abgeleitete Daten (Straßen-Routing, Höhenprofil,
berechnete Felder einer Ebene), Felder am Einsatzdokument außerhalb des
Bearbeiten-Dialogs (Anhänge, Sybos-Übertrag, ASSP-Besetzung,
Snapshot-Intervall), der Import eines ganzen Einsatzes und die
Admin-Server-Actions zum Aufräumen und Zurückholen von Elementen.
