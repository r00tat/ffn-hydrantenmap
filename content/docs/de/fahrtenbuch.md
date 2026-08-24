# Fahrtenbuch

Das Fahrtenbuch führt je Feuerwehr die Fahrten aller Fahrzeuge — Einsatz, Übung, Versorgungsfahrt oder Sonstiges. Erfasst werden Fahrer, Zeiten, Zählerstände, getankte Betriebsmittel und gemeldete Defekte. Fahrten lassen sich einzeln erfassen, per QR-Code ohne Anmeldung eintragen oder für einen kompletten Einsatz in einem Zug für alle beteiligten Fahrzeuge schreiben.

## Funktionen

- **Fahrten je Fahrzeug erfassen** Fahrer, Fahrtzweck, Strecke, Abfahrt und Ankunft, Zählerstände
- **Sammelerfassung für einen Einsatz** Alle Fahrzeuge eines Einsatzes in einem Durchgang, Fahrer und Zeiten aus dem Einsatz vorbelegt
- **Automatische Kilometer** Endstand aus der gefahrenen Route Feuerwehrhaus → Einsatzort → Feuerwehrhaus
- **Zähler je Fahrzeugtyp** Kilometer beim Fahrzeug, Betriebsstunden und Lenzpumpen beim Boot, keine Zähler beim Anhänger
- **Erfassung ohne Anmeldung** Über einen Gruppen-Link bzw. einen QR-Code im Fahrzeug
- **PDF-Export** Zeitraum und Fahrzeuge frei wählbar, geschätzte Werte gekennzeichnet
- **Statistik mit Drill-down** Kilometer, Fahrten, Fahrzeit und Verbrauch je Zeitraum, Zweck, Fahrzeug und Fahrer — vom Diagramm bis zur einzelnen Fahrt
- **Mängelverwaltung** Status *Offen*, *In Arbeit*, *Behoben* mit Behebungsdatum und unveränderlichem Notizverlauf; eigene Seite über alle Fahrzeuge, Anzahl offener Mängel auf der Fahrzeugkarte
- **Defekte und Betriebsmittel** Defektmeldung aus der Fahrt heraus, Tankmengen je Betriebsmittel
- **Stammdaten im Admin-Bereich** Fahrzeuge, Personen, Standort des Feuerwehrhauses, Import aus Kostenersatz und Alarm SMS
- **PDF-Import** Fahrten aus einem früheren PDF-Export übernehmen

## Wie es funktioniert

### Gruppe als Mandant

Jede Feuerwehr (Gruppe) hat ihr eigenes Fahrtenbuch. Fahrzeuge, Personen und Fahrten hängen an der Gruppe, und nur deren Mitglieder sehen sie. Wer in mehreren Gruppen ist, wählt oben auf der Seite die Gruppe aus; die Auswahl bleibt für den nächsten Besuch gespeichert.

### Fahrzeuge und Zähler

Zu jedem Fahrzeug gehört eine Zähler-Vorlage, die bestimmt, welche Felder eine Fahrt hat:

- **Fahrzeug (Kilometer)** Ein Kilometerzähler mit Start- und Endstand
- **Boot (Betriebsstunden, Lenzpumpen)** Betriebsstunden mit Start und Ende, Lenzpumpen als reine Ablesewerte
- **Ohne Zähler** Für Anhänger und Wechselladeaufbauten — solche Einheiten brauchen auch keinen Fahrer

Es gibt zwei Zählerarten: **Start/Ende** (Startstand kommt aus der letzten Fahrt, Endstand wird bei der Rückkehr eingetragen) und **Ablesung** (nur ein Wert bei der Rückkehr). Zu jedem Fahrzeug merkt sich die App den letzten Endstand — er ist der Startwert der nächsten Fahrt und steht auf der Fahrzeugkarte.

### Herkunft der Zählerstände

