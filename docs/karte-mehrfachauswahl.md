# Mehrfachauswahl auf der Karte

Im Bearbeitungsmodus lassen sich mehrere Elemente markieren und gemeinsam
verschieben. Code unter [src/components/Map/selection/](../src/components/Map/selection/).
Bedienung für Benutzer: `content/docs/{de,en}/karte.md`, Abschnitt
„Mehrere Elemente auswählen und verschieben".

## Bausteine

| Datei | Aufgabe |
| --- | --- |
| `multiSelect.ts` | Reine Logik: Rahmen, Wählbarkeit, Verschiebung der Felder, Vorschau |
| `selectionStore.ts` | Zustand (Auswahl, Auswahlmodus, Vorschau) und Registrierungen der Ebenen |
| `MapSelectionContext.tsx` | Provider (in `MapEditorProvider`) und Hooks über `useSyncExternalStore` |
| `useMoveSelection.ts` | Verlaufsstand, ein Batch, ein Audit-Eintrag je Element |
| `MapMultiSelect.tsx` | Rahmen ziehen, Panel oben in der Mitte, Griff zum Verschieben |
| `useShapeSelection.ts` | Hervorhebung, Vorschau und Umschalt-Klick für Linien und Flächen |

## Warum ein eigener Store und nicht der Editor-Kontext

Die Auswahl ändert sich oft, die Vorschau einer Verschiebung im Takt der
Zeigerbewegung. Läge beides im `MapEditorContext`, renderte jede Änderung alle
Verbraucher des Kontexts neu — praktisch die ganze Karte. Der Store liefert
jedem Marker über einen Selektor nur „bin ich gewählt?" und „um wie viel bin ich
versetzt?"; nur betroffene Elemente rendern neu.

## Welche Elemente „auf der Karte" sind

React-Leaflet hält die Kinder eines ausgeblendeten Overlays gemountet; das
Mounten einer `FirecallItemsLayer` sagt also nichts. Deshalb meldet jede
`FirecallItemsLayer` ihre Elemente zusammen mit einer Prüfung
`map.hasLayer(layerContainer)` an. Das gilt auch für geclusterte Ebenen: Dort ist
der Container die `MarkerClusterGroup`, ein Element in einem Cluster zählt also
mit, wenn die Ebene eingeblendet ist.

Verschoben wird nur, was ausgewählt **und** gerade eingeblendet ist
(`movableItems`). Wer nach dem Auswählen eine Ebene ausblendet, verschiebt deren
Elemente nicht unsichtbar mit.

## Was mitgeht und was nicht

- Ausgewählt werden nur Elemente mit `editable !== false` und
  `draggable !== false`.
- Linien, Leitungen und Flächen sind gewählt, sobald **ein** Punkt im Rahmen
  liegt. Eine lange Leitung ganz einzurahmen hieße oft, weit hinauszuzoomen; wer
  sie nicht mit will, nimmt sie per Umschalt-Klick heraus.
- **Zeichnungen** gehen nicht mit: Ihre Striche liegen in der Untersammlung
  `stroke`, nicht am Element.
- **Wasserstände** gehen nicht mit: Beim Verschieben werden ihre Bänder aus dem
  Gelände neu berechnet (`wasserstandBasis`); eine reine Verschiebung ließe sie
  an der alten Stelle.
- Einsatzorte (`LocationsLayer`) sind keine Elemente unter `call/{id}/item` und
  nehmen nicht teil (`onDragEnd` am Marker).

## Verschieben

Bei Linien und Flächen ändern sich `positions` **und** `lat`/`lng`/`destLat`/
`destLng`: `getConnectionPositions` fällt ohne `positions` auf diese Felder
zurück, und `lat`/`lng` dienen Popups und Listen als Lage. Länge (`distance`)
und Fläche (`area`) ändern sich bei einer Verschiebung nicht und werden nicht
geschrieben. Straßenverlauf und Höhenprofil passen danach nicht mehr — für
Leitungen und Linien läuft deshalb `ensureConnectionDerived` (nicht abgewartet).

Reihenfolge: Vorschau setzen → `await saveHistory(...)` → ein `writeBatch` über
`commitBatchLocal` → je Element `logAuditChange` mit `previousValue`/`newValue`
der geänderten Felder. Der Verlaufsstand muss die Lage **vor** dem Verschieben
sichern, deshalb wird er abgewartet; die Vorschau hält die Elemente in der
Zwischenzeit schon am Ziel.

## Vorschau ohne Zurückspringen

Die Vorschau trägt je Element die Lage, von der die Verschiebung ausging
(`origins`). Sie gilt nur, solange das Element noch dort steht. Kommt der
Schreibvorgang im Firestore-Abo an, steht das Element am Ziel, und die Vorschau
fällt von selbst weg — es gibt keinen Zeitpunkt, an dem sie „genau richtig"
zurückgesetzt werden muss, und damit weder ein Zurückspringen noch eine doppelte
Verschiebung. Das gleiche Muster nutzt die Drehung am Marker (`pendingRotation`).

## Gesten

- **Desktop:** Umschalt + Ziehen zeichnet den Rahmen. Leaflets Box-Zoom liegt
  auf derselben Geste und ist im Bearbeitungsmodus abgeschaltet; außerhalb
  bleibt er.
- **Touch:** Es gibt keine Umschalttaste. Der Schalter „Mehrfachauswahl" im Panel
  schaltet das Verschieben der Karte ab (`map.dragging.disable()`); ein Zug
  zeichnet dann den Rahmen, Tippen auf ein Element wählt es aus oder ab. Ein
  zweiter Finger bricht den Rahmen ab, Zoomen mit zwei Fingern geht weiter.
- Erst ab 5 px Bewegung entsteht ein Rahmen; ein bloßer Klick bleibt ein Klick.
  Der Klick, den der Browser nach dem Loslassen auslöst, wird in der
  Capture-Phase verworfen, damit er weder die Auswahl leert noch ein Element
  darunter umschaltet.
- Klick ins Leere oder `Esc` hebt die Auswahl auf. Ein normaler Klick auf ein
  Element ändert die Mehrfachauswahl nicht (Popup und Drehgriff wie bisher).
- Beim Zeichnen (`DrawingCanvas`) ist die Mehrfachauswahl aus.

Verschoben wird durch Ziehen eines ausgewählten Markers oder des Griffs in der
Mitte der Auswahl. Der Griff ist nötig, weil eine Auswahl nur aus Linien und
Flächen sonst keinen Anfasser hätte: Das Ziehen eines Linienpunkts verschiebt
weiterhin nur diesen Punkt.
