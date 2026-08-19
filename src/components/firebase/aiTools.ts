import { FunctionDeclaration, SchemaType } from 'firebase/ai';

// Position schema used by multiple tools
const positionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      enum: [
        'auto',
        'mapCenter',
        'userPosition',
        'einsatzort',
        'atItem',
        'nearItem',
        'address',
        'coordinates',
      ],
      description:
        'How to resolve the position. auto = the user position if known, otherwise the Einsatzort, otherwise the map centre — the right default for measurements. userPosition = the device GPS position. einsatzort = the position of the current firecall. atItem = exactly at an existing map item (use for "from the TLFA"), nearItem = next to it (use when placing a NEW item beside it). Every type falls back to the map centre when its source is unavailable.',
    },
    itemName: {
      type: SchemaType.STRING,
      description: 'Name of item to place near (for nearItem type)',
    },
    address: {
      type: SchemaType.STRING,
      description: 'Address to geocode (for address type)',
    },
    lat: { type: SchemaType.NUMBER, description: 'Latitude (for coordinates type)' },
    lng: { type: SchemaType.NUMBER, description: 'Longitude (for coordinates type)' },
  },
};

export const AI_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'createMarker',
    description: 'Create a marker/tactical sign on the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name/label for the marker' },
        beschreibung: { type: SchemaType.STRING, description: 'Description' },
        zeichen: { type: SchemaType.STRING, description: 'Tactical sign identifier' },
        color: { type: SchemaType.STRING, description: 'Color in hex format' },
        position: positionSchema,
      },
      required: ['name'],
    },
  },
  {
    name: 'createVehicle',
    description: 'Add a fire vehicle to the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Vehicle name (e.g., TLFA 4000)' },
        fw: { type: SchemaType.STRING, description: 'Fire department name' },
        besatzung: { type: SchemaType.STRING, description: 'Crew count' },
        ats: { type: SchemaType.NUMBER, description: 'Number of breathing apparatus' },
        alarmierung: { type: SchemaType.STRING, description: 'Alert time' },
        eintreffen: { type: SchemaType.STRING, description: 'Arrival time' },
        position: positionSchema,
      },
      required: ['name'],
    },
  },
  {
    name: 'createRohr',
    description: 'Add a water discharge point (Rohr) to the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name for the Rohr' },
        art: {
          type: SchemaType.STRING,
          enum: ['C', 'B', 'Wasserwerfer'],
          description: 'Type of Rohr',
        },
        durchfluss: { type: SchemaType.NUMBER, description: 'Flow rate in l/min' },
        position: positionSchema,
      },
      required: ['name', 'art'],
    },
  },
  {
    name: 'createDiary',
    description: 'Add an entry to the Einsatztagebuch (operational diary). This is the DEFAULT action when the user input is a report/message that does not match any other tool.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Short title/summary of the diary entry' },
        beschreibung: { type: SchemaType.STRING, description: 'Detailed content/description (use for longer texts)' },
        art: {
          type: SchemaType.STRING,
          enum: ['M', 'B', 'F'],
          description:
            'Type: M=Meldung (default), B=Befehl, F=Feststellung. Use M unless explicitly stated otherwise.',
        },
        von: { type: SchemaType.STRING, description: 'From whom' },
        an: { type: SchemaType.STRING, description: 'To whom' },
      },
      required: ['name'],
    },
  },
  {
    name: 'createGb',
    description: 'Add an entry to the Geschäftsbuch',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Content of the entry' },
        ausgehend: { type: SchemaType.BOOLEAN, description: 'True if outgoing message' },
        von: { type: SchemaType.STRING, description: 'From whom' },
        an: { type: SchemaType.STRING, description: 'To whom' },
      },
      required: ['name'],
    },
  },
  {
    name: 'createCircle',
    description: 'Add a circle/radius marker to the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name for the circle' },
        radius: { type: SchemaType.NUMBER, description: 'Radius in meters' },
        color: { type: SchemaType.STRING, description: 'Color in hex format' },
        position: positionSchema,
      },
      required: ['name', 'radius'],
    },
  },
  {
    name: 'createEl',
    description: 'Add an Einsatzleitung (command post) marker',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name for the EL marker' },
        position: positionSchema,
      },
      required: ['name'],
    },
  },
  {
    name: 'createAssp',
    description: 'Add an Atemschutzsammelplatz marker',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name for the ASSP marker' },
        position: positionSchema,
      },
      required: ['name'],
    },
  },
  {
    name: 'createTacticalUnit',
    description: 'Add a tactical unit (Taktische Einheit) to the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Name/designation of the unit (e.g., Abschnitt Nord, Gruppe 1)' },
        unitType: {
          type: SchemaType.STRING,
          enum: ['einheit', 'trupp', 'gruppe', 'zug', 'bereitschaft', 'abschnitt', 'bezirk', 'lfv', 'oebfv'],
          description: 'Type of tactical unit: einheit=Einheit, trupp=Trupp, gruppe=Gruppe, zug=Zug (default), bereitschaft=Bereitschaft, abschnitt=Abschnitt, bezirk=Bezirk, lfv=LFV, oebfv=ÖBFV',
        },
        fw: { type: SchemaType.STRING, description: 'Fire department name' },
        mann: { type: SchemaType.NUMBER, description: 'Crew strength (number of personnel)' },
        fuehrung: { type: SchemaType.STRING, description: 'Unit commander name' },
        ats: { type: SchemaType.NUMBER, description: 'Number of breathing apparatus carriers' },
        alarmierung: { type: SchemaType.STRING, description: 'Alert time' },
        eintreffen: { type: SchemaType.STRING, description: 'Arrival time' },
        position: positionSchema,
      },
      required: ['name'],
    },
  },
  {
    name: 'updateItem',
    description: 'Update an existing item on the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        itemId: { type: SchemaType.STRING, description: 'ID of the item to update' },
        itemName: { type: SchemaType.STRING, description: 'Name of the item to find and update' },
        updates: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING },
            color: { type: SchemaType.STRING },
            beschreibung: { type: SchemaType.STRING },
            position: positionSchema,
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'deleteItem',
    description: 'Delete an item from the map',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        itemId: { type: SchemaType.STRING, description: 'ID of the item to delete' },
        itemName: { type: SchemaType.STRING, description: 'Name of the item to find and delete' },
      },
    },
  },
  {
    name: 'askClarification',
    description: 'Ask the user for clarification when the command is unclear',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        question: { type: SchemaType.STRING, description: 'Question to ask the user' },
        options: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description: 'Available options for the user to choose from',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'searchAddress',
    description: 'Search for an address, create a marker there and pan the map to that location',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        address: { type: SchemaType.STRING, description: 'The address to search for' },
        createMarker: { type: SchemaType.BOOLEAN, description: 'Whether to create a marker at the location (default: true)' },
      },
      required: ['address'],
    },
  },
  {
    name: 'calculate',
    description:
      'Evaluate a mathematical expression using mathjs. Use for calculations like water consumption, crew totals, areas, distances, etc.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        expression: {
          type: SchemaType.STRING,
          description:
            'A mathjs expression to evaluate, e.g. "3 * 200 * 60" or "sqrt(50^2 + 30^2)" or "15 l/min * 45 min to l"',
        },
        description: {
          type: SchemaType.STRING,
          description: 'Short German description of what is being calculated',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'calculateStrahlenschutzAbstand',
    description: 'Berechne fehlende Werte des quadratischen Abstandsgesetzes (D1² × R1 = D2² × R2). Gib genau 3 der 4 Parameter an.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        d1: { type: SchemaType.NUMBER, description: 'Abstand 1 in Metern' },
        r1: { type: SchemaType.NUMBER, description: 'Dosisleistung 1 in µSv/h' },
        d2: { type: SchemaType.NUMBER, description: 'Abstand 2 in Metern' },
        r2: { type: SchemaType.NUMBER, description: 'Dosisleistung 2 in µSv/h' },
      },
    },
  },
  {
    name: 'calculateStrahlenschutzSchutzwert',
    description: 'Berechne Dosisleistung mit Abschirmung, Schutzwert oder Schichten (R = R₀ / S^n). Gib genau 3 der 4 Parameter an.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        r0: { type: SchemaType.NUMBER, description: 'Dosisleistung ohne Abschirmung' },
        r: { type: SchemaType.NUMBER, description: 'Dosisleistung mit Abschirmung' },
        s: { type: SchemaType.NUMBER, description: 'Schutzwert des Materials' },
        n: { type: SchemaType.NUMBER, description: 'Anzahl der Schichten' },
      },
    },
  },
  {
    name: 'calculateStrahlenschutzAufenthaltszeit',
    description: 'Berechne Aufenthaltszeit, zulässige Dosis oder Dosisleistung (t = D / R). Gib genau 2 der 3 Parameter an.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        t: { type: SchemaType.NUMBER, description: 'Aufenthaltszeit in Stunden (h)' },
        d: { type: SchemaType.NUMBER, description: 'Zulässige Dosis in mSv' },
        r: { type: SchemaType.NUMBER, description: 'Dosisleistung in mSv/h' },
      },
    },
  },
  {
    name: 'calculateStrahlenschutzNuklid',
    description: 'Berechne Dosisleistung in 1m aus Aktivität oder umgekehrt für ein bestimmtes Nuklid (Ḣ = Γ × A). Gib entweder activity oder doseRate an.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        nuclide: { type: SchemaType.STRING, description: 'Name des Nuklids (z.B. Cs-137, Co-60, Am-241)' },
        activity: { type: SchemaType.NUMBER, description: 'Aktivität in GBq' },
        doseRate: { type: SchemaType.NUMBER, description: 'Dosisleistung in 1m in µSv/h' },
      },
      required: ['nuclide'],
    },
  },
  {
    name: 'searchWaterSupply',
    description:
      'Search for water supply points (Hydranten, Saugstellen, Löschteiche) around a position, sorted by air line distance. Widens the radius on its own (300/600/1200/2500 m) until it finds something, so ONE call is enough — never repeat it just to search farther. The result contains a ready-made German answer in data.answer. It also draws a hose line DRAFT to EVERY result it returns, so do not call proposeHoseLine afterwards unless a different source or dimension is wanted. Nothing is persisted; the user confirms or discards the drafts.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        position: positionSchema,
        radius: {
          type: SchemaType.NUMBER,
          description:
            'Fixed search radius in meters, max 2500. Only set this when the user asked for a specific radius — otherwise omit it and let the search widen automatically.',
        },
        kinds: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.STRING,
            enum: ['hydrant', 'saugstelle', 'loeschteich'],
          },
          description:
            'Restrict to these kinds of water supply. Omit to search all of them.',
        },
        hydrantType: {
          type: SchemaType.STRING,
          description:
            'Only hydrants whose type contains this text, e.g. "Überflur" or "Unterflur". Only applies to hydrants.',
        },
        limit: {
          type: SchemaType.NUMBER,
          description:
            'How many water supply points to return AND describe, nearest first (default 5, max 20). Raise it when the user wants an overview or more options ("zeig mir mehr Hydranten", "welche gibt es noch?") and call the search again with the higher value — that is a different call, not a repeat.',
        },
      },
    },
  },
  {
    name: 'proposeHoseLine',
    description:
      'Propose a hose line (Löschleitung) from a water supply point to a target as a DRAFT. The draft is drawn on the map but is NOT part of the firecall until the user confirms it. Always call searchWaterSupply first and use one of its results as the source.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        sourceName: {
          type: SchemaType.STRING,
          description:
            'Name of the water supply point from a previous searchWaterSupply result',
        },
        sourcePosition: {
          type: SchemaType.OBJECT,
          description:
            'Explicit start position, only if the source is not a searchWaterSupply result',
          properties: {
            lat: { type: SchemaType.NUMBER },
            lng: { type: SchemaType.NUMBER },
          },
        },
        target: positionSchema,
        dimension: {
          type: SchemaType.STRING,
          enum: ['B', 'C'],
          description: 'Hose dimension, B (default) for supply, C for attack lines',
        },
        name: {
          type: SchemaType.STRING,
          description: 'Name of the hose line; defaults to "<dimension>-Leitung <source>"',
        },
        reason: {
          type: SchemaType.STRING,
          description:
            'Short German justification why this water supply point was chosen (e.g. "nächster Überflurhydrant, 100 mm")',
        },
      },
    },
  },
  {
    name: 'answerQuestion',
    description: 'Answer a question about the firecall data. Use this when the user asks a question rather than giving a command.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        answer: { type: SchemaType.STRING, description: 'The answer to the question in German' },
      },
      required: ['answer'],
    },
  },
];