Ein Fahrtenbuch ist ein Nachweisdokument. Deshalb wird an jedem Eintrag festgehalten, ob ein Endstand abgelesen oder abgeleitet wurde:

- **abgelesen** Von Hand eingetragen — eine Eingabe wird nie überschrieben
- **aus der Route berechnet** Hin- und Rückweg werden getrennt gemessen und in Metern am Eintrag hinterlegt
- **geschätzt** Aus der Luftlinie mit Umwegfaktor, wenn kein Routing verfügbar war — im PDF mit „ca." gekennzeichnet
- **unverändert** Der Zähler stand still (etwa die Lenzpumpe, die nicht lief)

:::info
Warum getrennte Messung von Hin- und Rückweg? Im Ortsgebiet macht das keinen Unterschied. Bei einem Einsatz auf der Autobahn führt der Rückweg über die nächste Abfahrt und kann um Kilometer abweichen — ein verdoppelter Hinweg wäre dann ein falscher Kilometerstand im Nachweis.
:::

## Anleitung

### Übersicht öffnen

1. Öffne im Menü den Punkt **Fahrtenbuch**
2. Wähle bei mehreren Gruppen oben die gewünschte Gruppe
3. Oben stehen die Karten der aktiven Fahrzeuge mit letztem Fahrer, aktuellen Zählerständen und einem Direkt-Button zum Eintragen
4. Unter **Alle Fahrten** liegt die gruppenweite Liste — sie lässt sich nach Fahrzeug, Zweck, Fahrer, Zeitraum und „Nur Defekte" filtern

Ein Klick auf eine Fahrzeugkarte öffnet die Seite dieses Fahrzeugs mit seinen Stammdaten, den aktuellen Zählerständen und seinen Fahrten. Diese Seite hat einen eigenen Link und lässt sich teilen.

### Fahrten suchen und filtern

Über der Fahrtenliste — auf der Übersicht wie auf der Fahrzeugseite — steht ein Filterband:

- **Suche** findet über Fahrstrecke, Ziel, Einsatz, Hinweise, Mangelbeschreibung, Fahrer und Fahrzeug. Mehrere Wörter müssen alle vorkommen, dürfen sich aber auf verschiedene Felder verteilen. Groß-/Kleinschreibung und Umlaute spielen keine Rolle: „hauptstrasse" findet die „Hauptstraße"
- **Von / Bis** grenzt auf einen Zeitraum ein. Die beiden Randtage zählen mit. Als einziger Filter lädt der Zeitraum auch ältere Fahrten nach — ohne ihn zeigt die Liste die jüngsten Fahrten, und die Suche arbeitet auf genau diesen
- **Fahrer** listet die Fahrer der geladenen Fahrten
- **Fahrzeug**, **Zweck** und **Nur Defekte** wie bisher

Alle Filter wirken zusammen und ergeben die Schnittmenge; passt keine Fahrt dazu, sagt die Liste das ausdrücklich. **Filter zurücksetzen** räumt alles weg.

Der Filterzustand steht in der Adresszeile (`?q=…&von=…&bis=…`). Damit übersteht er einen Seitenwechsel mit der Zurück-Taste, lässt sich als Lesezeichen ablegen und weitergeben — der Empfänger sieht denselben Ausschnitt.

Reicht der gewählte Zeitraum über mehr Fahrten, als geladen sind, steht unter der Liste **Mehr laden**.

### Einzelne Fahrt erfassen

