# Offline-Modus

Die Einsatzkarte funktioniert auch ohne Internetverbindung. Du kannst offline einen neuen Einsatz anlegen, das Einsatztagebuch führen, Elemente auf der Karte zeichnen und Atemschutztrupps überwachen. Alles, was du offline erfasst, wird auf dem Gerät gespeichert und automatisch übertragen, sobald die Verbindung wieder steht.

## Funktionen

- **Verbindungsstatus in der Kopfzeile** Die App prüft selbst, ob der Server erreichbar ist – auch in einem WLAN ohne Internet
- **Offline weiterarbeiten** Einsätze, Einsatztagebuch, Karte, Ebenen, Besatzung, Atemschutzsammelplatz, Füllprotokoll und Atemschutzüberwachung
- **Automatische Synchronisation** beim Reconnect, auch nach einem Neustart der App
- **Abgelehnte Änderungen werden gemeldet** und lassen sich erneut versuchen oder verwerfen
- **Anhänge werden nachgeholt** – eine offline angefügte Datei wird hochgeladen, sobald die Verbindung steht
- **Kaltstart ohne Netz** – die App öffnet auch im Flugmodus, wenn du dich in den letzten 90 Tagen online angemeldet hast
- **Karte für offline vorbereiten** – Kartenkacheln für das Gebiet um den Einsatzort vorab laden
- **Atemschutz-Warnungen offline** – die Überwachungsseite warnt selbst, wenn keine Push-Nachricht ankommt

## Anleitung

### Den Verbindungsstatus erkennen

In der Kopfzeile erscheint ein Chip, sobald etwas anders ist als normal:

| Anzeige | Bedeutung |
| --- | --- |
| *(kein Chip)* | Verbunden, alles übertragen |
| **Offline-Modus** | Keine Verbindung zum Server. Änderungen bleiben auf dem Gerät. Steht dabei „N Änderungen ausstehend", warten so viele Änderungen auf die Übertragung. |
| **N Änderungen werden übertragen…** | Die Verbindung steht wieder, offline Erfasstes wird gerade übertragen |
| **N Änderungen nicht übertragen** (rot) | Der Server hat Änderungen abgelehnt – siehe unten |

Tippe auf den Chip „Offline-Modus", um die Verbindung sofort erneut zu prüfen. Nach der Übertragung erscheint kurz „Änderungen wurden synchronisiert".

:::info
Die App verlässt sich nicht darauf, ob das Gerät „WLAN" oder „Mobilfunk" anzeigt, sondern fragt regelmäßig den Server. Ein Fahrzeug-WLAN ohne Internet wird deshalb richtig als offline erkannt.
:::

### Offline arbeiten

Arbeite einfach wie gewohnt weiter. Dialoge schließen sofort nach dem Speichern, auch ohne Verbindung. Ein kleines Wolkensymbol im Einsatztagebuch und beim Druckverlauf der Atemschutzüberwachung zeigt Einträge, die erst auf diesem Gerät liegen.

Einen neuen Einsatz kannst du offline anlegen. Die Übernahme aus der Alarm SMS und die Prüfung auf einen schon bestehenden Einsatz entfallen dann – darauf weist der Dialog hin.

### Was offline nicht geht

Funktionen, die den Server brauchen, sind offline ausgegraut. Ein Tooltip zeigt „Nur mit Internetverbindung verfügbar". Das betrifft vor allem:

- KI-Assistent und Sprach-Assistent
- Rechnungen der Atemschutz-Verrechnung, Mail-Versand (Rechnung, Kostenersatz)
- PDF-Export (Füllprotokoll, Fahrtenbuch)
- Fahrten im Fahrtenbuch, Mängel und Mängelbilder
- Einsatz-Fotos im Google Drive
- Straßen-Routing und Höhenprofil von Leitungen – die Leitung bleibt offline bei der Luftlinie
- Verwaltung (Benutzer, Gruppen, Freigabe-Links, Import und Export)

### Anhänge offline anfügen

Bei einem bestehenden Einsatz oder Element kannst du offline Dateien anfügen. Sie erscheinen als „<Datei> – wartet auf Upload" und werden nach dem Reconnect hochgeladen; erst dann steht der Anhang am Einsatz. Bei einem neuen Element, das noch nicht gespeichert ist, ist der Upload offline nicht möglich – speichere das Element zuerst.

### Abgelehnte Änderungen

Ob du eine Änderung machen darfst, prüft der Server erst beim Übertragen. Lehnt er ab, verschwindet der Eintrag wieder, und in der Kopfzeile erscheint der rote Chip „N Änderungen nicht übertragen".

1. Tippe auf den roten Chip
2. Die Liste zeigt je Änderung Art, Zeit, Ort und Fehlercode
3. Wähle **Erneut versuchen** (wo möglich), **Verwerfen** oder **Alle verwerfen**

