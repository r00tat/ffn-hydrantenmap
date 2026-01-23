import { FunctionDeclaration, SchemaType } from 'firebase/ai';

// Position schema used by multiple tools
const positionSchema = {
  type: SchemaType.OBJECT,
  properties: {
    type: {
      type: SchemaType.STRING,
      enum: ['mapCenter', 'userPosition', 'nearItem', 'address', 'coordinates'],
      description: 'How to resolve the position',
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
    description: 'Add an entry to the Einsatztagebuch (operational diary)',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: 'Content of the diary entry' },
        art: {
          type: SchemaType.STRING,
          enum: ['M', 'B', 'F'],
          description: 'Type: M=Meldung, B=Befehl, F=Feststellung',
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
];

export const AI_SYSTEM_PROMPT = `Du bist ein Einsatz-Assistent für die Freiwillige Feuerwehr.
Du hilfst beim Erstellen und Verwalten von Elementen auf der Einsatzkarte.

Regeln:
- Antworte kurz und präzise
- Führe Aktionen sofort aus, wenn der Befehl klar ist
- Bei Unklarheiten: verwende askClarification mit konkreten Optionen
- Verwende die bereitgestellten Tools für alle Kartenaktionen
- Positionen ohne Angabe: verwende mapCenter als position.type
- "bei mir" / "hier" = userPosition als position.type
- Referenzen wie "daneben", "neben dem X" = nearItem als position.type mit itemName
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

Aktionen:
- searchAddress: Adresse suchen, Marker erstellen und Karte dorthin schwenken

Für Referenzen auf bestehende Elemente nutze itemName oder itemId.
Der Kontext enthält existingItems mit allen aktuellen Elementen.`;
