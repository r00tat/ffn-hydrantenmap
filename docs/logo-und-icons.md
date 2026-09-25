# Logo, App-Icons und Farbthema

Das Logo „Faltkarte & Feuerwehr-Fokus“ zeigt eine Faltkarte mit Höhenlinien und
Straßenraster, davor gekreuzte Äxte, Helm, Flamme und Schild. Hauptfarbe ist
Blau `#1976d2`, Akzent Rot `#d32f2f`.

## Quellen und Erzeugung

Quellen sind die beiden Entwürfe in [docs/design/](design/):

- `logo.jpeg`: das farbige Motiv auf Weiß (Web, PWA, Login-Seite)
- `launcher.jpeg`: das weiße Motiv auf blauer Kachel (Android, Kopfleiste)

`npm run icons` ([scripts/buildIcons.mts](../scripts/buildIcons.mts)) erzeugt daraus
mit `sharp` alle Icons. Die Ergebnisse sind eingecheckt, das Skript läuft also nicht
im Build, sondern nur, wenn sich ein Entwurf ändert.

**Warum die JPEGs und keine nachgezeichnete SVG-Datei:** Eine handgezeichnete
Vektorfassung war ein Versuch und wirkte gegenüber dem Entwurf klobig (Axtköpfe,
Helm, Linienstärken). Die Entwürfe haben 2048 px. Das größte Motiv (Splash
xxxhdpi) ist rund 800 px breit, es wird also immer verkleinert und nie vergrößert.

**Freistellen mit weichen Kanten:** Jedes Pixel wird als Mischung aus Hintergrund
und einer Tinte gelesen (Blau oder Rot auf Weiß, Weiß auf der blauen Kachel). Der
Tintenanteil wird zur Deckkraft. Ein harter Schwellwert würde die Kantenglättung
des Entwurfs zerstören, und bloßes Wegschneiden des Weiß ließe einen hellen Saum,
der auf dunklem Grund auffällt. Rauschen der JPEG-Kompression unter 6 % Anteil
zählt als Hintergrund. Blaue Pixel werden auf exakt `#1976d2` gesetzt: Das Blau
im JPEG ist durch die Kompression leicht verschoben (`#2275c5`). Rote Pixel
behalten ihren Ton, damit die zweifarbige Schattierung des Schilds erhalten bleibt.

Erzeugt werden:

- `public/brand/logo.png`, `logo-weiss.png`: freigestellte Vorlagen (1024 px) für
  Login-Seite und Kopfleiste. `next/image` skaliert sie.
- `icon-192/512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`: auf Weiß.
  Beim maskable Icon bleibt das Motiv im inneren Kreis mit 40 % Radius.
- `favicon.ico` (16/32/48) auf einer weißen, abgerundeten Kachel. Helm und Lücken
  sind im Entwurf weiß und würden freigestellt in einer dunklen Tableiste
  verschwinden.
- Android: Launcher-, Round- und Adaptive-Vordergrund sowie alle Splash-Größen.
- `drawable-*/ic_stat_einsatzkarte.png`: das Benachrichtigungs-Icon (24 dp),
  weißes Motiv auf transparent. Android wertet bei einem Small Icon nur den
  Alphakanal aus. Ein eigenes Icon ist nötig, denn der Adaptive-Vordergrund
  liegt als Mipmap vor und wäre in der Statusleiste nur ein weißer Fleck.
  Verwendet wird es von der Radiacode-Benachrichtigung
  (`RadiacodeForegroundService`).
- `docs/design/vorschau-icons.png`: ein Übersichtsblatt der erzeugten Icons zur
  Durchsicht. Es entsteht im selben Lauf, damit man nie ein veraltetes Blatt
  begutachtet.

Die Kachel in `launcher.jpeg` hat abgerundete Ecken. Das Skript schneidet deshalb
nur einen festen Ausschnitt innerhalb der Kachel aus (`region` in `whiteArtwork()`).
Der Ausschnitt lässt rund 40 px Rand um das gemessene Motiv. Ein zu knapper
Ausschnitt schneidet die Unterkante der Karte ab, und das fällt erst auf dem
blauen Icon auf. Wer den Entwurf mit anderer Aufteilung ersetzt, muss diesen
Ausschnitt nachziehen.

## Android und Web unterscheidbar

Auf manchen Geräten sind Android-App und installierte PWA beide auf dem Homescreen,
und die Namen sind dort fast gleich. Deshalb sind die Farben vertauscht:

| | Hintergrund | Motiv |
| --- | --- | --- |
| Android-App | Blau `#1976d2` | Weiß |
| Web/PWA | Weiß | Blau/Rot |

Der Vordergrund des Adaptive Icons bringt den Rand der Safe-Zone selbst mit (Motiv
auf 54 % der 108-dp-Fläche). In `mipmap-anydpi-v26/ic_launcher*.xml` steht deshalb
kein `inset` mehr, sonst würde das Motiv doppelt verkleinert. Der Hintergrund ist
die Farbe `@color/ic_launcher_background` und kein PNG.

## Dev hat eigene Icons

In dev (`NEXT_PUBLIC_FIRESTORE_DB` gesetzt, siehe `src/common/appEnvironment.ts`)
liefern Manifest und `metadata.icons` die Serie unter `/brand/dev/` mit DEV-Band.
Das ergänzt das Namenspräfix „🚧 DEV“, denn das Homescreen-Label schneidet ab. Die
Android-App zeigt immer auf prod und hat keine Dev-Variante.

Push-Benachrichtigungen verwenden immer `/brand/icon-192.png`. Der Service Worker
unterscheidet die Umgebung nicht, und die Benachrichtigung trägt ohnehin einen Titel.

## Rot ist kein `secondary`

`appTheme` ([src/components/providers/theme.ts](../src/components/providers/theme.ts))
setzt `secondary` bewusst auf Blaugrau `#455a64`, nicht auf das Rot des Logos. Rot
ist in der Oberfläche `error`: Warnungen der Atemschutzüberwachung, Löschen,
Fehlermeldungen.

Wäre `secondary` rot, sähen gewöhnliche Aktionen wie Warnungen aus (Registrieren im
Login, „Zurück zu live“ im Verlauf). `seriesColor()` im Fahrtenbuch hätte zwei gleiche
Reihenfarben, und die korrigierte Linie im Dosisleistungs-Nomogramm läse man als
Grenzwert. Das Rot erscheint als Markenakzent `BRAND_ACCENT` nur im Logo und in der
roten Unterkante der Kopfleiste. `theme.test.ts` hält fest, dass `secondary` nicht
`error` ist.
