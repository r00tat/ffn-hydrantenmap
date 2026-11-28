# Tastenkürzel

Tastenkürzel für die Arbeit am PC: Suche (`/`), Übersicht (`?`), neue Einträge in
Einsatztagebuch und Geschäftsbuch (`T`, `G`), Elemente auf der Karte (`M`, `F`, `O`,
`L`, `A`, `N`, `E`), Navigation (`Umschalt` + Buchstabe) und der Bug-Report
(`Alt+Umschalt+B`). Die Benutzerdoku steht in
[content/docs/de/tastenkuerzel.md](../content/docs/de/tastenkuerzel.md).

## Aufbau

| Teil | Ort |
| --- | --- |
| Katalog, Schreibweise, Abgleich, Konflikte (reine Logik) | [src/common/hotkeys.ts](../src/common/hotkeys.ts) |
| Listener, Speicherung, `useHotkey` | [src/components/hotkeys/HotkeyProvider.tsx](../src/components/hotkeys/HotkeyProvider.tsx) |
| Suche, Hilfe, Navigation, Dokument-Dialoge | [src/components/hotkeys/GlobalHotkeys.tsx](../src/components/hotkeys/GlobalHotkeys.tsx) |
| Reihung der Suche (reine Logik) | [src/common/hotkeySearch.ts](../src/common/hotkeySearch.ts) |
| Ziele der Navigation | [src/common/hotkeyNavigation.ts](../src/common/hotkeyNavigation.ts) |
| Kürzel der Karte | [AddFirecallItem.tsx](../src/components/Map/AddFirecallItem.tsx), [MapActionButtons.tsx](../src/components/Map/MapActionButtons.tsx) |
| Einstellungsseite `/tastenkuerzel` | [src/components/hotkeys/HotkeySettings.tsx](../src/components/hotkeys/HotkeySettings.tsx) |

Eine neue Aktion braucht einen Eintrag in `HOTKEY_ACTIONS`, ihren Text unter
`hotkeys.actions.<id>` in beiden Sprachen und einen `useHotkey(id, handler)` dort,
wo die Funktion lebt. Einstellungsseite und Hilfe listen sie dann von selbst.

## Warum je Gerät und nicht am Benutzer

Die Belegung liegt im `localStorage` (`einsatzkarte.hotkeys.v1`), nicht im
Benutzerdokument. Tastaturen und Gewohnheiten hängen am Gerät: Der PC im
Einsatzleitfahrzeug hat ein anderes Layout als der eigene Mac, und auf einem
Tablet ohne Tastatur stören Kürzel nur. Bei der Feuerwehr teilen sich außerdem
oft mehrere Geräte ein Google-Konto — eine Einstellung am Benutzer gälte für
alle zugleich. Der Preis: Wer das Gerät wechselt, stellt neu ein.

## Ein Listener in der Capture-Phase

Der Provider hängt **einen** `keydown`-Listener an `window`, und zwar in der
Capture-Phase. So sieht er den Tastendruck, bevor Leaflet, MUI oder ein
Eingabefeld ihn verarbeitet oder mit `stopPropagation` schluckt. Ein Kürzel, das
gegriffen hat, wird mit `preventDefault` und `stopPropagation` beendet — `/`
landet dann nicht zusätzlich in der Schnellsuche des Browsers (Firefox).

## Wann einfache Tasten ruhen

Ein Kürzel ohne Modifikator (`M`, `/`, `?`) feuert nicht,

- solange der Fokus in einem Eingabefeld steht (`input`, `textarea`, `select`,
  `contenteditable`) — sonst ließe sich kein „M" tippen;
- solange ein MUI-Modal offen ist (`.MuiModal-root:not(.MuiModal-hidden)`) oder
  ein Element `data-hotkeys-block="true"` trägt — ein Dialog hat Vorrang vor der
  Seite dahinter.

Aktionen mit `allowInInputs` bzw. `whileDialogOpen` sind davon ausgenommen. Das
gilt für den Bug-Report: Er liegt deshalb auf `Alt+Umschalt+B`, damit er auch aus
einem Formular heraus geht, ohne ein Zeichen zu verschlucken.

## Alt auf dem Mac: die physische Taste

Mit Alt (Option) liefert macOS in `event.key` ein anderes Zeichen — `Option+B`
ergibt `∫`. Sobald Alt, Strg oder Meta gedrückt sind, gilt deshalb bei
Buchstaben und Ziffern die physische Taste aus `event.code` (`KeyB`). Ohne
Modifikator zählt dagegen `event.key`, damit auf einer deutschen Tastatur `Z`
auch das Z ist und nicht die Taste, die auf US-Layout Z heißt.

