# Einsatzkarte mit Claude verbinden (MCP)

Die Einsatzkarte lässt sich als **Custom Connector** an Claude anbinden — und
ebenso an Claude Code, Claude Desktop oder eigene Skripte. Der Zugriff läuft
dann unter deiner Anmeldung und mit deinen Rechten: Was du in der Einsatzkarte
nicht sehen darfst, sieht auch Claude nicht.

Die Schnittstelle heißt **MCP** (Model Context Protocol). Die Adresse des
Servers ist:

```text
https://<Adresse der Einsatzkarte>/api/mcp
```

## Bevor du verbindest

Die abgerufenen Daten **verlassen die Einsatzkarte**. Sie werden von der
verbundenen Anwendung verarbeitet — bei Claude ist das ein Anbieter mit Sitz in
den USA. Dazu können Namen von Mannschaft und Meldenden gehören.

Nicht über MCP erreichbar sind **Fahrtenbuch und Kostenersatz**: Dort stehen
personenbezogene Daten, deren Übertragung an einen externen KI-Anbieter
gesondert zu klären wäre.

**Einsatz-Gäste** (Zugang über einen geteilten Link) können nicht verbinden.

## In Claude einrichten

1. In Claude unter **Einstellungen → Connectors** einen eigenen Connector
   hinzufügen.
2. Als Adresse `https://<Adresse der Einsatzkarte>/api/mcp` eintragen.
3. Claude leitet auf die Einsatzkarte weiter. Melde dich dort wie gewohnt an.
4. Es erscheint ein Bildschirm, der auflistet, was Claude darf. Prüfe die
   Liste und bestätige.
5. Zurück in Claude ist der Connector verbunden.

Beim ersten Verbinden fragt die Einsatzkarte nach deiner Einwilligung. Beim
nächsten Mal entfällt die Frage — es sei denn, die Anwendung verlangt mehr als
beim letzten Mal.

## In Claude Code einrichten

```bash
claude mcp add --transport http einsatzkarte https://<Adresse der Einsatzkarte>/api/mcp
```

Beim ersten Aufruf öffnet sich der Browser für die Anmeldung.

## Was Claude damit kann

**Lesen**

- Einsätze auflisten und Stammdaten abrufen
- Elemente der Einsatzkarte lesen: Fahrzeuge, Marker, Rohre, Leitungen, Flächen
- Einsatztagebuch und Geschäftsbuch lesen, seitenweise
- Den Gesamtkontext eines Einsatzes in einem Aufruf holen
- Hydranten und Wasserentnahmestellen im Umkreis suchen
- Adressen suchen

**Rechnen** (ohne Zugriff auf Einsatzdaten)

- Löschwasserförderung: Pumpenbedarf über Strecke und Höhenunterschied
- Pendelverkehr: Umlaufzeit, lieferbare Menge, nötige Fahrzeugzahl
- Sandsackbedarf für einen Dammabschnitt nach der Lehrunterlage LU TE3
- Strahlenschutz: Abstandsgesetz, Schutzwert, Aufenthaltszeit, Nuklide

**Schreiben** (nur wenn freigeschaltet)

- Einträge im Einsatztagebuch und im Geschäftsbuch anlegen
- Elemente anlegen, ändern und löschen

Alles, was über MCP geschrieben wird, ist als solches gekennzeichnet: Im
Einsatztagebuch und im Geschäftsbuch steht am Eintrag ein Zeichen „KI" mit dem
Namen der Anwendung, und im Auditlog des Einsatzes steht, wer und womit.

Dazu kommen zwei fertige Aufgaben, die Claude direkt anbietet:
**Einsatz-Zusammenfassung** und **Social-Media-Beitrag**. Auch die
Benutzerdokumentation der Einsatzkarte steht Claude zur Verfügung — Fragen zur
Bedienung beantwortet es daraus.

## Zugriff wieder entziehen

Unter **Verbundene Anwendungen** (im Menü unter „Administration") stehen alle
Anwendungen, denen du Zugriff gegeben hast. Ein Klick auf *Zugriff widerrufen*
beendet ihn.

Ein bereits ausgestelltes Zugriffstoken läuft nach spätestens einer Stunde ab;
so lange kann eine widerrufene Anwendung im ungünstigsten Fall noch lesen.
Danach ist Schluss, denn den Zugang verlängern kann sie nicht mehr.

## Wenn es nicht klappt

- **Claude findet den Server nicht.** Die Adresse muss die öffentliche Adresse
  der Einsatzkarte sein und auf `/api/mcp` enden.
- **„Nicht autorisiert" nach der Anmeldung.** Dein Benutzer ist in der
  Einsatzkarte nicht freigeschaltet, oder du bist als Einsatz-Gast angemeldet.
- **Claude sieht keine schreibenden Werkzeuge.** Das Schreiben ist auf dieser
  Instanz nicht freigeschaltet, oder du hast beim Verbinden nur Leserechte
  bestätigt. Verbinde in dem Fall neu.
- **Ein Einsatz fehlt in der Liste.** Er gehört zu einer Gruppe, in der du
  nicht Mitglied bist — dieselbe Regel wie in der Einsatzkarte selbst.
