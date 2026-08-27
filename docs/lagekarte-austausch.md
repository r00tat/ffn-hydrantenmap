# Datenaustausch mit lagekarte.info

Ein Einsatz kann als Lagekarte-Datei exportiert und eine in
[lagekarte.info](https://www.lagekarte.info) gezeichnete Lage als Ebenen in den
offenen Einsatz importiert werden. Der Export sitzt neben dem Einsatz-Export
(`LagekarteExport`), der Import im bestehenden Ebenen-Import (`LayerImport`).

Die Konverter liegen in [src/common/lagekarte/](../src/common/lagekarte/) und sind
frei von React, Leaflet und Firebase. Sie arbeiten auf dem **Rohdokument** eines
Items und nicht über `getItemInstance()` — sonst bräuchten die Tests jsdom und
eine Kette von Leaflet-Mocks.

Dieses Dokument hält fest, was sich aus dem Code nicht ableiten lässt.

## Warum das Format sample-getrieben ist

lagekarte.info ist **closed source** und veröffentlicht keine
Formatspezifikation. Alles, was `types.ts` beschreibt, ist aus zwei echten
Exporten abgelesen. Daraus folgt die Grundhaltung: **tolerant lesen,
konservativ schreiben** — nur Felder schreiben, die in einem Sample belegt sind.

Der Referenz-Export liegt als Fixture unter
[src/common/lagekarte/fixtures/lagekarte-export.json](../src/common/lagekarte/fixtures/lagekarte-export.json)
und ist die Grundlage von `roundtrip.test.ts`. Er liegt bewusst dort und nicht in
`captures/`: dieses Verzeichnis ist gitignored, der Test würde sonst nur auf
einem einzelnen Rechner laufen.

Der zweite Referenz-Export war byteweise identisch bis auf `messages` (dort
leer). Was er zusätzlich geprüft hätte, deckt `fromLagekarte.test.ts` ab; er ist
deshalb nicht mitgekommen.

**Wer das Format erweitert, legt zuerst ein neues Sample dazu.** Ein Feld, das in
keinem Export vorkommt, ist eine Vermutung.

## Warum der GeoJSON-Export von lagekarte nicht taugt

lagekarte.info kann auch GeoJSON exportieren. Diese Datei ist für den Import
**unbrauchbar**: die Features sind flach und ihre `properties` ausnahmslos leer —
kein Icon, kein Typ, keine Farbe, keine Gruppe, kein Radius. Nur der native
`.json`-Export ist verlustarm. `detectFormat` erkennt deshalb an `groups` plus
benannten Untergruppen, und nicht bloß an `type: 'FeatureCollection'`.

## Die Kupplungsmarker-Regel

Vor jeder Schlauchleitung steht in der Datei eine **namenlose
Punkt-FeatureCollection** mit `properties: { options: {} }`, deren Punkte selbst
leere `properties` haben. Das ist abgeleitete Geometrie: lagekarte erzeugt die
Kupplungsmarker aus `options.distanceMarkers` und `options.offset` (20 m bei
B-Line, 15 m bei C-Line) und schreibt sie zusätzlich als Sammlung heraus.

Beim Import werden diese Sammlungen übersprungen (`isCouplingCollection`), beim
Export erzeugt (`buildCouplingCollection`). **Ohne diese Regel entstehen aus
einer Leitung zusätzlich sinnlose Einzelmarker** — bei einer langen
Zubringleitung dutzende.

## Der `ffnd`-Block

`properties.ffnd = { v: 1, item, strokes? }` trägt das vollständige Item für den
verlustfreien Rückweg: Löschwasserförderung, Pendelverkehr, Dammbau,
Wasserstandsmodell, Höhenprofile, `fieldData`. lagekarte ignoriert unbekannte
Properties, die Datei bleibt dort also benutzbar.

Beim Import gewinnt der `ffnd`-Block gegen die Geometrie-Rückführung. Identität
und Herkunft fallen dabei weg (`id`, `layer`, `created`, `creator`, `updatedAt`,
`updatedBy`, `source`, `mcpClientId`, `mcpClientName`) — ein mitgeschlepptes
`source: 'mcp'` würde eine falsche Herkunft behaupten.

Zusätzlich stehen die Kennzahlen lesbar in `infoData.informationen`
(`readableExtras`), damit auch ein lagekarte-Nutzer **ohne unsere App** sieht,
was gerechnet wurde. Dort stehen nur **gespeicherte** Felder: der Sandsackbedarf
etwa hängt nicht am Item, sondern wird aus Höhe, Bauweise und Sackformat
gerechnet — deshalb nennt der Text die Planungsvorgaben und nicht das Ergebnis.

## Herkunft und Unvollständigkeit des Symbolkatalogs

Der Symbolkatalog von lagekarte.info steckt in `https://www.lagekarte.info/main.js`
als Arrays der Form `["<id>", "<datei>.svg", "<Bezeichnung>"]`, gruppiert nach
Ordner (`oenorm`, `oebfv`, `geraete`, `fahrzeuge`, `babs`, `oerk`, `jonask`, …).
Eine Extraktion liefert rund 1856 Einträge.

Diese Extraktion ist **nachweislich unvollständig**:
`oenorm/4.2.1_atemschutzsammelplatz.svg` fehlt darin, wird aber im Sample
verwendet und liefert HTTP 200. `iconMap.ts` ist deshalb eine **kuratierte,
per HTTP verifizierte** Tabelle und kein generierter Katalog.

Neue Einträge vor dem Eintragen prüfen — ein Redirect (302) heißt „gibt es
nicht":

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://www.lagekarte.info/src/img/<ordner>/<datei>.svg"
```

Zwei Fallen aus der Praxis:

- `oenorm/9.8 _gefahr_ueberflutung.svg` hat wirklich ein **Leerzeichen** vor dem
  Unterstrich.
- Fahrzeuge liegen in **zwei** Ordnern: `oebfv` unter der Nummer 5.01 und
  `fahrzeuge` (Drehleiter & Co.). `lagekarteIconToItem` muss beide auf `vehicle`
  zurückführen, sonst wird aus einer Drehleiter beim Import ein anonymer Marker.

## Warum `exact` und `approx`

`IconTarget.exact` steuert **ausschließlich die Rückrichtung**. Der Export
schreibt immer das bestmögliche Symbol; nur `exact: true` geht in die
Reverse-Tabelle ein.

Nötig ist das aus zwei Gründen:

1. **Lücken in der ÖNORM.** Die Formationsreihe endet bei der Kompanie (2.1.4),
   unsere Hierarchie geht bis ÖBFV. `Abschnitt`, `Bezirk`, `LFV` und `ÖBFV`
   bekommen daher das Grundzeichen 2.1 als Näherung. Ginge das in die
   Rückrichtung ein, würde aus einem importierten Grundzeichen willkürlich ein
   „Bezirk". Die genaue Bezeichnung steht in `infoData.bezeichnung`.
2. **Kollisionen.** `Befehls_Führungs_Leitstelle` (ein `zeichen`) und `el` (ein
   Typ) zeigen auf dasselbe Symbol; ebenso `Verseuchung` und
   `Strahlung_oder_radioaktive_Kontamination`. Der jeweils spezifischere Eintrag
   ist `exact`, der andere nicht — so bleibt die Rückführung eindeutig.

Ein Symbol, das die Tabelle nicht kennt, wird beim Import ein `marker` mit
absoluter `iconUrl` auf lagekarte.info. Die SVGs werden bewusst **nicht** ins
Repository gespiegelt.

## Warum keine vierte Untergruppe

Beide Samples haben genau drei Untergruppen: `zeichnungen`, `fahrzeuge`,
`taktischezeichen`. Ob lagekarte eine vierte, eigens benannte Gruppe liest, ist
closed source nicht prüfbar.

Die statischen GIS-Daten (Hydranten, Risiko- und Gefahrobjekte, Löschteiche,
Saugstellen) gehen deshalb nach `taktischezeichen` — dort stehen im Sample auch
die von Hand gesetzten Geräte-Symbole wie `geraete/ueberflurhydrant.svg`.
Getrennt schaltbar bleiben sie über einen eigenen `groups[]`-Eintrag „GIS-Daten"
in ihrer `options.g`.

## Weitere bewusste Festlegungen

- **Genau ein `history`-Eintrag.** lagekarte schreibt selbst einen Snapshot mit
  dem aktuellen Stand. Unsere History-Snapshots mitzuexportieren würde die Datei
  vervielfachen, weil jeder Snapshot eine vollständige Item-Kopie ist.
- **`colors` und `wmslayers` bleiben leer.** Ihr Schema ist in keinem Sample
  belegt.
- **Der Ausschnitt der GIS-Daten** ist die Bounding-Box aller Einsatz-Elemente
  plus 300 m (`boundingBoxWithMargin`). Ein fixer Radius um die Einsatzmitte
  würde bei einer langen Zubringleitung die Hydranten am anderen Ende verlieren.
- **Der Radius muss die BBox trotzdem umschließen** (`boundingBoxRadiusM`).
  `getClusters` holt die Geohash-Cluster **nach Radius** und filtert die BBox
  erst danach (`geoFilterFactory`). Ein zu kleiner Radius lädt die Cluster am
  Rand nie — die Hydranten dort fehlen dann still, ohne Fehlermeldung.
  `exportGeoJson` klemmt auf 200 m bis 10 km; eine Lage, die weiter reicht als
  10 km, bekommt am Rand keine GIS-Daten.
- **`boundingBoxWithMargin` liegt in `common/lagekarte/bbox.ts`**, nicht in der
  Server Action: eine Datei mit `'use server'` darf ausschließlich async
  Funktionen exportieren.
- **Ein Ausfall der GIS-Daten bricht den Export nicht ab.** `loadLagekarteGis`
  gibt im Fehlerfall `undefined` zurück, der Export entsteht dann ohne
  GIS-Gruppe, und der Nutzer bekommt eine Warnung.
- **Der Export nutzt nicht `exportFirecall`** aus `useExport.ts`: das lädt alle
  Anhänge als Base64 herunter, was für die Lagekarte-Datei nichts beiträgt und
  den Export deutlich verlangsamt. Stattdessen `loadLagekarteSource`.
- **Tagebucheinträge bekommen beim Import keine Ebene.** Sie stehen im
  Einsatztagebuch, nicht auf der Karte — in einer ausgeschalteten Ebene wären sie
  unsichtbar.

## Abgrenzung zu `/api/geojson`

Der bestehende token-gesicherte Endpoint
[src/app/api/geojson/route.ts](../src/app/api/geojson/route.ts) liefert die
statischen GIS-Daten weiterhin als **Live-Overlay** für lagekarte.info. Der
Dateiaustausch hier ist davon unabhängig und betrifft die **Einsatz-Lage**. Beide
Wege bleiben bestehen.
