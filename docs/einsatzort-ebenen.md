# Ebene je Einsatzort

Wer auf der Seite **Einsatzorte** den Schalter **Ebene je Einsatzort** einschaltet,
bekommt für jeden Einsatzort eine eigene Ebene. Fahrzeuge und taktische Einheiten,
die einem Einsatzort zugeordnet werden, landen in dieser Ebene, und der Marker des
Einsatzorts liegt mit drin. So lässt sich ein Einsatzort samt seinen Kräften auf der
Karte gemeinsam ein- und ausblenden.

Der Code: Logik ohne Firestore in
[locationLayers.ts](../src/components/Einsatzorte/locationLayers.ts), das Schreiben
in [useLocationLayers.ts](../src/hooks/useLocationLayers.ts).

## Warum ein Schalter je Einsatz und standardmäßig aus

Bei einem großen Einsatz, etwa nach einem Unwetter mit 30 Einsatzorten aus dem
E-Mail-Import, stünden sonst 30 Ebenen auf der Ebenen-Seite und im Layer-Control der
Karte. Bei solchen Einsätzen ist oft eine andere Gruppierung besser, z. B. nach
Abschnitt. Ob sich eine Ebene je Einsatzort lohnt, entscheidet deshalb der Einsatz.
Der Schalter liegt als `locationLayers` am Einsatzdokument und gilt damit für alle
Geräte. Fehlt das Feld, ist er aus.

## Wann die Ebene entsteht

Die Ebene entsteht erst bei der **ersten Zuordnung**, nicht beim Anlegen des
Einsatzorts. Ein Einsatzort ohne Kräfte bekommt also keine leere Ebene, und ein
Import vieler Einsatzorte erzeugt keine Ebenen auf Vorrat. Die ID steht am Einsatzort
in `layer`, der Name der Ebene ist der Anzeigename des Einsatzorts.

Wer den Schalter **einschaltet**, zieht den Bestand nach: Jeder Einsatzort mit
Zuordnungen bekommt seine Ebene, und die zugeordneten Elemente wandern hinein.
**Versetzt** wird dabei nichts, die Kräfte stehen schon, wo sie stehen.

Zwei Zuordnungen kurz hintereinander zum selben Einsatzort dürfen keine zweite Ebene
anlegen. Die erste Ebene ist zu diesem Zeitpunkt aber weder am Einsatzort noch in
der Liste der Ebenen angekommen. Deshalb merkt sich der Hook die gerade angelegte
Ebene je Einsatzort (`resolveLocationLayer`). Wurde die Ebene des Einsatzorts
gelöscht, legt die nächste Zuordnung eine neue an.

## Zuordnen und Abziehen

- **Zuordnen** (Seite „Einsatzorte“, Dialog des Einsatzorts, Stärketabelle unter
  „Einsatzmittel“): Das Element wird auf die Koordinaten des Einsatzorts gesetzt.
  Das passiert auch bei ausgeschaltetem Schalter. Ist der Schalter an, landet das
  Element zusätzlich in der Ebene des Einsatzorts.
- **Abziehen** ohne neuen Einsatzort: Das Element fällt zurück auf die
  Standard-Ebene „Einsatz“, aber **nur**, wenn es noch in der Ebene dieses
  Einsatzorts liegt. Wer es von Hand in eine andere Ebene gezogen hat, wollte es
  dort haben.

## Warum Ausschalten keine Ebenen löscht

Eine Ebene zu löschen löscht ihre Elemente mit (siehe
[audit-log-und-wiederherstellen.md](audit-log-und-wiederherstellen.md),
`deletedWithLayer`). Beim Ausschalten bleiben die Ebenen deshalb stehen; nur neue
Zuordnungen legen nichts mehr in Ebenen. Wer sie nicht mehr braucht, löscht sie
gezielt auf der Ebenen-Seite, nachdem er die Elemente verschoben hat.

## Karte

`LocationsLayer` zeigt mit `layerId` nur die Einsatzorte dieser Ebene und wird im
Overlay der Ebene eingehängt (`FirecallLayer.tsx`). Das Overlay „Einsatzorte“ zeigt
alle übrigen, auch die, deren Ebene gelöscht wurde. So verschwindet kein Einsatzort
von der Karte (`locationsForLayer`). Der Bearbeiten-Dialog wird erst beim Öffnen
eingehängt, weil es die Schicht einmal je Ebene gibt.

## Bekannte Lücken

- Wird ein Einsatzort umbenannt, behält seine Ebene den alten Namen.
- Ein Element, das auf der Seite „Einsatzorte“ an mehreren Einsatzorten steht,
  liegt in der Ebene des zuletzt zugeordneten.
