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

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

/** Strip HTML tags, decode entities, collapse whitespace. */
function normalizeCell(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extracts the hidden `fx` CSRF token from a form page, or null if absent. */
export function parseFx(html: string): string | null {
  const inputRe = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    if (!/\bname\s*=\s*["']fx["']/i.test(tag)) continue;
    const valueMatch = /\bvalue\s*=\s*["']([^"']*)["']/i.exec(tag);
    const value = valueMatch?.[1] ?? '';
    return value.length > 0 ? value : null;
  }
  return null;
}

/**
 * Parses the query response HTML into structured vehicles. Each
 * `<table class="table">` under "Daten aus Zulassung" is one vehicle
 * (two tables = Wechselkennzeichen). No table = no result.
 */
export function parseVehicleResult(html: string): VehicleResult {
  const vehicles: Vehicle[] = [];
  const tableRe =
    /<table\b[^>]*class\s*=\s*["'][^"']*\btable\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html)) !== null) {
    const tableInner = tm[1];
    const vehicle: Partial<Vehicle> = {};
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rowRe.exec(tableInner)) !== null) {
      const cellRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(rm[1])) !== null) {
        cells.push(normalizeCell(cm[1]));
      }
      if (cells.length < 2) continue;
      const key = LABEL_MAP[cells[0]];
      if (key) vehicle[key] = cells[1];
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
