# Einsätze

Hier kannst du Einsätze erstellen, bearbeiten und verwalten. Jeder Einsatz kann mit Fahrzeugen, Mannschaft und anderen Elementen verknüpft werden. Du kannst Einsätze per Link teilen, nach Gruppen filtern und Daten exportieren oder importieren.

![Einsatzübersicht](/docs-assets/screenshots/einsaetze.png)

## Funktionen

- **Neue Einsätze anlegen** Mit allen Details wie Name, Adresse, Alarmierung, Eintreffen und Abrücken
- **Einsatzdetails bearbeiten** Name, Adresse, Alarmierung, Eintreffen, Abrücken und weitere Felder ändern
- **Fahrzeuge und Mannschaft zuweisen** Fahrzeuge und Personal dem Einsatz zuordnen
- **Einsätze nach Gruppen filtern** Nur Einsätze einer bestimmten Gruppe oder aller Gruppen anzeigen
- **Einsätze aktivieren und wechseln** Einen Einsatz als aktiven Einsatz auf der Karte setzen
- **Einsätze per Link teilen** Anonymer Zugang mit Token-Link, kein Login erforderlich
- **Einsätze exportieren und importieren** Einsatzdaten sichern oder aus einer Datei wiederherstellen
- **Einsätze abschließen und löschen** Abgeschlossene Einsätze archivieren oder entfernen (nur Admins)
- **Alarm-SMS-Integration** Beim Erstellen eines Einsatzes aktuelle Alarme automatisch übernehmen

## Anleitung

### Neuen Einsatz anlegen

Über den Erstellen-Button kannst du einen neuen Einsatz mit allen relevanten Informationen anlegen.

1. Klicke auf den Erstellen-Button (FAB-Button) in der Einsatzliste
2. Fülle im Dialog die folgenden Felder aus:
   - **Name/Bezeichnung** – Kurzbeschreibung des Einsatzes
   - **Gruppe** – Zugehörige Feuerwehr-Gruppe
   - **Feuerwehr** – Zuständige Feuerwehr
   - **Alarmierung Datum/Zeit** – Wann der Alarm eingegangen ist
   - **Beschreibung** – Weitere Details zum Einsatz
   - **Eintreffen** – Zeitpunkt des Eintreffens am Einsatzort
   - **Abrücken** – Zeitpunkt des Abrückens vom Einsatzort
3. Klicke auf "Speichern", um den Einsatz anzulegen

### Alarm SMS beim Erstellen nutzen

Wenn für deine Gruppe Zugangsdaten für die Alarm SMS hinterlegt sind, kannst du beim Erstellen eines Einsatzes aktuelle Alarme direkt übernehmen.

1. Öffne den Dialog zum Erstellen eines neuen Einsatzes
2. Wenn für die gewählte Gruppe Alarm-SMS-Zugangsdaten vorhanden sind, erscheint ein Alarm-Dropdown
3. Wähle den gewünschten Alarm aus der Liste aus
4. Die Daten wie Name, Adresse, Alarmierungszeit und Beschreibung werden automatisch in die Felder übernommen
5. Prüfe die übernommenen Daten und ergänze sie bei Bedarf
6. Klicke auf "Speichern"

:::info
Die Alarm-SMS-Integration lädt automatisch aktuelle Alarme, wenn für die Gruppe Zugangsdaten hinterlegt sind. Kontaktiere einen Admin, falls die Integration für deine Gruppe eingerichtet werden soll.
:::

### Einsatz aktivieren

Nur ein aktiver Einsatz wird auf der Karte angezeigt. Du kannst zwischen Einsätzen wechseln, indem du einen anderen Einsatz aktivierst.

1. Öffne die Einsatzliste
2. Klicke beim gewünschten Einsatz auf den Button "Aktivieren"
3. Der Einsatz wird als aktiver Einsatz gesetzt und auf der Karte angezeigt
4. Der zuvor aktive Einsatz wird automatisch deaktiviert

### Einsatz bearbeiten

Bestehende Einsätze kannst du jederzeit bearbeiten, um Details zu ergänzen oder zu korrigieren.

1. Öffne den gewünschten Einsatz
2. Klicke auf das Stift-Symbol, um den Bearbeitungsmodus zu öffnen
3. Ändere die gewünschten Felder (Name, Adresse, Zeiten, Beschreibung etc.)
4. Klicke auf "Speichern", um die Änderungen zu übernehmen

### Einsatz teilen

Du kannst einen Einsatz per Link mit anderen Personen teilen. Der Link ermöglicht den Zugriff ohne Login.

1. Öffne den gewünschten Einsatz
2. Klicke auf das Teilen-Symbol
3. Der Link wird automatisch in die Zwischenablage kopiert
4. Sende den Link an die gewünschten Personen (z.B. per Messenger oder E-Mail)
5. Empfänger können den Einsatz über den Link ohne Login einsehen

:::info
Über den Teilen-Button kannst du einen anonymen Link erstellen. Personen mit diesem Link können den Einsatz ohne Login einsehen. Teile den Link nur mit vertrauenswürdigen Personen.
:::

### Einsätze filtern

In der Einsatzliste kannst du die angezeigten Einsätze nach Gruppe filtern, um schnell den richtigen Einsatz zu finden.

1. Öffne die Einsatzliste
2. Nutze das Gruppen-Dropdown oben in der Liste
3. Wähle "Alle Gruppen", um alle Einsätze zu sehen, oder wähle eine spezifische Gruppe
4. Die Liste wird sofort gefiltert und zeigt nur Einsätze der gewählten Gruppe an

### Einsatz exportieren und importieren

Einsatzdaten können exportiert werden, um sie zu sichern oder in ein anderes System zu übertragen. Ebenso können gesicherte Einsätze wieder importiert werden.

1. **Exportieren:** Öffne den gewünschten Einsatz und nutze die Export-Funktion, um die Einsatzdaten als Datei herunterzuladen
2. **Importieren:** Nutze die Import-Funktion in der Einsatzliste, um eine zuvor exportierte Datei wieder einzulesen
3. Nach dem Import werden alle Einsatzdaten wiederhergestellt

### Elemente hinzufügen

1. Öffne einen bestehenden Einsatz
2. Wähle den Elementtyp (Fahrzeug, Person, etc.)
3. Füge das Element mit den entsprechenden Daten hinzu
