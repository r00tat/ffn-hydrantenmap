# Straßen-Routing für Leitungen und Linien

Eine Lösch- oder Zubringerleitung (`connection`) und eine Linie (`line`) folgen
auf Wunsch dem Straßenverlauf statt der Luftlinie: Feld
**„Routing über Straße"**, Standard bleibt die direkte Verbindung.

- **Das Profil wählt nur die Linie** (Feld `routingProfile`, `walk`/`drive`).
  Eine Schlauchleitung hat kein solches Feld und bleibt beim Fußgänger-Profil —
  ein Schlauch folgt der Straße, fährt aber nicht. Bei der Linie kann beides
  gemeint sein: eine Strecke zu Fuß oder eine Anfahrt, für die Einbahnen und
  Abbiegeverbote gelten.
- **`routingPreference` gehört nur zum Auto-Profil.** Die Routes API nimmt es
  allein für `DRIVE` und `TWO_WHEELER` und lehnt den Aufruf sonst ab — bei `WALK`
  muss es weg. Die Geometrie kommt als `GEO_JSON_LINESTRING`, damit kein
  Polyline-Decoder nötig ist; GeoJSON zählt `[lng, lat]`.
- **Ein Aufruf für die ganze Leitung**, nicht einer je Abschnitt: Die Punkte
  dazwischen gehen als `intermediates` mit, die Antwort liefert je Abschnitt
  eine eigene Polyline. Über 25 Punkte wird in Blöcke geteilt, die sich um einen
  Punkt überlappen.
- **Die gesetzten Punkte bleiben Teil der Linie** (`stitchRoutedPositions` in
  [routedPath.ts](../src/components/FirecallItems/elements/connection/routedPath.ts)).
  Google setzt Start und Ziel eines Abschnitts auf die Straße; die Strecke von
  dort zum tatsächlichen Punkt ist die Zuführung (Hydrant → Straße) und zählt
  für die Schlauchlängen mit. Eine Leitung führt **durch** den Verteiler, nicht
  an ihm vorbei.
- **Die Geometrie steht am Element** (`routedPositions`), zusammen mit der
  Signatur aus Punkten **und Profil**, für die sie gilt (`routedFor`). Das Profil
  gehört mit hinein: Ein Wechsel von Fuß auf Auto ändert die Route, ohne einen
  Punkt zu verschieben. Nur so zeichnet die Karte ohne Routing-Aufruf — ein
  Aufruf je Änderung, keiner je Render. Geroutet wird deshalb an den
  Mutationsstellen
  (`ensureConnectionRouting`): beim Zeichnen
  ([Leitungen/context.tsx](../src/components/Map/Leitungen/context.tsx)), beim
  Verschieben, Einfügen und Löschen eines Punktes
  ([positions.ts](../src/components/FirecallItems/elements/connection/positions.ts))
  und beim Speichern aus dem Dialog
  ([useFirecallItemUpdate.ts](../src/hooks/useFirecallItemUpdate.ts)).
- **`distance` ist die Länge der gezeichneten Linie**, gemessen mit derselben
  `calculateDistance` wie die Luftlinie. Die Meter der Routes API bleiben
  ungenutzt: Sie kennen die Zuführungen nicht, und eine angezeigte Länge, die
  nicht zur Linie gehört, wäre im Einsatz irreführend.
- **Fällt das Routing aus, bleibt das Element** und trägt die Luftlinie samt
  Hinweis im Popup (`routingFailed`). Die Signatur wird auch beim Fehlschlag
  gesetzt — sonst liefe bei jeder weiteren Änderung ein neuer Versuch.
- **Über `MAX_ROUTING_POINTS` (50) wird nicht geroutet.** Die Schranke ist die in
  der Action, gegen alles, was aus dem Browser kommt; die Prüfung im Browser ist
  nur die Abkürzung dorthin. Wer die Option an einer Linie mit hunderten Punkten
  einschaltet — etwa an einer GPS-Aufzeichnung — sieht sofort die Luftlinie mit
  Hinweis, statt auf eine Ablehnung zu warten, die schon feststeht. Von selbst
  routet eine Aufzeichnung nie: `streetRouting` setzt der Recorder nicht, und
  ohne die Option ist `routingTodo` bei jedem Messpunkt `'none'`.
- **Die Felder liegen an `MultiPointItem`/`FirecallMultiPoint`**, angeboten
  werden sie nur in `fields()` von Leitung und Linie. `data()` ist die Grundlage
  jedes Schreibvorgangs — ein Feld, das dort fehlt, löscht ein Speichern aus dem
  Dialog (`setDoc` ohne `merge`).
- Die Server-Action darf **kein Leaflet** importieren (`window is not defined`).
  Deshalb die Trennung: `routedPath.ts` ist reine Geometrie für beide Seiten,
  `streetRouting.ts` liest die Felder am Element, `ensureConnectionRouting.ts`
  schreibt nach Firestore.
