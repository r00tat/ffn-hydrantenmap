/**
 * Normalisierung für den Abgleich der Zulassungsdaten (ÖBFV) mit dem
 * Euro-Rescue-Katalog. Beide Seiten schreiben Marken und Modelle
 * unterschiedlich: die Zulassung durchgehend in Großbuchstaben und teils
 * abgekürzt, Euro NCAP in der Schreibweise des Herstellers.
 */

/** Kleinschreibung, Diakritika weg, alles Nicht-Alphanumerische zu Leerzeichen. */
export function normalizeName(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Abkürzungen und abweichende Schreibweisen der Zulassungsdaten auf die
 * Schreibweise des Katalogs. Schlüssel und Werte sind bereits normalisiert.
 */
const MAKE_ALIASES: Record<string, string> = {
  vw: 'volkswagen',
  'vw volkswagen': 'volkswagen',
  mercedes: 'mercedes benz',
  'mercedes amg': 'mercedes benz',
  daimler: 'mercedes benz',
  landrover: 'land rover',
  'range rover': 'land rover',
  rangerover: 'land rover',
  'alfa romeo spa': 'alfa romeo',
  vauxhall: 'opel',
  'skoda auto': 'skoda',
  'byd auto': 'byd',
  'man truck bus': 'man',
  'renault trucks sas': 'renault trucks',
  'mercedes benz ag': 'mercedes benz',
  'bmw ag': 'bmw',
  'bayerische motoren werke': 'bmw',
  'vw nutzfahrzeuge': 'volkswagen',
  'seat sa': 'seat',
  'fiat chrysler': 'fiat',
  fca: 'fiat',
};

/** Normalisierte, aliasaufgelöste Marke. */
export function normalizeMake(value: string | undefined | null): string {
  const normalized = normalizeName(value);
  return MAKE_ALIASES[normalized] ?? normalized;
}

/** Plausibler Bereich für ein Erstzulassungs- bzw. Baujahr. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * Jahr aus der Erstzulassung. Die ÖBFV-Abfrage liefert `YYYY-MM-DD`; die
 * deutschen und reinen Jahresformate sind für importierte Daten mit drin.
 */
export function parseRegistrationYear(
  value: string | undefined | null,
): number | undefined {
  if (!value) return undefined;
  const match = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  return year >= MIN_YEAR && year <= MAX_YEAR ? year : undefined;
}

/**
 * Antriebsarten der Zulassung auf die `powertrain`-Werte des Katalogs
 * (`Electric`, `Gasoline/Diesel`, `Hybrid`, `Hybrid (Electric)`, `CNG`,
 * `LNG`, `LPG`, `FCEV`).
 */
const POWERTRAIN_KEYWORDS: { antrieb: RegExp; powertrain: RegExp }[] = [
  { antrieb: /wasserstoff|brennstoffzelle/, powertrain: /fcev/ },
  { antrieb: /hybrid/, powertrain: /hybrid/ },
  { antrieb: /elektro/, powertrain: /electric/ },
  { antrieb: /erdgas|cng/, powertrain: /cng|lng/ },
  { antrieb: /fluessiggas|flussiggas|lpg|autogas/, powertrain: /lpg/ },
  { antrieb: /diesel|benzin|otto|gasoline/, powertrain: /gasoline|diesel/ },
];

/**
 * Ob der Antrieb aus der Zulassung zum Antrieb der Katalogvariante passt.
 * Fehlt eine der beiden Angaben, gilt das als „passt nicht“ — der Antrieb
 * ist nur ein Zusatzkriterium und darf ohne Beleg nichts aufwerten.
 */
export function powertrainMatches(
  antrieb: string | undefined | null,
  powertrain: string | undefined | null,
): boolean {
  const a = normalizeName(antrieb);
  const p = normalizeName(powertrain);
  if (!a || !p) return false;
  for (const { antrieb: antriebRe, powertrain: powertrainRe } of POWERTRAIN_KEYWORDS) {
    if (antriebRe.test(a)) return powertrainRe.test(p);
  }
  return false;
}

/**
 * Modellbezeichnungen, die der Katalog anders schreibt als die Zulassung.
 * Der Katalog führt BMW nach Baureihe (`3 Series`) und Mercedes nach Klasse
 * (`C-Class`), die Zulassung dagegen die Typnummer (`320d`, `C 220 d`).
 * Die Funktion liefert den normalisierten Namen plus die Schreibweisen, unter
 * denen er im Katalog stehen könnte.
 */
export function modelNameCandidates(make: string, name: string): string[] {
  const model = normalizeName(name);
  if (!model) return [];

  const candidates = [model];
  const add = (candidate: string) => {
    if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
  };

  switch (normalizeMake(make)) {
    case 'bmw': {
      // 320d → 3 Series, 3er → 3 Series
      const series = /^([1-8])(?:\d{2}(?!\d)|er)/.exec(model);
      if (series) add(`${series[1]} series`);
      break;
    }
    case 'mercedes benz': {
      // C-Klasse → C-Class, C 220 d → C-Class, GLE 350 → GLE
      add(model.replace(/\bklasse\b/, 'class'));
      const single = /^([a-z]) ?\d{2,3}\b/.exec(model);
      if (single) add(`${single[1]} class`);
      const multi = /^([a-z]{2,3}) ?\d{2,3}\b/.exec(model);
      if (multi) add(multi[1]);
      break;
    }
  }

  return candidates;
}