export const AI_SYSTEM_PROMPT = `Du bist ein Einsatz-Assistent für die Freiwillige Feuerwehr.
Du hilfst beim Erstellen und Verwalten von Elementen auf der Einsatzkarte und beantwortest Fragen zum Einsatz sowie zum Strahlenschutz.

KRITISCH - Keine Halluzinationen:
- Verwende AUSSCHLIESSLICH Informationen, die der Benutzer tatsächlich gesagt oder geschrieben hat.
- Erfinde NIEMALS Details wie Einsatzart, Lage, Personenangaben oder Szenarien, die nicht explizit genannt wurden.
- Wenn der Benutzer nur Fahrzeuge, Rohre oder andere Elemente meldet, erstelle NUR diese - keine zusätzlichen Lageeinschätzungen.
- Bei Audio-Eingaben: Halte dich strikt an das Gesprochene. Füge keine Interpretationen hinzu.
- Du kennst KEINE Hydranten, Saugstellen oder Löschteiche aus eigenem Wissen. Jede Aussage
  darüber setzt einen vorherigen searchWaterSupply-Aufruf voraus - ohne den ist sie erfunden.

Regeln:
- Antworte kurz und präzise: ein bis zwei Sätze, im Zweifel weniger
- Deine Antwort wird VORGELESEN. Schreibe reinen Fließtext ohne Markdown - keine
  Sternchen, keine Rauten, keine Aufzählungszeichen, keine Tabellen. Zahlen mit
  Einheit ausschreiben ("120 Meter", "sechs B-Längen").
- Nenne nur, was gefragt wurde. Technische Details wie Nennweite, Druck oder
  Adresse gehören in die Antwort, wenn danach gefragt wurde oder sie die Auswahl
  begründen - nicht als Aufzählung zu jedem Treffer.
- Führe Aktionen sofort aus, wenn der Befehl klar ist
- Bei Fragen über den Einsatz oder allgemeine Fragen: verwende answerQuestion mit einer kurzen Antwort
- AUSNAHME: Fragen nach Hydranten, Saugstellen, Löschteichen oder der Wasserversorgung
  ("Wo ist der nächste Hydrant?") NIEMALS mit answerQuestion beantworten. Dafür immer zuerst
  searchWaterSupply aufrufen - die Daten stehen nur dort.
- Bei Unklarheiten: verwende askClarification mit konkreten Optionen
- Verwende die bereitgestellten Tools für alle Kartenaktionen und Berechnungen
- Positionen ohne Angabe: verwende mapCenter als position.type
- "bei mir" / "hier" / "von meinem Standort" = userPosition als position.type
- "Einsatzstelle" / "Einsatzort" / "zum Einsatz" = einsatzort als position.type
- "von <Element>" / "beim TLFA" als Bezugspunkt einer Messung = atItem mit itemName
- Referenzen wie "daneben", "neben dem X" zum PLATZIEREN = nearItem mit itemName
- Ohne jede Ortsangabe bei einer Messung oder Suche: auto als position.type
- Für Adresssuche: verwende searchAddress (erstellt Marker und schwenkt Karte dorthin)

Verfügbare Elemente:
- marker: Taktische Zeichen, allgemeine Marker (createMarker)
- vehicle: Fahrzeuge wie TLFA, KLF, etc. (createVehicle)
- rohr: Wasserabgabestellen C-Rohr, B-Rohr, Wasserwerfer (createRohr)
- diary: Einsatztagebuch-Einträge (createDiary)
- gb: Geschäftsbuch-Einträge (createGb)
- circle: Kreise mit Radius (createCircle)
- el: Einsatzleitung-Marker (createEl)
- assp: Atemschutzsammelplatz (createAssp)
- tacticalUnit: Taktische Einheiten wie Trupp, Gruppe, Zug, Abschnitt (createTacticalUnit)

Aktionen:
- searchAddress: Adresse suchen, Marker erstellen und Karte dorthin schwenken
- searchWaterSupply: Hydranten, Saugstellen und Löschteiche im Umkreis suchen
- proposeHoseLine: Löschleitung als Entwurf vorschlagen
- updateItem: Bestehendes Element ändern (Name, Farbe, Beschreibung, Position)
- deleteItem: Bestehendes Element löschen
- answerQuestion: Fragen zum Einsatz beantworten (z.B. "Wie viele Fahrzeuge?", "Wann ist das TLFA eingetroffen?")
- calculate: Allgemeine Berechnungen mit mathjs (z.B. Wasserverbrauch, Mannschaftsstärke)
- Strahlenschutz-Berechnungen: Verwende die spezifischen Tools calculateStrahlenschutzAbstand, calculateStrahlenschutzSchutzwert, calculateStrahlenschutzAufenthaltszeit und calculateStrahlenschutzNuklid.
  - Wenn ein Benutzer nach Dosisleistung in einem anderen Abstand fragt -> calculateStrahlenschutzAbstand
  - Wenn nach Abschirmung/Schutzwert gefragt wird -> calculateStrahlenschutzSchutzwert
  - Wenn nach Aufenthaltszeit bei einer bestimmten Dosis gefragt wird -> calculateStrahlenschutzAufenthaltszeit
  - Wenn nach Dosisleistung eines Nuklids (Aktivität) gefragt wird -> calculateStrahlenschutzNuklid

Der Kontext enthält existingItems mit allen aktuellen Elementen und deren Details:
- Fahrzeuge: Name, Feuerwehr (fw), Besatzung, ATS-Geräte, Alarmierung, Eintreffen, Abrücken
- Rohre: Name, Art (C/B/Wasserwerfer), Durchfluss in l/min
- Tagebuch: Inhalt, Art (M=Meldung, B=Befehl, F=Feststellung), Von, An, Datum
- Geschäftsbuch: Inhalt, Ausgehend/Eingehend, Von, An, Datum
- Taktische Einheiten: Name, Art (Trupp/Gruppe/Zug/Abschnitt/etc.), Feuerwehr, Mannschaftsstärke, Einheitsführer, ATS-Träger

Für Referenzen auf bestehende Elemente nutze itemName oder itemId.

WASSERVERSORGUNG - Hydranten suchen und Löschleitung vorschlagen:

Frage nach einer Entnahmestelle ("Wo ist der nächste Hydrant?", "Gibt es Wasser in der
Nähe?", "Wo kann ich ansaugen?"):
searchWaterSupply EINMAL aufrufen, dann direkt antworten. Nicht answerQuestion verwenden,
bevor die Suche gelaufen ist - du hast die Hydrantendaten nicht im Kopf.

Der Bezugspunkt entscheidet über das Ergebnis, also setze position bewusst:
- "von meinem Standort", "bei mir", "hier" -> position.type = userPosition
- "vom Einsatzort", "von der Einsatzstelle" -> position.type = einsatzort
- "vom TLFA", "von der Einsatzleitung", "von <Fahrzeug/Element>" -> position.type =
  atItem mit itemName (der genaue Punkt des Elements, NICHT nearItem)
- ohne Angabe -> position weglassen; die Suche nimmt dann den Standort des
  Benutzers, ersatzweise den Einsatzort.
Das Ergebnis nennt in data.origin.label, worauf es tatsächlich hinauslief. Sag das
im Antwortsatz mit ("von deinem Standort aus", "vom Einsatzort aus") - besonders
wenn dort "der Kartenmitte" steht, denn dann fehlten Standort und Einsatzort.
Will der Benutzer danach mehr Entnahmestellen sehen ("und welche noch?", "zeig mir
mehr"), rufe searchWaterSupply erneut mit einem höheren limit auf (z.B. 10). Das ist
kein wiederholter Aufruf, sondern ein anderer - die Ergebnisliste ist nach Entfernung
sortiert und limit steuert, wie viele davon du genannt bekommst.
Die Suche zeichnet dabei zu JEDER gefundenen Entnahmestelle einen Leitungsvorschlag
ein - so viele, wie limit zurückgibt. Erwähne sie in einem Halbsatz ("drei Leitungen
eingezeichnet, die kürzeste 120 Meter") und rufe dafür NICHT zusätzlich
proposeHoseLine auf. proposeHoseLine brauchst du nur, wenn eine ANDERE Entnahmestelle
oder eine andere Dimension gewünscht ist; es ersetzt dann alle Vorschläge der Suche. Das Ergebnis enthält in
data.answer bereits einen fertigen Satz mit Entfernung und Himmelsrichtung - gib
ihn wieder, gekürzt auf das Gefragte. Rufe die Suche NICHT ein zweites Mal auf,
nur um den Radius zu vergrößern: Sie weitet ihn von sich aus bis 2500 m aus. Nur
wenn der Benutzer ausdrücklich einen anderen Ort oder eine andere Art meint, ist
ein zweiter Aufruf richtig.

Auftrag für eine Löschleitung ("Leitung vom nächsten Hydranten zum Einsatzort"):
1. searchWaterSupply aufrufen. Ohne Angabe: position.type = einsatzort.
2. Aus den Treffern begründet auswählen. Die Suche liefert Distanz, Typ, Nennweite
   (dimension in mm), statischen und dynamischen Druck sowie bei Saugstellen und
   Löschteichen Entnahmemenge, Saughöhe, Fassungsvermögen und Zufluss.
   - "nächster" -> kleinste Distanz
   - "stärkster" / "leistungsfähigster" -> größte Nennweite bzw. Entnahmemenge,
     Distanz nachrangig
   - Ein Füllhydrant ist zum Befüllen von Tanklöschfahrzeugen gedacht, nicht für
     eine Zubringleitung.
3. proposeHoseLine mit sourceName aus dem Suchergebnis aufrufen. dimension B für
   Zubring- und Versorgungsleitungen, C nur wenn ausdrücklich ein C-Rohr oder eine
   Angriffsleitung verlangt wird. reason kurz und in ganzen Worten begründen.
4. Danach in einem Satz sagen, welche Entnahmestelle du gewählt hast, wie lang die
   Leitung wird und wie viele Schlauchlängen das sind.

Der Vorschlag ist NUR ein Entwurf. Er wird gestrichelt auf der Karte gezeigt und
landet erst im Einsatz, wenn der Benutzer ihn bestätigt. Behaupte niemals, die
Leitung sei bereits angelegt. Erfinde niemals Hydranten, Nennweiten oder Drücke -
verwende ausschließlich, was searchWaterSupply zurückgegeben hat.

Halte dich generell kurz: Jeder zusätzliche Werkzeugaufruf verzögert die Antwort,
und nach wenigen Aufrufen bricht die Verarbeitung ab. Wiederhole nie einen Aufruf
mit exakt denselben Argumenten - ein Aufruf mit geändertem limit, Radius, Ort oder
Filter ist dagegen ausdrücklich erlaubt.

WICHTIG - Standardverhalten bei Meldungen:
Wenn der Benutzer keine bestimmte Funktion aufruft und keine Frage zum Einsatz stellt, handelt es sich wahrscheinlich um eine Meldung.
Erstelle in diesem Fall automatisch einen Tagebucheintrag (createDiary) mit art="M".
- Bei kurzen Texten: verwende name für den Inhalt
- Bei langen Texten (mehr als ein kurzer Satz): erstelle einen kurzen Titel in name und setze den vollständigen Text in beschreibung`;
