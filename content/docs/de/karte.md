# Karte

Die Karte zeigt Hydranten und andere wichtige Punkte im Einsatzgebiet an. Du kannst die Karte verschieben, zoomen und verschiedene Layer aktivieren. Im Bearbeitungsmodus kannst du Elemente auf der Karte platzieren und Zeichenwerkzeuge verwenden.

![Kartenansicht](/docs-assets/screenshots/karte.png)

## Funktionen

- **Hydranten anzeigen und Details abrufen** Klicke auf einen Marker, um Informationen wie Typ, Durchfluss und Standort zu sehen
- **Karte verschieben und zoomen** Per Touch-Gesten auf Mobilgeräten oder Mausrad und Drag am Desktop
- **Verschiedene Basiskarten** Orthofoto, Basemap, Basemap grau, OpenStreetMap, OpenTopoMap
- **Overlay-Layer** Einsatzorte, Entfernung, Umkreis, Position, Stromausfälle, Pegelstände, Wetterstationen, Adressen
- **WMS-Layer** Hochwasser, Risikogebiete, Überflutungsgebiete (bereitgestellt vom Land Burgenland)
- **Luftraum Austro Control** Kontrollzonen, Flugbeschränkungs- und Gefahrengebiete, Modellflugplätze und Nationalparks – **nicht** die verbindlichen UAS-Geozonen
- **Eigene Kartenebenen** Selbst angelegte WMS- und Kachel-Dienste je Einsatz, im Layer-Control unter „Karte: …" (siehe [Ebenen](/docs/ebenen))
- **Standort suchen** Adresse oder Ort eingeben und auf der Karte anzeigen lassen
- **Bearbeitungsmodus mit Zeichenwerkzeugen** Elemente auf der Karte platzieren, Linien und Flächen zeichnen
- **Elemente auf der Karte platzieren** Fahrzeuge, Marker, Linien und Flächen für den aktiven Einsatz hinzufügen

## Anleitung

### Hydranten anzeigen

Hydranten werden als farbige Marker auf der Karte dargestellt. Je nach Zoomstufe werden nahe beieinanderliegende Hydranten zu Clustern zusammengefasst. Beim Heranzoomen lösen sich die Cluster in einzelne Marker auf.

1. Öffne die Karte über das Menü oder die Startseite
2. Hydranten werden automatisch als farbige Marker auf der Karte angezeigt
3. Zoome in den gewünschten Bereich, um einzelne Hydranten zu sehen
4. Klicke auf einen Hydranten-Marker, um ein Popup mit Details wie Typ, Durchfluss und genauer Position zu öffnen

### Basiskarte und Layer wechseln

Die Karte unterstützt verschiedene Basiskarten und zusätzliche Overlay-Layer, die du nach Bedarf ein- und ausschalten kannst.

1. Klicke auf das Layer-Symbol rechts oben auf der Karte
2. Wähle unter "Basiskarte" die gewünschte Kartenansicht aus:
   - **Orthofoto** – Satellitenbilder
   - **Basemap** – Standard-Kartendarstellung
   - **Basemap grau** – Dezente, graue Kartendarstellung
   - **OpenStreetMap** – Community-Karte mit vielen Details
   - **OpenTopoMap** – Topografische Karte mit Höhenlinien
3. Aktiviere oder deaktiviere Overlays, indem du die Checkboxen setzt:
   - **Einsatzorte** – Markierungen vergangener und aktiver Einsätze
   - **Entfernung** – Zeigt Entfernungslinien zwischen Punkten
   - **Umkreis** – Kreisdarstellung um einen gewählten Punkt
   - **Position** – Dein aktueller GPS-Standort
   - **Stromausfälle** – Aktuelle Stromausfallgebiete
   - **Pegelstände** – Wasserstände an Messstellen
   - **Wetterstationen** – Wetterdaten in der Umgebung
   - **Adressen** – Adresspunkte auf der Karte
4. Die Auswahl wird gespeichert und beim nächsten Öffnen wiederhergestellt

:::info
Die WMS-Layer (Hochwasser, Risikogebiete, Überflutungsgebiete) werden vom Land Burgenland bereitgestellt und zeigen aktuelle Geodaten.
:::

