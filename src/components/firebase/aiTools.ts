import { FunctionDeclaration, SchemaType } from 'firebase/ai';
import { TRUPP_STATUSES } from '../../common/atemschutz';

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
      description:
        'Name of the item to place near (nearItem) or at (atItem). Leave it empty to ' +
        'mean the item created last, e.g. "weiterer Messpunkt 10 m nordöstlich".',
    },
    direction: {
      type: SchemaType.STRING,
      enum: [
        'left',
        'right',
        'above',
        'below',
        'north',
        'south',
        'east',
        'west',
        'northeast',
        'northwest',
        'southeast',
        'southwest',
      ],
      description:
        'Side or compass direction from the item for nearItem, on the north-up map: ' +
        '"links" = left, "rechts" = right, "oberhalb" = above, "unterhalb" = below, ' +
        '"nördlich" = north, "nordöstlich" = northeast, "südwestlich" = southwest and so on. ' +
        'Set it whenever a side or direction is named.',
    },
    distance: {
      type: SchemaType.NUMBER,
      description: 'Distance from the item in meters for nearItem, default 20',
    },
    address: {
      type: SchemaType.STRING,
      description: 'Address to geocode (for address type)',
    },
    lat: { type: SchemaType.NUMBER, description: 'Latitude (for coordinates type)' },
    lng: { type: SchemaType.NUMBER, description: 'Longitude (for coordinates type)' },
  },
};

/**
 * Gesagt wird „KLF Weiden", gespeichert werden Name und Feuerwehr getrennt.
 * Mit „Fire department name" allein hat das Modell den Ort weggelassen und in
 * der Antwort trotzdem genannt.
 */
const FW_DESCRIPTION =
  'Fire department (Feuerwehr) the unit belongs to. Usually the place name ' +
  'spoken after the designation: "KLF Weiden" is name KLF and fw Weiden, ' +
  '"TLFA Neusiedl" is name TLFA and fw Neusiedl. Always set it when a place ' +
  'is named; never drop it.';

/**
 * Ebene eines Elements. Ohne Angabe legt `createMarker` in die aktive Ebene
 * (`activeLayer` im Kontext), wie die Oberfläche.
 */
const LAYER_SCHEMA = {
  type: SchemaType.STRING,
  description:
    'Name of the layer (Ebene) from context.layers. Only when the user names a ' +
    'layer; without it a new marker goes to context.activeLayer',
};

/**
 * Werte der Datenfelder einer Ebene. Der Wert geht als Text hinaus, weil ein
 * Feld auch Text oder ja/nein sein kann; die Einheit rechnet der Handler um.
 */
const FIELD_VALUES_SCHEMA = {
  type: SchemaType.ARRAY,
  description:
    'Values for the data fields of the layer (context.layers[].fields), e.g. a ' +
    'measured dose rate. Pass the number and the unit as spoken; the unit is ' +
    'converted to the unit of the field, do not convert yourself',
  items: {
    type: SchemaType.OBJECT,
    properties: {
      field: {
        type: SchemaType.STRING,
        description: 'Key or label of the field, e.g. "dosisleistung"',
      },
      value: {
        type: SchemaType.STRING,
        description: 'The value as spoken, e.g. "37" or "ja"',
      },
      unit: {
        type: SchemaType.STRING,
        description: 'Unit as a symbol, e.g. "mSv/h" for Millisievert pro Stunde, "µSv/h"',
      },
    },
    required: ['field', 'value'],
  },
};