1. Klicke auf **Neuer Eintrag** oder auf **Fahrt eintragen** auf der Karte des Fahrzeugs
2. Wähle das **Fahrzeug** — bei der Fahrzeugkarte ist es bereits vorbelegt. Die übrigen Felder erscheinen erst danach: Zähler und Betriebsmittel hängen am gewählten Fahrzeug
3. Trage den **Fahrer** ein: Vorschläge kommen aus den Personen der Gruppe, freie Namen sind erlaubt
4. Wähle den **Fahrtzweck** (Einsatz, Übung, Versorgungsfahrt, Sonstiges)
5. Beim Zweck *Einsatz* kann zusätzlich der **Einsatz** ausgewählt oder frei eingegeben werden
6. Trage **Fahrstrecke / Ziel**, **Abfahrt** und **Ankunft** ein
7. Trage die **Zählerstände** ein — der Startstand ist aus der letzten Fahrt vorbelegt
8. Optional: **Getankt** (Diesel, Benzin, AdBlue), **Hinweise** und **Defekt oder Mangel**
9. Speichere die Fahrt

:::info
**Fahrstrecke / Ziel** ist verpflichtend — wohin die Fahrt ging, gehört zum Nachweis. Nur wenn ein **Einsatz** aus der Liste ausgewählt ist, darf das Feld leer bleiben: Dann benennt der Einsatz das Ziel, und Liste wie Export zeigen seinen Namen. Ein bloß eingetippter Einsatzname reicht dafür nicht.
:::

:::info
Weicht ein Zählerstand vom letzten bekannten Stand ab oder liegt er darunter, weist ein Hinweis darauf hin. Die Fahrt lässt sich trotzdem speichern — Zählerstände werden auch mal nachgetragen oder korrigiert.
:::

:::warning
Ändern und Löschen darf nur, wer den Eintrag erstellt hat, oder ein Administrator. Gelöschte Fahrten bleiben als gelöscht markiert erhalten und verschwinden aus den Listen und dem Export.
:::

### Defekt oder Mangel melden

Ist an einer Fahrt **Defekt oder Mangel** angehakt, entsteht daraus ein Mangel im Status *Offen* — ein eigener Vorgang, der ab da seinen eigenen Status, Verlauf und ein Behebungsdatum trägt. Die Liste **Alle Fahrten** lässt sich auf „Nur Defekte" filtern. Mit dem Häkchen erscheint das Feld **Mangelbeschreibung** — es ist verpflichtend, und dieser Text geht in die Benachrichtigung und in den Mangel ein. Die **Hinweise** bleiben davon getrennt: Dort steht, was nebenbei aufgefallen ist, im Mangel steht, was kaputt ist.

:::info
Der Mangel entsteht nur beim **Anlegen** einer Fahrt. Eine spätere Bearbeitung der Fahrt legt keinen zweiten Mangel an und setzt einen bereits bearbeiteten nicht zurück — ab der Meldung wird der Mangel über die Mängelliste geführt. Wird das Häkchen nachträglich entfernt, bleibt der Mangel bestehen und ist dort zu schließen.
:::

### Mängel verwalten

Die Seite **Mängel** (Menü → *Mängel* oder der Knopf im Fahrtenbuch) ist die Arbeitsliste: alle Mängel aller Fahrzeuge der Gruppe, vorgefiltert auf *Offen und in Arbeit*. Über die Filter lassen sich einzelne Status und ein einzelnes Fahrzeug einblenden — auch stillgelegte Fahrzeuge stehen zur Wahl, damit ein offener Mangel dort nicht unauffindbar wird.

Ein Klick auf **Bearbeiten** öffnet den Mangel:

- **Status** *Offen*, *In Arbeit* oder *Behoben*. Jeder Wechsel wird mit Autor und Zeitpunkt im Verlauf vermerkt.
- **Behoben am** erscheint beim Status *Behoben*, vorbelegt mit dem aktuellen Zeitpunkt und korrigierbar — für den Mangel, der vorige Woche behoben und erst heute nachgetragen wird. Wird der Mangel wieder geöffnet, verschwindet das Datum.
- **Notiz hinzufügen** hängt einen Eintrag an den Verlauf. Notizen sind nachträglich unveränderlich; so bleibt der Weg von der Meldung bis zur Reparatur nachvollziehbar („Werkstatttermin am 12.8.", „Ersatzteil bestellt").
- Die **Mangelbeschreibung** lässt sich korrigieren, ohne dass das im Verlauf landet — ein Tippfehler ist kein Vorgang.

