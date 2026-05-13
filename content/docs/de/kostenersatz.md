# Kostenersatz

Erstelle und verwalte Kostenersatz-Abrechnungen für Einsätze gemäß der Tarifordnung.

![Kostenersatz](/docs-assets/screenshots/kostenersatz.png)

## Funktionen

- Abrechnungen erstellen
- Positionen hinzufügen (Fahrzeuge, Material, Personal)
- Abrechnungen als PDF exportieren

## Anleitung

### Neue Abrechnung erstellen

1. Öffne den Kostenersatz-Bereich im Einsatz
2. Klicke auf "Neue Berechnung"
3. Die Berechnung besteht aus drei Tabs: Einsatz, Berechnung und Empfänger

### Vorlage verwenden

Um Zeit zu sparen, kannst du eine gespeicherte Vorlage laden:

1. Klicke auf "Vorlage laden" oben rechts
2. Wähle eine bestehende Vorlage aus der Liste
3. Die Fahrzeuge und Positionen werden automatisch übernommen
4. Passe bei Bedarf die Stunden oder Einheiten an

Du kannst auch deine aktuelle Berechnung als Vorlage speichern, indem du auf "Als Vorlage speichern" klickst.

:::info
Tipp: Vorlagen sind besonders nützlich für wiederkehrende Einsatzarten (z.B. Brandsicherheitswache). Speichere eine Vorlage einmal und lade sie bei ähnlichen Einsätzen.
:::

### Positionen hinzufügen

Im Tab "Berechnung" fügst du die einzelnen Positionen hinzu:

![Kostenersatz Berechnung Tab](/docs-assets/screenshots/kostenersatz-berechnung.png)

- **Fahrzeuge schnell hinzufügen** Oben im Panel kannst du Fahrzeuge mit einem Klick auswählen - die passenden Tarife werden automatisch hinzugefügt
- **Kategorien durchsuchen** Öffne die Kategorien (Fahrzeuge, Personal, Material, etc.) und gib die Anzahl der Einheiten ein
- **Sonstige Positionen** Für Kosten, die nicht im Tarif enthalten sind, klicke auf 'Position hinzufügen' in Kategorie 12

### Berechnung

Die Kosten werden automatisch berechnet:

- **Stunden × Einheiten × Tarif** Für die meisten Positionen gilt: Anzahl Stunden mal Anzahl Einheiten mal Stundensatz
- **Pauschalen** Manche Positionen haben eine Pauschale für die ersten Stunden, danach gilt der Stundensatz
- **Gesamtsumme** Die Gesamtsumme wird unten angezeigt und automatisch aktualisiert

:::info
Tipp: Die PDF-Rechnung wird nach der aktuellen Tarifordnung der Gemeinde formatiert und enthält alle Positionen mit Einzelpreisen.
:::

### Empfänger angeben

Im Tab "Empfänger" gibst du die Rechnungsadresse ein:

1. Name des Empfängers (Pflichtfeld)
2. Adresse (Straße, PLZ, Ort)
3. E-Mail-Adresse (für den E-Mail-Versand erforderlich)

### Abrechnung per E-Mail senden

Du kannst die Abrechnung direkt per E-Mail versenden:

1. Stelle sicher, dass eine E-Mail-Adresse beim Empfänger eingetragen ist
2. Klicke auf "E-Mail"
3. Die E-Mail wird mit vorgefertigtem Text geöffnet (aus der Vorlage)
4. Passe bei Bedarf Betreff und Text an
5. Füge optional CC-Empfänger hinzu
6. Klicke auf "Senden"

Die PDF-Rechnung wird automatisch als Anhang beigefügt.

### Zahlung per SumUp

Abrechnungen können direkt per Kartenzahlung über SumUp beglichen werden:

1. Abrechnung öffnen
2. "Zahlung" Button klicken
3. SumUp-Transaktion wird erstellt
4. Kunde bezahlt per Karte
5. Zahlung wird automatisch verifiziert

### Speichern und Abschließen

- **Speichern** Speichert die Berechnung als Entwurf - du kannst sie später weiter bearbeiten
- **Abschließen** Schließt die Berechnung ab - danach sind keine Änderungen mehr möglich
- **Kopieren** Bei abgeschlossenen Berechnungen kannst du eine Kopie erstellen, um Änderungen vorzunehmen