export const AI_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'createMarker',
    description:
      'Create a marker on the map: a general marker or tactical sign, an ' +
      'Einsatzleitung (command post) or an Atemschutzsammelplatz (ASSP)',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        kind: {
          type: SchemaType.STRING,
          enum: ['marker', 'el', 'assp'],
          description:
            'marker = general marker/tactical sign (default), el = Einsatzleitung, ' +
            'assp = Atemschutzsammelplatz',
        },
        name: { type: SchemaType.STRING, description: 'Name/label for the marker' },
        beschreibung: { type: SchemaType.STRING, description: 'Description (only kind marker)' },
        zeichen: { type: SchemaType.STRING, description: 'Tactical sign identifier (only kind marker)' },
        color: { type: SchemaType.STRING, description: 'Color in hex format (only kind marker)' },
        position: positionSchema,
        layer: LAYER_SCHEMA,
        values: FIELD_VALUES_SCHEMA,
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
        name: {
          type: SchemaType.STRING,
          description: 'Vehicle designation without the fire department (e.g., TLFA 4000, KLF)',
        },
        fw: {
          type: SchemaType.STRING,
          description: FW_DESCRIPTION,
        },
        besatzung: {
          type: SchemaType.STRING,
          description:
            'Crew without the commander — the number behind the colon of the ' +
            'Austrian notation "1:8", so "8"',
        },
        kategorie: {
          type: SchemaType.STRING,
          description:
            'Kind of resource: fahrzeug, boot, anhaenger or aufbau. Derived ' +
            'from the name when omitted',
        },
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
    description:
      'Add an entry to the Einsatztagebuch (operational diary). Use for a REPORT: ' +
      'something the user states has happened, addressed to the record. This is the ' +
      'default action for a report that matches no other tool. NEVER for a question ' +
      'asked of you - a question is answered with answerQuestion, even when it is ' +
      'about your own abilities. NEVER for a fragment: if the transcript does not ' +
      'form a sensible report on its own, ask with askClarification instead of ' +
      'filing it. Speech recognition loses the beginning of a sentence, and a half ' +
      'understood sentence in the diary is a false entry in the legal record.',
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
        fw: { type: SchemaType.STRING, description: FW_DESCRIPTION },
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
    name: 'createFahrtenbuchEntry',
    description:
      'Record a trip in the Fahrtenbuch (the fire department\'s driver log). ' +
      'This is NOT a map element — use it for "Fahrtenbucheintrag", "Fahrt ' +
      'eintragen", "Kilometerstand eintragen". The vehicle is named as it is ' +
      'kept in the Fahrtenbuch master data; when the name does not match, the ' +
      'result lists the vehicles that exist. Without a stated purpose the trip ' +
      'is booked on the current Einsatz.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fahrzeug: {
          type: SchemaType.STRING,
          description: 'Vehicle name as spoken, e.g. "RLFA" or "MZB"',
        },
        zaehlerstaende: {
          type: SchemaType.ARRAY,
          description:
            'Counter readings taken on return. Pass what the user said, ' +
            'never a guessed or computed value',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              zaehler: {
                type: SchemaType.STRING,
                description:
                  'Which counter, e.g. "Kilometerstand" or "Lenzpumpe ' +
                  'Steuerbord". Omit for a vehicle with a single counter',
              },
              stand: {
                type: SchemaType.NUMBER,
                description: 'The reading on return, as spoken',
              },
              startStand: {
                type: SchemaType.NUMBER,
                description:
                  'The reading at departure. Only needed when the vehicle has ' +
                  'no earlier trip — otherwise it is taken from the last one',
              },
            },
            required: ['stand'],
          },
        },
        betriebsmittel: {
          type: SchemaType.ARRAY,
          description:
            'Fuel and fluids taken on this trip, in litres — Diesel, Benzin, ' +
            'AdBlue, Öl',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              art: {
                type: SchemaType.STRING,
                description:
                  'What was filled up. Omit for a vehicle that only takes one',
              },
              menge: { type: SchemaType.NUMBER, description: 'Litres' },
            },
            required: ['menge'],
          },
        },
        fahrer: {
          type: SchemaType.STRING,
          description:
            'Driver. "ich" or omitted = the logged in user',
        },
        mitfahrer: {
          type: SchemaType.ARRAY,
          description: 'Further crew members on this trip',
          items: { type: SchemaType.STRING },
        },
        zweck: {
          type: SchemaType.STRING,
          enum: ['einsatz', 'uebung', 'versorgung', 'sonstiges'],
          description:
            'Purpose of the trip. Defaults to einsatz, which links the trip to ' +
            'the current Einsatz. Any other purpose needs a ziel',
        },
        ziel: {
          type: SchemaType.STRING,
          description: 'Where the trip went. Required unless zweck is einsatz',
        },
        abfahrt: {
          type: SchemaType.STRING,
          description:
            'Departure time. Defaults to the alert time of the Einsatz',
        },
        ankunft: {
          type: SchemaType.STRING,
          description: 'Arrival time back at the station',
        },
        hinweise: { type: SchemaType.STRING, description: 'Remarks' },
        trotzdemEintragen: {
          type: SchemaType.BOOLEAN,
          description:
            'Record although a trip of this vehicle is already on file for ' +
            'this Einsatz. Only after the user confirmed the second trip',
        },
      },
      required: ['fahrzeug'],
    },
  },
  {
    name: 'getFahrtenbuchCounters',
    description:
      'Look up the counter readings of the last recorded trip — the answer to ' +
      '"Wie ist der Kilometerstand vom RLFA?". Also the way to check a reading ' +
      'before recording a trip. Without a vehicle it reports every vehicle.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        fahrzeug: {
          type: SchemaType.STRING,
          description:
            'Vehicle name as spoken. Omit to get every vehicle of the group',
        },
      },
    },
  },
  {
    name: 'createAtemschutzTrupp',
    description:
      'Register a breathing apparatus team (Atemschutztrupp) for the time ' +
      'monitoring (Atemschutzüberwachung). This is NOT a map element — not ' +
      'createTacticalUnit, not createMarker with kind assp. The team starts in state bereit; ' +
      'the speaker takes over its time monitoring and gets its warnings.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: {
          type: SchemaType.STRING,
          description: 'Team designation as spoken, e.g. "Trupp 1" or "Angriffstrupp"',
        },
        fireDepartment: {
          type: SchemaType.STRING,
          description:
            'Fire department of the team. Omit for the own fire department of the Einsatz',
        },
        members: {
          type: SchemaType.ARRAY,
          description: 'Names of the team members, usually three. At least one is required',
          items: { type: SchemaType.STRING },
        },
        unit: {
          type: SchemaType.STRING,
          description: 'Vehicle or tactical unit the team belongs to, e.g. "RLFA"',
        },
        note: { type: SchemaType.STRING, description: 'Remark about the team' },
      },
      required: ['members'],
    },
  },
  {
    name: 'setAtemschutzTruppStatus',
    description:
      'Change the state of a breathing apparatus team: assign it to a unit ' +
      '(zugeteilt), send it in under breathing apparatus (imEinsatz — this ' +
      'starts the time monitoring), bring it back (zurueck), make a returned ' +
      'team ready again (bereit) or sign it off (abgemeldet). A returned team ' +
      'sent in again gets a new deployment row automatically.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        trupp: {
          type: SchemaType.STRING,
          description:
            'Which team, as spoken — its name or a member name. Omit only when ' +
            'exactly one team can be meant',
        },
        status: {
          type: SchemaType.STRING,
          enum: TRUPP_STATUSES,
          description:
            'Target state: bereit, zugeteilt, imEinsatz, zurueck or abgemeldet',
        },
        unit: {
          type: SchemaType.STRING,
          description: 'Vehicle or tactical unit the team is assigned to',
        },
        pressure: {
          type: SchemaType.NUMBER,
          description:
            'Lowest cylinder pressure in the team in bar, as spoken — at ' +
            'handover, departure or return depending on the state',
        },
        mission: {
          type: SchemaType.STRING,
          description: 'The order — what the team does, e.g. "Menschenrettung"',
        },
        target: {
          type: SchemaType.STRING,
          description: 'Where the team goes, e.g. "Keller Stiegenhaus links"',
        },
        monitoredBy: {
          type: SchemaType.STRING,
          description: 'Who keeps the time monitoring, e.g. "Maschinist RLFA"',
        },
        time: {
          type: SchemaType.STRING,
          description:
            'Time of the change as HH:MM when it was stated. Omit for now',
        },
      },
      required: ['status'],
    },
  },
  {
    name: 'recordAtemschutzTruppReport',
    description:
      'Record a radio report of a breathing apparatus team in action: a ' +
      'pressure reading, arrival at the target, the start of the withdrawal ' +
      'or a note ("starke Verrauchung"). A report may carry any of these. ' +
      'Only for teams in state imEinsatz.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        trupp: {
          type: SchemaType.STRING,
          description:
            'Which team, as spoken. Omit only when exactly one team is in action',
        },
        pressure: {
          type: SchemaType.NUMBER,
          description: 'Lowest cylinder pressure in the team in bar, as spoken',
        },
        atTarget: {
          type: SchemaType.BOOLEAN,
          description:
            'The team reports it has reached its target. Not the same as ' +
            '"task done" — only when the arrival was reported',
        },
        withdrawing: {
          type: SchemaType.BOOLEAN,
          description: 'The team reports it has started to withdraw',
        },
        note: { type: SchemaType.STRING, description: 'Free text of the report' },
        logToDiary: {
          type: SchemaType.BOOLEAN,
          description:
            'Also write a free report into the Einsatztagebuch. Arrival and ' +
            'withdrawal go there anyway',
        },
        recordAnyway: {
          type: SchemaType.BOOLEAN,
          description:
            'Record although the value looked implausible. Only after the ' +
            'user confirmed it',
        },
      },
    },
  },
  {
    name: 'updateItem',
    description:
      'Update an existing item on the map: name, color, description, position, ' +
      'rotation (vehicles and Rohre only), its layer, the data fields of its ' +
      'layer, and the fields of its type. Set only what the user changes',
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
            rotation: {
              type: SchemaType.NUMBER,
              description:
                'Set the rotation to this angle in degrees, clockwise, 0 = ' +
                'upright. Only vehicles and Rohre rotate',
            },
            rotateBy: {
              type: SchemaType.NUMBER,
              description:
                'Rotate by this many degrees from the current rotation: ' +
                'positive = clockwise ("nach rechts"), negative = ' +
                'counter-clockwise ("nach links")',
            },
            layer: {
              type: SchemaType.STRING,
              description: 'Move the item to this layer (name from context.layers)',
            },
            values: FIELD_VALUES_SCHEMA,
            fw: { type: SchemaType.STRING, description: 'vehicle, tacticalUnit: ' + FW_DESCRIPTION },
            kategorie: {
              type: SchemaType.STRING,
              description: 'vehicle: fahrzeug, boot, anhaenger or aufbau',
            },
            besatzung: {
              type: SchemaType.STRING,
              description: 'vehicle: crew without the commander, "1:8" is "8"',
            },
            ats: { type: SchemaType.NUMBER, description: 'vehicle, tacticalUnit: breathing apparatus carriers' },
            alarmierung: {
              type: SchemaType.STRING,
              description: 'vehicle, tacticalUnit: alert time, "14:30" or "jetzt"',
            },
            eintreffen: {
              type: SchemaType.STRING,
              description: 'vehicle, tacticalUnit: arrival time, "14:30" or "jetzt"',
            },
            abruecken: {
              type: SchemaType.STRING,
              description: 'vehicle, tacticalUnit: departure time, "14:30" or "jetzt"',
            },
            fremd: { type: SchemaType.BOOLEAN, description: 'vehicle: belongs to another organisation' },
            unitType: {
              type: SchemaType.STRING,
              enum: ['einheit', 'trupp', 'gruppe', 'zug', 'bereitschaft', 'abschnitt', 'bezirk', 'lfv', 'oebfv'],
              description: 'tacticalUnit: kind of unit',
            },
            mann: { type: SchemaType.NUMBER, description: 'tacticalUnit: crew strength' },
            fuehrung: { type: SchemaType.STRING, description: 'tacticalUnit: unit commander' },
            art: { type: SchemaType.STRING, enum: ['C', 'B', 'Wasserwerfer'], description: 'rohr: type' },
            durchfluss: { type: SchemaType.NUMBER, description: 'rohr: flow rate in l/min' },
            zeichen: { type: SchemaType.STRING, description: 'marker: tactical sign' },
            showLabel: { type: SchemaType.BOOLEAN, description: 'marker: show the name on the map' },
            radius: { type: SchemaType.NUMBER, description: 'circle: radius in meters' },
            fill: { type: SchemaType.BOOLEAN, description: 'circle: filled' },
            opacity: { type: SchemaType.NUMBER, description: 'circle: opacity in percent' },
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
    name: 'calculateStrahlenschutz',
    description:
      'Radiation protection calculations. Pick the formula with formel and give ' +
      'the known values; the missing one is calculated. ' +
      'abstand: inverse square law D1² × R1 = D2² × R2, give 3 of d1, r1, d2, r2. ' +
      'schutzwert: shielding R = R0 / S^n, give 3 of r0, r, s, n. ' +
      'aufenthaltszeit: stay time t = D / R, give 2 of t, d, r. ' +
      'nuklid: dose rate in 1 m from activity (Ḣ = Γ × A), give nuclide and ' +
      'either activity or doseRate.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        formel: {
          type: SchemaType.STRING,
          enum: ['abstand', 'schutzwert', 'aufenthaltszeit', 'nuklid'],
          description: 'Which formula to calculate',
        },
        d1: { type: SchemaType.NUMBER, description: 'abstand: distance 1 in m' },
        r1: { type: SchemaType.NUMBER, description: 'abstand: dose rate 1 in µSv/h' },
        d2: { type: SchemaType.NUMBER, description: 'abstand: distance 2 in m' },
        r2: { type: SchemaType.NUMBER, description: 'abstand: dose rate 2 in µSv/h' },
        r0: { type: SchemaType.NUMBER, description: 'schutzwert: dose rate without shielding' },
        s: { type: SchemaType.NUMBER, description: 'schutzwert: Schutzwert of the material' },
        n: { type: SchemaType.NUMBER, description: 'schutzwert: number of layers' },
        r: {
          type: SchemaType.NUMBER,
          description:
            'schutzwert: dose rate with shielding; aufenthaltszeit: dose rate in mSv/h',
        },
        t: { type: SchemaType.NUMBER, description: 'aufenthaltszeit: stay time in hours' },
        d: { type: SchemaType.NUMBER, description: 'aufenthaltszeit: permitted dose in mSv' },
        nuclide: {
          type: SchemaType.STRING,
          description: 'nuklid: name of the nuclide (e.g. Cs-137, Co-60, Am-241)',
        },
        activity: { type: SchemaType.NUMBER, description: 'nuklid: activity in GBq' },
        doseRate: { type: SchemaType.NUMBER, description: 'nuklid: dose rate in 1 m in µSv/h' },
      },
      required: ['formel'],
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
    name: 'findItems',
    description:
      'Look up items of this Einsatz with their details: coordinates, times, ' +
      'measured values, diary text. The context only holds an overview without ' +
      'coordinates, measurement points or older diary entries - use this before ' +
      'answering a question that needs those details. Read-only',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        type: {
          type: SchemaType.STRING,
          description: 'Item type, e.g. vehicle, marker, rohr, diary, gb, tacticalUnit, circle',
        },
        name: {
          type: SchemaType.STRING,
          description: 'Part of the name, fire department or description',
        },
        layer: { type: SchemaType.STRING, description: 'Name of the layer (context.layers)' },
        field: {
          type: SchemaType.STRING,
          description: 'Data field of the layer to filter or sort by, e.g. "dosisleistung"',
        },
        min: { type: SchemaType.NUMBER, description: 'Only values of field at least this' },
        max: { type: SchemaType.NUMBER, description: 'Only values of field at most this' },
        unit: {
          type: SchemaType.STRING,
          description: 'Unit of min/max as spoken, e.g. "µSv/h"; converted to the unit of the field',
        },
        position: positionSchema,
        radius: {
          type: SchemaType.NUMBER,
          description: 'Only items within this many meters of position',
        },
        sort: {
          type: SchemaType.STRING,
          enum: ['newest', 'nearest', 'highest', 'lowest'],
          description:
            'newest first (default), nearest to position, highest or lowest value of field',
        },
        limit: { type: SchemaType.NUMBER, description: 'How many items, default 10, max 50' },
      },
    },
  },
  {
    name: 'answerQuestion',
    description:
      'Answer a question. Use this whenever the user asks something rather than giving ' +
      'a command - about the firecall data, about the map, or about what you can do ' +
      'for them. Never file a question as a diary entry.',
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
- "links/rechts neben dem X", "oberhalb/unterhalb von X" = nearItem mit itemName und
  direction left/right/above/below; ein genannter Abstand ("10 Meter links") = distance.
  Himmelsrichtungen ("nördlich", "nordöstlich", "südwestlich") = direction north,
  northeast, southwest usw. Gilt auch beim Verschieben mit updateItem.
- "Weiterer Messpunkt 10 m nordöstlich" ohne genanntes Element = vom zuletzt angelegten
  aus: nearItem mit direction und distance, itemName LEER lassen (nicht "Messung" oder
  "Datenpunkt" - so heißen viele Punkte). Gib die Lage so wieder, wie die Rückmeldung
  sie nennt, auch wenn der Bezug fehlte.
- Eine Korrektur wie "nein, links" ist ein neuer Werkzeugaufruf. Sage nie, ein
  Element sei verschoben oder geändert, ohne dass das Werkzeug in diesem Zug
  aufgerufen wurde und Erfolg meldet. Gib wieder, was die Rückmeldung sagt.
- Ohne jede Ortsangabe bei einer Messung oder Suche: auto als position.type
- Für Adresssuche: verwende searchAddress (erstellt Marker und schwenkt Karte dorthin)

Verfügbare Elemente:
- marker: Taktische Zeichen, allgemeine Marker (createMarker)
- el: Einsatzleitung-Marker (createMarker mit kind el)
- assp: Atemschutzsammelplatz (createMarker mit kind assp)
- vehicle: Fahrzeuge wie TLFA, KLF, etc. (createVehicle)
- rohr: Wasserabgabestellen C-Rohr, B-Rohr, Wasserwerfer (createRohr)
- diary: Einsatztagebuch-Einträge (createDiary)
- gb: Geschäftsbuch-Einträge (createGb)
- circle: Kreise mit Radius (createCircle)
- tacticalUnit: Taktische Einheiten wie Trupp, Gruppe, Zug, Abschnitt (createTacticalUnit) -
  ein Kartenelement. Ein Atemschutztrupp zur Überwachung ist createAtemschutzTrupp

Aktionen:
- searchAddress: Adresse suchen, Marker erstellen und Karte dorthin schwenken
- searchWaterSupply: Hydranten, Saugstellen und Löschteiche im Umkreis suchen
- proposeHoseLine: Löschleitung als Entwurf vorschlagen
- createFahrtenbuchEntry: Fahrt ins Fahrtenbuch eintragen ("Fahrtenbucheintrag",
  "Kilometerstand", "getankt"). NICHT createVehicle - das legt ein Fahrzeug auf
  der Karte an. Gib Zählerstände und Tankmengen so weiter, wie sie gesagt
  wurden; rechne nichts um.
- getFahrtenbuchCounters: Letzten Kilometer- bzw. Zählerstand eines Fahrzeugs
  nachsehen. Fragen nach einem Kilometerstand NIEMALS mit answerQuestion
  beantworten - die Zahl steht nur im Fahrtenbuch.
- createAtemschutzTrupp: Atemschutztrupp für die Atemschutzüberwachung anlegen
  ("Trupp anlegen", "neuer Atemschutztrupp"). NICHT createTacticalUnit - das
  legt eine taktische Einheit auf der Karte an. NICHT createMarker mit kind assp -
  das ist nur ein Marker für den Sammelplatz.
- setAtemschutzTruppStatus: Trupp zuteilen, in den Einsatz schicken ("geht
  unter Atemschutz", "Abmarsch"), zurückholen ("ist zurück", "wieder
  draußen"), wieder bereitstellen oder abmelden.
- recordAtemschutzTruppReport: Druckabfrage oder Meldung eines Trupps im
  Einsatz ("Trupp 1 hat 210 bar", "am Ziel", "treten den Rückzug an",
  "starke Verrauchung"). Eine Notiz zum Trupp während des Einsatzes ist eine
  solche Meldung. Druckwerte so weitergeben, wie sie gesagt wurden.
  Meldet das Ergebnis eine Auffälligkeit und fragt "trotzdem eintragen?",
  frage den Benutzer und rufe erst nach seinem Ja mit recordAnyway erneut auf.
- Die laufenden Trupps stehen im Kontext unter atemschutzTrupps. Fragen zum
  Truppstand ("wer ist noch drin?") beantwortest du daraus mit answerQuestion.
- updateItem: Bestehendes Element ändern (Name, Farbe, Beschreibung, Position,
  Drehung, Ebene, Messwerte und die Felder seines Typs wie Feuerwehr, Besatzung,
  Eintreffen, Durchfluss, Radius). "Um 45° nach rechts drehen" = rotateBy 45, "nach links" = rotateBy -45,
  "auf 90° drehen" = rotation 90. Drehbar sind Fahrzeuge und Rohre; die
  aktuelle Drehung steht im Kontext unter rotation.
- deleteItem: Bestehendes Element löschen

Ebenen und Messwerte:
- Die Ebenen des Einsatzes stehen im Kontext unter layers, mit ihren Datenfeldern
  (fields: key, label, unit). activeLayer ist die zuletzt gewählte Ebene.
- "Neue Messung 37 Millisievert pro Stunde" = createMarker mit values
  [{field: <passendes Feld, z.B. dosisleistung>, value: "37", unit: "mSv/h"}]. Ohne
  genannte Ebene kommt der Marker in activeLayer; nenne layer nur, wenn der Benutzer
  eine Ebene nennt ("in der Ebene Strahlenmessung"). Eine genannte Ebene wird danach
  zur aktiven. Ohne Ortsangabe bei einer Messung: auto als position.type (dort, wo
  der Benutzer steht). Als Name "Messung", wenn keiner genannt wird.
- Gib Zahl und Einheit so weiter, wie sie gesagt wurden, die Einheit als Zeichen
  (mSv/h, µSv/h, ppm). Rechne nicht selbst um - das Werkzeug rechnet in die Einheit
  des Felds.
- Einen Messwert ändern ("die letzte Messung war 40") = updateItem mit values.
- Berechnete Felder (type computed) setzt du nicht, sie werden mitgerechnet.
- Meldet das Werkzeug ein fehlendes Feld oder eine fehlende Ebene, frage nach und
  nenne die vorhandenen.
- answerQuestion: Fragen zum Einsatz beantworten (z.B. "Wie viele Fahrzeuge?", "Wann ist das TLFA eingetroffen?")
- findItems: Elemente mit Details nachsehen, bevor du antwortest, wenn die Antwort
  Koordinaten, Messwerte, Tagebuchtext oder ältere Einträge braucht ("Welche
  Messungen liegen über 10 µSv/h?" = findItems mit field, min, unit; "höchste
  Messung" = sort highest; "Was steht im Umkreis von 50 m?" = position und radius;
  "Was wurde um 14 Uhr gemeldet?" = type diary). Danach answerQuestion.
- calculate: Allgemeine Berechnungen mit mathjs (z.B. Wasserverbrauch, Mannschaftsstärke)
- Strahlenschutz-Berechnungen: Verwende calculateStrahlenschutz, nicht calculate. Wähle die Formel:
  - Dosisleistung in einem anderen Abstand -> formel abstand
  - Abschirmung/Schutzwert -> formel schutzwert
  - Aufenthaltszeit bei einer bestimmten Dosis -> formel aufenthaltszeit
  - Dosisleistung eines Nuklids (Aktivität) -> formel nuklid

Der Kontext ist ein Überblick, nicht der ganze Einsatz:
- existingItems: die benannten Elemente ohne Koordinaten und Messwerte -
  Fahrzeuge mit Feuerwehr (fw), Besatzung, ATS, Alarmierung, Eintreffen, Abrücken;
  Rohre mit Art und Durchfluss; taktische Einheiten mit Art, Feuerwehr, Stärke.
- itemCounts: Anzahl je Typ, auch von allem, was nicht im Überblick steht.
- latestDiary: die letzten Einträge im Einsatztagebuch, ohne Text.
- layers: bei Messebenen nur measurements (Anzahl) und latest (letzte Messung);
  die einzelnen Messpunkte fehlen.
Was dort fehlt, holst du mit findItems. Behaupte nie, es gebe etwas nicht, nur
weil es nicht im Überblick steht.

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
Wenn der Benutzer keine bestimmte Funktion aufruft und keine Frage stellt, handelt es sich wahrscheinlich um eine Meldung.
Erstelle in diesem Fall automatisch einen Tagebucheintrag (createDiary) mit art="M".
Zwei Ausnahmen, die dem vorgehen:
- Eine Frage wird beantwortet (answerQuestion), niemals abgelegt. Das gilt auch
  für Fragen danach, was du kannst - auch die sind keine Meldung.
- Ein Bruchstück wird nicht abgelegt. Ergibt das Gehörte für sich genommen keine
  sinnvolle Meldung, frage mit askClarification nach. Bei gesprochener Eingabe
  fehlt regelmäßig der Satzanfang; was übrig bleibt, sieht aus wie eine Meldung
  und wäre als Eintrag im Nachweis schlicht falsch.
- Bei kurzen Texten: verwende name für den Inhalt
- Bei langen Texten (mehr als ein kurzer Satz): erstelle einen kurzen Titel in name und setze den vollständigen Text in beschreibung`;