:::warning
Die Liste der abgelehnten Änderungen bleibt nur bis zum nächsten Neuladen der App erhalten. Prüfe sie, bevor du die App neu startest.
:::

### Vor dem Einsatz: Karte für offline vorbereiten

Die Daten des geöffneten Einsatzes (Elemente, Tagebuch, Trupps, Gerätebestand, Einsatzliste der letzten Wochen, Hydranten der Umgebung) lädt die App automatisch auf das Gerät, sobald du einen Einsatz online öffnest. Kartenkacheln musst du selbst vorladen:

1. Öffne die Einsatz-Detailseite, Abschnitt **Offline-Karte** (Mittelpunkt ist der Einsatzort) – oder das **Profil** (Mittelpunkt ist dein Standort, ggf. **Standort verwenden** antippen)
2. Wähle den **Umkreis** (500 m bis 3 km) und die Ebenen (Basemap, Orthofoto, Basemap grau, Adressen)
3. Die App zeigt die Zahl der Kacheln und die ungefähre Größe
4. Tippe auf **Für offline vorbereiten** – der Fortschritt wird angezeigt, mit **Abbrechen** kannst du jederzeit stoppen
5. Mit **Löschen** gibst du den Speicher wieder frei

:::info
Vorladen lässt sich nur die Basemap von basemap.at. OpenStreetMap und OpenTopoMap untersagen das Vorladen; sie sind offline nur so weit verfügbar, wie du die Karte vorher angesehen hast.
:::

Leere Listen sind offline gekennzeichnet („Offline – keine Einträge auf diesem Gerät"), gefüllte mit „Offline – evtl. unvollständig". Eine Liste, die auf diesem Gerät nie online geöffnet wurde, kann offline leer sein, obwohl es Einträge gibt.

### App ohne Netz starten

Hast du dich in den letzten 90 Tagen online angemeldet und die App benutzt, öffnet sie auch im Flugmodus ohne Login-Bildschirm. Die Rechte stammen dann aus der letzten Anmeldung; der Tooltip am Status weist darauf hin. Sobald die Verbindung wieder steht, wird die Anmeldung am Server erneut geprüft.

Alle Seiten der App lädt das Gerät nach dem Start im Hintergrund vor – auch die des aktuellen Einsatzes, etwa die Atemschutzüberwachung. Offline wechselst du also wie gewohnt zwischen den Seiten; die Seite lädt dabei einmal neu. Damit das klappt, sollte die App nach der Anmeldung etwa eine Minute online offen gewesen sein. Ausgenommen sind nur Verwaltung, Anmeldung und Seiten zu einzelnen Abrechnungen oder Fahrzeugen; die zeigen offline „Offline – Seite nicht verfügbar" mit einem Knopf **Zur Karte**.

:::warning
In der Android-App ist der Start ohne Netz noch nicht auf allen Geräten verlässlich. Lass die App während des Einsatzes geöffnet, statt sie zu beenden. Startet sie ohne Daten, meldet sie sich beim nächsten Verbindungsaufbau von selbst wieder an.
:::

### Atemschutzüberwachung offline

Ohne Verbindung kommen keine Push-Nachrichten vom Server. Die geöffnete Überwachungsseite warnt deshalb selbst – zum Rückzug, zu den Drittelmarken und zum Ende der Einsatzzeit.

- Lass die **Überwachungsseite geöffnet** auf dem Gerät, auf dem die Druckabfragen erfasst werden
- Solange ein Trupp im Einsatz ist, hält die App den Bildschirm an (wo der Browser das unterstützt); ein Hinweis auf der Seite zeigt das an
- Nach dem Reconnect werden die Warnungen am Server für alle Trupps im Einsatz neu geplant
- **In der Android-App** kommen die Warnungen auch bei gesperrtem Bildschirm und wenn die App geschlossen ist. Erscheint auf der Überwachungsseite der Hinweis zu exakten Alarmen, tippe auf **Exakte Alarme erlauben** und schalte „Alarme & Erinnerungen“ ein – sonst können sich Warnungen um einige Minuten verspäten. Ein Tipp auf die Warnung öffnet die Überwachungsseite.

:::warning
Andere Geräte sehen die Druckabfragen erst nach dem Reconnect. Überwache einen Trupp offline immer auf dem Gerät, auf dem du die Werte erfasst.
:::

## Grenzen

- **Kein Abgleich zwischen Geräten ohne Internet.** Zwei Geräte, die gleichzeitig offline sind, sehen die Einträge des anderen erst nach dem Reconnect. Abhilfe schafft ein LTE-Router im Fahrzeug.
- **Gleichzeitige Änderungen:** Ändern zwei Geräte offline dasselbe Feld, gilt die zuletzt übertragene Änderung.
- **Nur Geladenes ist offline da.** Was auf dem Gerät nie online geöffnet wurde, fehlt offline.