Bearbeiten darf jedes Mitglied der Gruppe: Wer einen Mangel abarbeitet, ist selten der, der ihn gemeldet hat. Nachvollziehbar bleibt es über den Verlauf. **Löschen** dürfen nur Administratoren und ist für versehentlich angelegte Mängel gedacht — ein reparierter Mangel gehört auf *Behoben* gesetzt, nicht gelöscht.

Über **Mangel melden** lässt sich ein Mangel auch ohne Fahrt erfassen, etwa bei der monatlichen Fahrzeugüberprüfung.

Auf der Fahrzeugkarte und der Fahrzeugseite steht statt „Defekt gemeldet" die Anzahl der offenen Mängel; ein Klick darauf führt in die Mängelliste, gefiltert auf dieses Fahrzeug. Der alte Hinweis „Defekt gemeldet" erscheint nur noch, solange es keine offenen Mängel gibt.

Sind für die Gruppe Empfänger gepflegt (Admin-Bereich → Fahrtenbuch → **Einstellungen** → *Mangel-Benachrichtigung*), geht beim Speichern eine E-Mail an sie: Fahrzeug und Kennzeichen, Fahrer, Zeiten, Zweck und Ziel, die Zählerstände, die Mangelbeschreibung und ein Link auf das Fahrtenbuch des Fahrzeugs. Die erste Adresse steht im An-Feld, alle weiteren in Kopie.

:::info
Die Benachrichtigung geht nur bei einer **neu erfassten** Fahrt raus — auch bei einer Meldung über den QR-Code ohne Anmeldung, dann mit dem Vermerk *über Freigabelink*. Eine nachträgliche Bearbeitung, die Sammelerfassung und der PDF-Import lösen keine Mail aus. Ohne gepflegte Empfänger wird nichts versandt; die Fahrt wird in jedem Fall gespeichert.
:::

### Fahrtenbuch für mehrere Fahrzeuge eines Einsatzes schreiben

Nach einem Einsatz braucht nicht jedes Fahrzeug einen eigenen Dialog: Die **Sammelerfassung** legt für alle Fahrzeuge des Einsatzes gleichzeitig eine Fahrt an.

**Wo sie zu finden ist**

- Auf der Einsatz-Detailseite im Abschnitt **Fahrtenbuch zum Einsatz** (direkt unter der Mannschaftszuordnung)
- Oder über den Button **Fahrten für Einsatz „…" erfassen** oben auf der Fahrtenbuch-Seite, solange ein Einsatz aktiv ist

**Woher die Zeilen kommen**

Die App stellt eine Zeile je Einheit des Einsatzes: die Fahrzeuge auf der Einsatzkarte plus die Fahrzeuge aus der Mannschaftszuordnung. Jede Einheit wird über ihren Namen mit den Fahrtenbuch-Stammdaten abgeglichen; nur was dort geführt wird, bekommt eine Zeile. Als **Fahrer** wird der Maschinist des Fahrzeugs aus der Mannschaftszuordnung eingesetzt — bevorzugt über die Alarm-SMS-Empfänger-ID, sonst über den Namen.

**So gehst du vor**

1. Öffne den Abschnitt **Fahrtenbuch zum Einsatz**
2. Prüfe oben die **Zeiten für alle Fahrzeuge**: Vorbelegt sind die früheste Alarmierung und das späteste Abrücken der beteiligten Fahrzeuge, sodass die Spanne jede einzelne Fahrt abdeckt
3. Prüfe je Zeile den vorbelegten **Fahrer** und korrigiere ihn bei Bedarf
4. Die Kilometer-Vorschau je Zeile zeigt `Startstand → Endstand (+Differenz)`. Ein „ca." bedeutet: Der Endstand wird erst beim Speichern berechnet
5. Brauchst du für ein einzelnes Fahrzeug abweichende Zeiten oder eigene Zählerstände, klappe die Zeile über **Details bearbeiten** auf
6. Klicke auf **Alle speichern**

