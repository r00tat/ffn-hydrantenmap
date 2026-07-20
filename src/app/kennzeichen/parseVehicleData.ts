import { JSDOM } from 'jsdom';

export interface Vehicle {
  antrieb: string;
  marke: string;
  name: string;
  type: string;
  hoechstMasse: string;
  erstzulassung: string;
  fin: string;
  variante: string;
  version: string;
}

export interface VehicleResult {
  vehicles: Vehicle[];
  noResult: boolean;
}

/** Maps the German row labels from feuerwehrapp.at to Vehicle keys. */
const LABEL_MAP: Record<string, keyof Vehicle> = {
  Antrieb: 'antrieb',
  Marke: 'marke',
  Name: 'name',
  Type: 'type',
  'Höchstzul. Masse': 'hoechstMasse',
  Erstzulassung: 'erstzulassung',
  FIN: 'fin',
  Variante: 'variante',
  Version: 'version',
};

function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts the hidden `fx` CSRF token from a form page, or null if absent. */
export function parseFx(html: string): string | null {
  const doc = new JSDOM(html).window.document;
  const input = doc.querySelector(
    'input[name="fx"]'
  ) as HTMLInputElement | null;
  const value = input?.getAttribute('value') ?? '';
  return value.length > 0 ? value : null;
}

/**
 * Parses the query response HTML into structured vehicles. Each
 * `<table class="table">` under "Daten aus Zulassung" is one vehicle
 * (two tables = Wechselkennzeichen). No table = no result.
 */
export function parseVehicleResult(html: string): VehicleResult {
  const doc = new JSDOM(html).window.document;
  const tables = Array.from(doc.querySelectorAll('table.table'));

  const vehicles: Vehicle[] = [];
  for (const table of tables) {
    const vehicle: Partial<Vehicle> = {};
    for (const row of Array.from(table.querySelectorAll('tr'))) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) continue;
      const label = normalize(cells[0].textContent);
      const key = LABEL_MAP[label];
      if (key) vehicle[key] = normalize(cells[1].textContent);
    }
    if (Object.keys(vehicle).length > 0) {
      vehicles.push({
        antrieb: vehicle.antrieb ?? '',
        marke: vehicle.marke ?? '',
        name: vehicle.name ?? '',
        type: vehicle.type ?? '',
        hoechstMasse: vehicle.hoechstMasse ?? '',
        erstzulassung: vehicle.erstzulassung ?? '',
        fin: vehicle.fin ?? '',
        variante: vehicle.variante ?? '',
        version: vehicle.version ?? '',
      });
    }
  }

  return { vehicles, noResult: vehicles.length === 0 };
}