## Satzzeichen ignorieren Umschalt

`/` ist auf der deutschen Tastatur `Umschalt+7`, auf der US-Tastatur eine eigene
Taste; `?` ist mal `Umschalt+ß`, mal `Umschalt+/`. Für Satzzeichen vergleicht der
Abgleich deshalb nur das erzeugte Zeichen und nicht den Umschalt-Zustand. Bei
Buchstaben zählt Umschalt, sonst wären `T` (neuer Eintrag) und `Umschalt+T`
(zum Tagebuch) dasselbe.

## Der zuletzt angemeldete Handler gewinnt

Je Aktion kann es mehrere Handler geben; ausgeführt wird der zuletzt
angemeldete. Gibt er `false` zurück, kommt der davor dran. So gilt `T` überall
als „neuer Tagebucheintrag" über einen globalen Dialog, auf der Tagebuchseite
aber öffnet die Seite ihren eigenen — sie meldet sich später an als
`GlobalHotkeys`. Kürzel der Karte melden sich nur an, solange die Karte gemountet
ist und der Benutzer schreiben darf (`useMapEditorCanEdit`); sonst bleibt die
Taste frei.

Ändert sich die Bedingung eines globalen Handlers (`enabled`), meldet er sich neu
an und steht dann hinter dem der Seite. Für `T` und `G` ist das unschädlich: Beide
Dialoge speichern über denselben Weg.

## Neue Einträge in Tagebuch und Geschäftsbuch

Seiten, Karten-Seitenleiste und Kürzel öffnen denselben Dialog
(`useDocumentEntryDialog` in
[src/components/pages/useDocumentEntryDialog.tsx](../src/components/pages/useDocumentEntryDialog.tsx)),
damit Nummerierung und Speichern nicht an mehreren Stellen auseinanderlaufen.
Der globale Dialog öffnet erst, wenn die Einträge geladen sind (`loading` aus
`useDiaries` bzw. `useGeschaeftsbuchEintraege`): Der Elementdialog übernimmt die
Nummer beim Öffnen, und aus einem noch leeren Zähler würde `1`.

## Marker ohne Dialog

`M` setzt einen Marker ohne den Typdialog: Er hängt an der Maus
(derselbe Mechanismus `fzgDrawing` wie nach dem Dialog), fällt beim Klick und
wird über `saveItem` gespeichert. Escape bricht das Setzen ab — das gilt jetzt
auch für Elemente, die nach dem Dialog an der Maus hängen. Name wie im Dialog
(„Marker 4", gezählt über den Einsatz) und die zuletzt gewählte Ebene. Wer schnell
markieren will, will keinen Dialog; Name und Symbol lassen sich danach wie bei
jedem Element ändern. Auf Touch-Geräten gibt es keine Maus, dort fällt der Marker
gleich an der Vorgabeposition — wie beim Dialogweg.

`F`, `O`, `L` und `A` öffnen dagegen den Dialog mit vorgewähltem Typ: Fahrzeug und
Einsatzort brauchen Angaben, Leitung und Fläche gehen danach ins Zeichnen über.
Ist der Bearbeitungsmodus aus, schalten die Kürzel ihn ein.

## Suche

Die Reihung ist eine reine Funktion (`rankSearchEntries`): alle Suchbegriffe
müssen vorkommen; ein Wortanfang im Titel zählt mehr als ein Treffer mitten im
Titel, der wiederum mehr als einer in Beschreibung oder Untertitel. Umlaute und
„ß" werden vereinheitlicht. Ohne Suchbegriff zeigt die Liste nur die Seiten.

Die Auswahl wechselt zur Zielseite und hinterlegt den Auftrag in einem kleinen
Speicher ([pendingRequest.ts](../src/components/hotkeys/pendingRequest.ts)), den
die Seite beim Mount abholt — die Karte zoomt aufs Element und wählt es aus, die
Tagebuch- bzw. Geschäftsbuchseite scrollt zur Zeile und hebt sie kurz hervor.
**Nicht** über `?highlight=` in der Adresse: Die Einsatzseiten wechseln per
`pushState` ohne Router, und eine Query schlösse diesen Weg aus
(`canNavigateInPlace`). Eine frisch gemountete Karte richtet ihren Ausschnitt
noch einmal auf alle Elemente aus (`FitBoundsToItems`); der Fokus wird deshalb
kurz danach nachgezogen.

Die Adresssuche der Karte (`SearchButton`) bleibt eigenständig.