**Was beim Speichern passiert**

Für jede vollständige Zeile entsteht eine Fahrt mit dem Zweck *Einsatz*, verknüpft mit dem Einsatz; der Einsatzname steht als Fahrstrecke/Ziel. Fehlende Kilometer-Endstände berechnet der Server aus der Route vom Feuerwehrhaus zum Einsatzort und zurück — für alle Fahrzeuge dieselbe Strecke. Andere Start/Ende-Zähler werden als unverändert übernommen, Ablesezähler mit dem letzten bekannten Stand.

Die Rückmeldung nennt die Zahl der gespeicherten Fahrten und die eingetragenen Kilometer je Fahrzeug — und getrennt davon, was nicht geschrieben wurde: unvollständige Zeilen samt Grund, Fahrzeuge, die inzwischen von jemand anderem erfasst wurden, und Fahrten, die nicht gespeichert werden konnten und von Hand nachzutragen sind.

:::info
Einzutragen sind im Normalfall nur die Endstände — Fahrzeuge, Maschinisten und Zeiten kommen aus dem Einsatz, die Startstände aus der letzten Fahrt.
:::

:::info
Bereits erfasste Fahrzeuge tragen die Markierung **Bereits erfasst** und werden nicht erneut geschrieben. Ein zweiter Klick auf *Alle speichern* legt also keine Doppelten an. Einen bestehenden Eintrag öffnest du über das Stift-Symbol der Zeile.
:::

