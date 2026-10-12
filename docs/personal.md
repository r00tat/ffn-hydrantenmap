# Personal

Der Personalstand einer Gruppe liegt in `groups/{groupId}/person` und wird auf
der Seite **Personal** (`/personal`,
[PersonalPage](../src/components/Personal/PersonalPage.tsx)) gepflegt.

## Eine Liste für alle

Die Sammlung stammt aus dem Fahrtenbuch — daher noch der Typname
`FahrtenbuchPerson` und die Actions in
[stammdatenActions.ts](../src/components/Fahrtenbuch/stammdatenActions.ts).
Inzwischen lesen sie drei Bereiche:

| Bereich | Wozu | Welche Personen |
| --- | --- | --- |
| Fahrtenbuch | Fahrer, Zusatzfahrer, „Gefahren bin ich" | Fahrer: aktive **Kraftfahrer**; Zusatzfahrer: alle aktiven |
| Bekleidung | Ausgabe an eine Person | alle (inaktive markiert) |
| Atemschutz | Namensvorschläge für Trupps und ASSP | aktive **Atemschutzträger**, plus Mannschaft und Eingetipptes |
| Füllprotokoll | „Gefüllt von" | alle aktiven — wer füllt, muss kein Atemschutzträger sein |
| Besatzung | Anzeigename zur BlaulichtSMS-Empfänger-ID | alle aktiven |

Bis zur Seite „Personal" wurde die Liste an zwei Stellen gepflegt: im Reiter
„Personen" der Fahrtenbuch-Verwaltung und über „Neue Person" in der
Bekleidung. Der Reiter ist entfallen; „Neue Person" in der Bekleidung bleibt
als Abkürzung während einer Ausgabe und legt in derselben Sammlung an.

Bewusst **keine** eigene Sammlung und keine Umbenennung: Fahrten, Ausgaben und
Konten-Zuordnungen zeigen auf die Dokument-IDs, und eine Migration hätte nichts
gewonnen außer einem schöneren Namen.

## Qualifikationen

Zwei optionale Felder, ausgelegt nur in
[src/common/personal.ts](../src/common/personal.ts):

- **`kraftfahrer`** fehlt → **ja**. Vor dem Feld stand jede aktive Person in der
  Fahrerauswahl; ein fehlendes Feld darf niemanden herausnehmen. Neu angelegte
  Personen bekommen `true` ausdrücklich gesetzt.
- **`atemschutztraeger`** fehlt → **nein**. Ein Vorschlag in der
  Trupp-Auswahl sagt, dass die Person unter Atemschutz gehen darf; das setzt
  Ausbildung und Untersuchung voraus und muss ausdrücklich eingetragen sein.
  Nach dem Ausrollen sind deshalb zunächst keine Personen aus dem Personalstand
  in den Atemschutz-Vorschlägen — die Atemschutzträger sind einmal in der Liste
  anzuhaken.

Gefiltert wird nur die **Auswahl**, nicht die Eingabe: Fahrer und
Truppmitglieder bleiben frei eintippbar (Auswärtige, Fahrer ohne
Personendatensatz), und eine frei getippte Person, die nicht Kraftfahrer ist,
wird trotzdem mit ihrer ID verknüpft. Die Merkmale sind Bedienhilfe, keine
Berechtigung.

Der Fahrtenbuch-Link für Gäste bekommt `kraftfahrer` mit
(`toShareLinkPerson`), sonst nichts weiter vom Personaleintrag.

## Wer pflegt

Gruppen-Admin, Gerätemeister der Gruppe und Admin — dieselben wie zuvor im
Personen-Reiter des Fahrtenbuchs, geprüft von
`actionFahrtenbuchManagerRequired`. Die Rechte wurden mit dem Umzug nicht
ausgeweitet; insbesondere ordnet ein Bekleidungswart keine Benutzerkonten zu,
denn an `userIds` hängt das Änderungsrecht an Fahrten
(`entryPermissions.ts`).

Die Seite liegt unter `/personal` und nicht unter `/admin/…`, weil
`src/app/admin/layout.tsx` jede Seite darunter in den `AdminGuard` legt, der nur
globale Admins durchlässt.

Aktiv, Kraftfahrer und Atemschutzträger lassen sich direkt in der Liste
umschalten (`setPersonFlag`). Die Action nimmt nur diese drei Felder und nur
Wahrheitswerte an — sonst ließe sich über den Feldnamen auch `userIds` setzen,
an dem die Berechtigung hängt.

## Benutzerkonten und BlaulichtSMS-ID

Beides steht am Personaleintrag und wird im Personendialog gepflegt:

- **BlaulichtSMS-ID** (`blaulichtSmsRecipientId`) — von Hand oder über den
  CSV-Import der Teilnehmerliste. Über sie findet die Besatzung eines Einsatzes
  die Person zum Alarm-Empfänger.
- **Benutzerkonten** (`userIds`) — einzeln im Dialog oder für alle über
  „Bestehende Benutzer zuordnen". Die Auswahl im Dialog liefert
  `listPersonUserCandidates` mit demselben Zuschnitt wie der Vorschlag
  (Gerätemeister: Konten seiner Gruppe; Admin: alle). Gespeichert wird über
  `savePersonUserLinks`, das prüft, dass es die Konten gibt und keines schon
  einer anderen Person gehört — und nur, wenn sich die Liste geändert hat:
  sonst scheiterte ein Gerätemeister beim Ändern des Namens an einem Konto
  außerhalb seiner Gruppe, das ein Admin zugeordnet hat.

Hintergrund zur Zuordnung: [fahrtenbuch.md](fahrtenbuch.md), Abschnitt
„Personen den Benutzerkonten zuordnen".