:::warning
Das Overlay **Luftraum Austro Control (keine UAS-Geozonen)** zeigt Lufträume aus den frei verfügbaren Luftfahrtdaten von Austro Control: Kontrollzonen (CTR, MCTR, MATZ), Flugbeschränkungs- und Gefahrengebiete (R, D), zeitweise reservierte Lufträume (TRA), Modellflugplätze und Nationalparks. Das sind **nicht** die verbindlichen UAS-Geozonen für Drohnenflüge – Höhen, Zeiten und einzelne Zonen können abweichen. Vor einem Drohnenflug prüfst du die Geozonen immer in der offiziellen Karte von Dronespace: [utm.dronespace.at/avm](https://utm.dronespace.at/avm/).
:::

### Standort suchen

Mit der Suchfunktion kannst du schnell zu einer bestimmten Adresse oder einem Ort auf der Karte navigieren.

1. Klicke auf das Suchfeld bzw. das Lupen-Symbol auf der Karte
2. Gib eine Adresse, einen Ortsnamen oder eine Bezeichnung ein
3. Wähle ein Ergebnis aus der Vorschlagsliste aus
4. Die Karte zoomt automatisch auf den gefundenen Standort und zeigt einen Marker an

### Bearbeitungsmodus verwenden

Im Bearbeitungsmodus kannst du Elemente zum aktiven Einsatz auf der Karte hinzufügen, verschieben und bearbeiten.

1. Klicke auf das Stift-Symbol in der Werkzeugleiste, um den Bearbeitungsmodus zu aktivieren
2. Klicke auf den Plus-Button, um ein neues Element hinzuzufügen
3. Wähle den gewünschten Element-Typ aus (z.B. Fahrzeug, Marker, Linie, Fläche)
4. Platziere das Element auf der Karte durch Klicken auf die gewünschte Position
5. Bestehende Elemente kannst du durch Anklicken auswählen und bearbeiten oder verschieben

:::info
Aktiviere den Bearbeitungsmodus nur, wenn du Änderungen vornehmen möchtest. Im Ansichtsmodus kannst du die Karte schneller bedienen.
:::

### Mehrere Elemente auswählen und verschieben

Im Bearbeitungsmodus kannst du mehrere Elemente auf einmal markieren und gemeinsam verschieben.

1. **Rahmen ziehen:** Halte die **Umschalttaste** gedrückt und ziehe mit der Maus einen Rahmen über die Karte. Alle Elemente im Rahmen werden ausgewählt — eine Linie oder Fläche, sobald einer ihrer Punkte im Rahmen liegt
2. **Einzeln ergänzen:** Umschalt + Klick auf ein Element nimmt es in die Auswahl auf oder wieder heraus
3. **Auf dem Tablet oder Handy:** Tippe oben in der Mitte der Karte auf das Symbol **Mehrfachauswahl**. Solange es aktiv ist, zieht ein Wischen einen Rahmen statt die Karte zu verschieben, und Tippen auf ein Element wählt es aus oder ab. Zoomen mit zwei Fingern geht weiterhin
4. Ausgewählte Elemente sind blau gestrichelt umrandet, oben steht die Anzahl
5. **Verschieben:** Ziehe eines der ausgewählten Elemente oder den runden blauen Griff mit dem Pfeilkreuz in der Mitte der Auswahl. Alle ausgewählten Elemente wandern um dieselbe Strecke mit, Linien und Flächen als Ganzes
6. **Auswahl aufheben:** Klick ins Leere auf der Karte, die **Esc**-Taste oder das Kreuz an der Anzahl

:::info
Vor dem Verschieben wird automatisch ein Verlaufsstand gespeichert. Über den Verlauf kannst du die alte Lage wiederherstellen. Nur Elemente eingeblendeter Ebenen werden ausgewählt und verschoben; gesperrte Elemente, Zeichnungen und Wasserstände gehen nicht mit.
:::

### Koordinaten eingeben

Kommen die Koordinaten von außen — etwa von Polizei oder Landessicherheitszentrale —, lässt sich ein Element direkt dort anlegen, statt es auf der Karte zu suchen.

1. Element wie gewohnt hinzufügen oder ein bestehendes zum Bearbeiten öffnen
2. Unter **Koordinaten** steht die Position; der Stift daneben klappt die Eingabefelder auf
3. Dort steht dieselbe Position in fünf Schreibweisen: Dezimalgrad, Grad/Minuten/Sekunden, Grad/Dezimalminuten, UTM und Bundesmeldenetz
4. In **jedes** dieser Felder lässt sich ein ganzes Koordinatenpaar einfügen — die übrigen Felder rechnen mit
5. Speichern; das Element sitzt auf der eingetragenen Position

:::info
Dieselbe Stelle, fünfmal geschrieben: `47.94829, 16.84822` — `47°56'53.8"N 16°50'53.6"E` — `N 47°56.897' E 16°50.893'` — `33T 638004 5312206` — `M34 788550 312316`. Steht die Himmelsrichtung dabei, ist die Reihenfolge von Breite und Länge belanglos.
:::

:::tip
Auch ein **Kartenlink** lässt sich einfügen: der geteilte Standort aus WhatsApp, ein Link von Google Maps, Apple Karten oder OpenStreetMap, oder eine `geo:`-Adresse. Nur Kurzlinks (`maps.app.goo.gl/…`) tragen die Position nicht in sich — die zuerst im Browser öffnen und dann den langen Link kopieren.
:::

:::info
**UTM** braucht die Zone (`33T …`); ohne sie gilt die Zone, die im Feld schon stand. Beim **Bundesmeldenetz** genügt der Rechtswert: An ihm erkennt die App den Meridianstreifen M28, M31 oder M34 von selbst. Werte aus dem Burgenland-GIS beginnen dagegen bei 0 statt bei 750000 — dort fehlt der Streifenversatz, sie gehören nicht unverändert in dieses Feld.
:::

### Zeichenwerkzeuge

Im Bearbeitungsmodus stehen dir verschiedene Zeichenwerkzeuge zur Verfügung, mit denen du Linien, Flächen und Markierungen direkt auf der Karte einzeichnen kannst.

1. Aktiviere den Bearbeitungsmodus (Stift-Symbol)
2. Wähle eine der 8 verfügbaren Farben für deine Zeichnung aus
3. Stelle die gewünschte Linienstärke ein (3 Stufen verfügbar: dünn, mittel, dick)
4. Zeichne Linien oder Flächen durch Klicken auf die Karte
5. Nutze **Undo** und **Redo**, um Zeichenschritte rückgängig zu machen oder wiederherzustellen
6. Klicke auf **Fertig**, um die Zeichnung zu speichern, oder auf **Abbrechen**, um sie zu verwerfen

### Entfernung messen

Mit dem Entfernungs-Overlay kannst du Abstände zwischen Punkten auf der Karte messen.

1. Öffne die Layer-Auswahl über das Layer-Symbol rechts oben
2. Aktiviere das Overlay **Entfernung**
3. Klicke auf der Karte auf den Startpunkt und dann auf den Endpunkt
4. Die gemessene Entfernung wird auf der Karte angezeigt
