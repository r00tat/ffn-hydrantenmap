import 'server-only';

import {
  RescueDocument,
  RescueDocumentType,
  RescueVariant,
} from '../../common/rescue/types';

/**
 * Der Euro-Rescue-Katalog von Euro NCAP. Die API ist öffentlich lesbar, aber
 * undokumentiert — jeder Aufrufer muss damit rechnen, dass sie ausfällt oder
 * ihr Format ändert. Siehe docs/rettungskarten.md.
 */
export const EURO_RESCUE_BASE_URL =
  'https://api.rescue.euroncap.com/euro-rescue';

const VARIANTS_URL = `${EURO_RESCUE_BASE_URL}/variants`;

/**
 * Der Katalog ist rund 4 MB groß und ändert sich im Wochenrhythmus. Einmal
 * täglich neu zu laden reicht; die PDFs selbst holt der Browser ohnehin
 * jedes Mal frisch von Euro NCAP.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface RawDocument {
  url?: string;
  language?: string;
  type?: string;
}

interface RawVariant {
  id?: string;
  name?: string;
  make_name?: string;
  model_name?: string;
  body_type?: string;
  build_year_from?: string;
  build_year_until?: string;
  doors?: string;
  powertrain?: string;
  picture_url?: string;
  documents?: RawDocument[];
}

interface CatalogCache {
  variants: RescueVariant[];
  loadedAt: number;
}

let cache: CatalogCache | null = null;
let inflight: Promise<RescueVariant[]> | null = null;

/** Nur für Tests: verwirft den Prozess-Cache. */
export function __resetRescueCatalogCache(): void {
  cache = null;
  inflight = null;
}

function parseYear(value: string | undefined): number | undefined {
  const year = Number.parseInt((value ?? '').trim(), 10);
  return Number.isFinite(year) && year > 1900 ? year : undefined;
}

function parseDocumentType(value: string | undefined): RescueDocumentType {
  return (value ?? '').toLowerCase().includes('guide') ? 'guide' : 'sheet';
}

/**
 * Nur `https:`-URLs übernehmen. Die Adressen kommen aus einer fremden,
 * nicht authentifizierten API und landen in der Oberfläche direkt in `href`
 * und `src` — ein `javascript:` oder `data:` von dort liefe in unserem
 * Origin. Der Host bleibt bewusst ungeprüft: die API liefert die Dokumente
 * teils von `api.rescue.euroncap.com`, teils aus dem Azure-Blob-Storage von
 * Euro NCAP, und eine Host-Liste würde beim nächsten Umzug still alles
 * ausblenden.
 */
function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function mapDocuments(raw: RawDocument[] | undefined): RescueDocument[] {
  const documents: RescueDocument[] = [];
  for (const doc of raw ?? []) {
    const url = safeUrl(doc?.url);
    if (!url) continue;
    documents.push({
      url,
      language: (doc.language ?? '').toUpperCase(),
      type: parseDocumentType(doc.type),
    });
  }
  return documents;
}

/** Nicht identifizierbare Einträge fallen raus, alles andere wird tolerant gelesen. */
function mapVariants(raw: RawVariant[]): RescueVariant[] {
  const variants: RescueVariant[] = [];
  for (const entry of raw) {
    if (!entry?.id || !entry.make_name) continue;
    const modelName = entry.model_name ?? entry.name ?? '';
    variants.push({
      id: entry.id,
      makeName: entry.make_name,
      modelName,
      variantName: entry.name ?? modelName,
      bodyType: entry.body_type || undefined,
      buildYearFrom: parseYear(entry.build_year_from),
      buildYearUntil: parseYear(entry.build_year_until),
      doors: entry.doors || undefined,
      powertrain: entry.powertrain || undefined,
      pictureUrl: safeUrl(entry.picture_url),
      documents: mapDocuments(entry.documents),
    });
  }
  return variants;
}

async function fetchCatalog(): Promise<RescueVariant[]> {
  const res = await fetch(VARIANTS_URL, {
    headers: { Accept: 'application/json' },
    // Der Prozess-Cache unten ist die Instanz, die das steuert — der
    // fetch-Cache von Next würde uns nur eine zweite, unsichtbare Ebene
    // dazwischenlegen.
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Euro Rescue catalog request failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { Documents?: RawVariant[] };
  return mapVariants(body?.Documents ?? []);
}

/**
 * Der Variantenkatalog, aus dem Prozess-Cache. Läuft der Cache ab und
 * scheitert das Nachladen, bleiben die alten Daten in Verwendung — eine
 * Woche alte Rettungskarte ist besser als keine.
 */
export async function loadRescueCatalog(): Promise<RescueVariant[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.variants;
  }
  if (inflight) return inflight;

  inflight = fetchCatalog()
    .then((variants) => {
      cache = { variants, loadedAt: Date.now() };
      return variants;
    })
    .catch((err) => {
      if (cache) {
        console.error(
          'Euro Rescue catalog refresh failed, serving stale data:',
          err,
        );
        // Nächster Aufruf versucht es erneut, statt einen Tag lang zu warten.
        cache.loadedAt = Date.now() - CACHE_TTL_MS + 60_000;
        return cache.variants;
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