:::warning
Fehlt ein Fahrzeug des Einsatzes in den Fahrtenbuch-Stammdaten, bekommt es keine Zeile. Die Namen dieser Einheiten stehen als Hinweis unter der Liste (*„Nicht im Fahrtenbuch hinterlegt und daher ohne Fahrt"*). Für einen Wechselladeaufbau ist das richtig — steht dort ein echtes Fahrzeug, ist der Name in den Stammdaten anders geschrieben oder das Fahrzeug fehlt noch.
:::

**Voraussetzungen für die automatischen Kilometer**

- Der Einsatz gehört zu einer Gruppe und du bist Mitglied dieser Gruppe
- Der Einsatz hat Koordinaten (Einsatzort auf der Karte)
- Der **Standort des Feuerwehrhauses** ist in den Fahrtenbuch-Einstellungen der Gruppe gepflegt — sonst wird der Standardstandort verwendet
- Das Fahrzeug hat einen Kilometerzähler mit bekanntem Startstand

Fehlt das Routing, wird aus der Luftlinie geschätzt und die Fahrt als geschätzt gekennzeichnet. Fehlen die Koordinaten ganz, bleibt der Endstand leer und muss eingetragen werden.

### Fahrt ohne Anmeldung eintragen (QR-Code)

Für Fahrten von Personen ohne App-Zugang gibt es je Gruppe einen Fahrtenbuch-Link:

1. Ein Administrator erzeugt den Link im Admin-Bereich unter **Fahrtenbuch → Fahrtenbuch-Link**
2. Zu jedem Fahrzeug lässt sich dort ein QR-Code erzeugen, herunterladen und ausdrucken — er belegt das Fahrzeug im Formular vor und ist als Aufkleber fürs Fahrzeug gedacht
3. Wer den Code scannt, erfasst die Fahrt im gleichen Formular wie in der App — ohne Anmeldung

:::warning
Jeder mit diesem Link kann Fahrten erfassen. Bestehende Einträge sind über den Link **nicht** einsehbar. Beim Neuerzeugen oder Löschen wird der bisherige Link sofort ungültig — bereits ausgedruckte QR-Codes funktionieren dann nicht mehr.
:::

### Als PDF exportieren

1. Klicke auf der Fahrtenbuch-Seite auf **PDF-Export**
2. Wähle den **Zeitraum** — vorbelegt ist das laufende Jahr bis heute
3. Wähle die **Fahrzeuge** aus; stillgelegte Fahrzeuge sind als solche gekennzeichnet und lassen sich für vergangene Zeiträume mitnehmen
4. Klicke auf **PDF erstellen**

Das PDF enthält je Fahrzeug eine Tabelle mit Datum, Zeit, Fahrer, Grund, Zweck/Strecke, Notizen, Zählerständen und Betriebsmitteln. Geschätzte Werte stehen mit „ca." und werden in der Legende erklärt. Sehr große Zeiträume werden abgelehnt — dann in kleineren Abschnitten exportieren.

### Statistik auswerten

Der Knopf **Statistik** auf der Fahrtenbuch-Seite öffnet die Auswertung; von einer Fahrzeugkarte aus startet sie gleich mit diesem Fahrzeug als Filter.

1. Wähle oben den **Zeitraum** — als Vorgabe das laufende Jahr, dazu Vorgaben für Monat, Quartal, Vorjahr, letzte 12 Monate oder ein frei gesetzter Zeitraum
2. Unter den **Kennzahlen** stehen Fahrten, Summen je Zähler (Kilometer, Betriebsstunden), Fahrzeit, getankte Mengen, Ø Kilometer je Fahrt, Ø Verbrauch und Defektmeldungen
3. Im **Verlauf** ist wählbar, welche Kennzahl gezeigt wird (Fahrten, Strecke, Betriebsstunden, Fahrzeit, Tankmenge), wonach sie aufgeteilt wird (Zweck, Fahrzeug, Fahrer) und in welchem Raster (Tag, Woche, Monat, Jahr)
4. Darunter liegen die Verteilung **nach Zweck**, die Rangliste **nach Fahrzeug** und die Verteilung **nach Wochentag**
5. Die **Fahrer**-Tabelle ist sortierbar: Fahrten, Kilometer, Betriebsstunden, Fahrzeit, genutzte Fahrzeuge und letzte Fahrt
6. **Betriebsmittel und Verbrauch** zeigt die getankten Mengen im Zeitverlauf und je Fahrzeug den genäherten Verbrauch

**Drill-down:** Ein Klick auf einen Balken im Verlauf verengt den Zeitraum auf diesen Abschnitt und schaltet das Raster eine Stufe feiner — vom Jahr über den Monat bis zum Tag. Ein Klick auf ein Segment der Zweck-Verteilung, auf einen Balken der Fahrzeug-Rangliste oder auf eine Zeile der Fahrer-Tabelle setzt den jeweiligen Filter. Alle aktiven Filter stehen als Chips über den Diagrammen und lassen sich einzeln oder über **Filter zurücksetzen** wieder lösen. Ganz unten liegt unter **Fahrten im Ausschnitt** die Liste der Fahrten, die gerade ausgewertet werden — der Weg vom Diagramm zum einzelnen Eintrag.

:::info
Wie genau sind die Zahlen? Summiert werden nur Zähler mit Start- und Endstand; ein reiner Ablesewert (etwa eine Lenzpumpe) ergibt keine Differenz und geht in keine Summe ein. Fehlt an einer Fahrt der Endstand, fehlt sie in der Streckensumme — die Auswertung weist die Anzahl solcher Fahrten und die Anzahl der Fahrten mit geschätzten Ständen unter den Kennzahlen aus. Der Verbrauch ist eine Näherung: Eine Tankung füllt den Tank auch für Fahrten außerhalb des Zeitraums. Über ein Jahr ist der Wert brauchbar, über eine Woche nicht.
:::

### Stammdaten pflegen (nur Admins)

Der Admin-Bereich unter **Fahrtenbuch** hat fünf Reiter:

- **Fahrzeuge** Name, Kennzeichen, aktiv/stillgelegt, Zähler-Vorlage, Betriebsmittel, Notiz. Über **Fahrzeuge importieren** lassen sich die Fahrzeuge aus dem Kostenersatz-Bestand übernehmen; je Fahrzeug gibt es hier auch den QR-Code
- **Personen** Fahrer der Gruppe mit Telefon, E-Mail und Alarm-SMS-Empfänger-ID. Über **Personen aus CSV importieren** wird der Teilnehmer-Export aus Alarm SMS eingelesen; Personen, die nicht mehr enthalten sind, können deaktiviert werden — gelöscht wird nichts, damit vergangene Fahrten zugeordnet bleiben
- **Einstellungen** Standort des Feuerwehrhauses als Startpunkt der Einsatzkilometer, per Koordinaten oder Auswahl auf der Karte; darunter die **Mangel-Benachrichtigung** mit den E-Mail-Empfängern für gemeldete Defekte und die **Mängel-Übernahme**, die aus jeder bestehenden Fahrt mit gemeldetem Defekt einen offenen Mangel anlegt (mehrfaches Ausführen erzeugt keine Duplikate)
- **Fahrtenbuch-Link** Link für die Erfassung ohne Anmeldung erzeugen, neu erzeugen oder löschen
- **Fahrtenbuch-Import** Fahrten aus einem PDF-Export übernehmen

:::info
Stillgelegte Fahrzeuge und deaktivierte Personen verschwinden aus den Auswahllisten, ihre bisherigen Fahrten bleiben erhalten und sind weiterhin exportierbar.
:::

### Fahrten aus einem PDF importieren

1. Öffne im Admin-Bereich **Fahrtenbuch → Fahrtenbuch-Import**
2. Wähle die PDF-Datei — sie wird im Browser gelesen und nicht hochgeladen
3. Ordne bei Bedarf das Fahrzeug zu, wenn es sich nicht aus dem Titel ergibt
4. Prüfe die Liste: Jede Zeile ist als *übernehmbar*, *bereits vorhanden*, *zu prüfen* oder *Fahrer unbekannt* gekennzeichnet
5. Fehlerhafte Zeilen lassen sich über **Bearbeiten** korrigieren — die Korrektur gilt nur für diesen Import
6. Klicke auf **Übernehmen**

Unbekannte Fahrer werden als deaktivierte Personen angelegt, damit die Fahrt einen Fahrer hat, ohne die Auswahllisten zu füllen. Bereits vorhandene Fahrten werden übersprungen, ein wiederholter Import legt also keine Doppelten an.

## Berechtigungen

- **Fahrten sehen und erfassen** Mitglieder der jeweiligen Gruppe
- **Sammelerfassung zum Einsatz** Mitglieder der Gruppe, zu der der Einsatz gehört
- **Fahrt ändern oder löschen** Nur der Ersteller der Fahrt, ein Gerätemeister der Gruppe oder ein Administrator
- **Erfassung über den QR-Code** Jeder mit dem Link — ausschließlich erfassen, kein Einblick in bestehende Fahrten
- **Fahrzeuge und Personen pflegen** Administratoren und Gerätemeister der Gruppe
- **Fahrtenbuch-Link, Import und Gruppeneinstellungen** Nur Administratoren

## Gerätemeister

Fahrten korrigieren darf normalerweise nur, wer sie erfasst hat. Zusätzlich
kann ein Administrator je Feuerwehr **Gerätemeister** eintragen: Sie dürfen
jede Fahrt ihrer Feuerwehr nachträglich ändern — etwa einen falsch erfassten
Kilometerstand — und die Fahrzeuge und Personen pflegen.

Eingetragen werden Gerätemeister in der Fahrtenbuch-Verwaltung unter
„Einstellungen". Wählbar sind nur Mitglieder der jeweiligen Feuerwehr.

