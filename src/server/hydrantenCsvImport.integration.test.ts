import { describe, it, expect } from 'vitest';
import { parseHydrantenCsv } from './hydrantenCsvParser';
import { convertCoordinates } from './hydrantenCsvConverter';
import { matchHydranten, type ExistingHydrant } from './hydrantenMatcher';

// Realistic WLV CSV with 2 header lines (description row on line 2) and decimal commas.
// Coordinates are from the Neusiedl am See area (GK M34 / EPSG:31256).
const TEST_CSV = `Wasserversorger,Ortsnetz / Versorgungseinheit,ART,Hydranten-Nr.,Gemeinde-WZ,Dimension,Leitungsart,Stat. Druck ,Dyn. Druck,Druck gemessen am,GOK ,X-Koordinate,Y-Koordinate
"(WV, WG, Gemeinde)",(Gemeinde),(Überflurhydrant;Unterflurhydrant),,(JA; NEIN),(DN 80; DN 100),(Ringleitung;   Endstrang),[bar],[bar],,[m ü.A.],(GK M34),(GK M34)
Test Wasserverband,Testgemeinde,Überflurhydrant,TEST-HY1,---,80,Endstrang,"5,6",4,17/10/2024,"116,52","37648,217","310270,421"
Test Wasserverband,Testgemeinde,Unterflurhydrant,TEST-HY2,ja,100,Ringleitung,"4,8","3,5",18/10/2024,"120,3","37700,5","310350,8"
Test Wasserverband,Testgemeinde,Überflurhydrant,TEST-HY3,---,80,Ringleitung,"5,1","4,2",19/10/2024,"118,9","37750,0","310400,0"`;

// We need the converted coordinates for TEST-HY2 to set up a nearby alias match.
// TEST-HY2 CSV coords: X=37700.5, Y=310350.8 -> approx lat 47.930, lng 16.836
const existingDocs: ExistingHydrant[] = [
  // Direct match — same document key
  {
    id: 'testgemeinde_test-hy1',
    ortschaft: 'Testgemeinde',
    hydranten_nummer: 'TEST-HY1',
    leistung: 900,
  },
  // Alias match — old key with short ortschaft prefix, coordinates ~50m away
  {
    id: 'tgtest-hy2',
    ortschaft: 'TG',
    hydranten_nummer: 'TEST-HY2',
    lat: 47.9307,  // approx same location as TEST-HY2 CSV coords
    lng: 16.8367,
    leistung: 750,
  },
  // TEST-HY3 has no existing match — should be "new"
];

describe('Hydranten CSV Import Integration', () => {
  // Run the full pipeline once and reuse results across tests
  const parsed = parseHydrantenCsv(TEST_CSV);
  const converted = convertCoordinates(parsed);

  describe('full pipeline with no existing data (all new)', () => {
    const results = matchHydranten(converted, []);

    it('produces 3 results from 3 CSV rows', () => {
      expect(results).toHaveLength(3);
    });

    it('marks all records as new', () => {
      for (const r of results) {
        expect(r.status).toBe('new');
        expect(r.duplicateDocId).toBeUndefined();
        expect(r.preservedFields).toEqual({});
      }
    });
  });

  describe('full pipeline with existing records (updates and aliases)', () => {
    const results = matchHydranten(converted, existingDocs);

    it('produces 3 results', () => {
      expect(results).toHaveLength(3);
    });

    it('detects direct match for TEST-HY1 as update', () => {
      const hy1 = results.find((r) => r.row.hydranten_nummer === 'TEST-HY1')!;
      expect(hy1).toBeDefined();
      expect(hy1.status).toBe('update');
      expect(hy1.duplicateDocId).toBeUndefined();
    });

    it('preserves leistung from direct match', () => {
      const hy1 = results.find((r) => r.row.hydranten_nummer === 'TEST-HY1')!;
      expect(hy1.preservedFields).toEqual({ leistung: 900 });
    });

    it('detects alias match for TEST-HY2 with duplicateDocId', () => {
      const hy2 = results.find((r) => r.row.hydranten_nummer === 'TEST-HY2')!;
      expect(hy2).toBeDefined();
      expect(hy2.status).toBe('update');
      expect(hy2.duplicateDocId).toBe('tgtest-hy2');
    });

    it('preserves leistung from alias match', () => {
      const hy2 = results.find((r) => r.row.hydranten_nummer === 'TEST-HY2')!;
      expect(hy2.preservedFields).toEqual({ leistung: 750 });
    });

    it('marks TEST-HY3 as new (no existing match)', () => {
      const hy3 = results.find((r) => r.row.hydranten_nummer === 'TEST-HY3')!;
      expect(hy3).toBeDefined();
      expect(hy3.status).toBe('new');
      expect(hy3.duplicateDocId).toBeUndefined();
      expect(hy3.preservedFields).toEqual({});
    });
  });

  describe('2 header lines handling', () => {
    it('skips the description row and parses exactly 3 data rows', () => {
      expect(parsed).toHaveLength(3);
    });

    it('does not include description row content in any parsed field', () => {
      for (const row of parsed) {
        expect(row.ortschaft).not.toContain('Gemeinde)');
        expect(row.typ).not.toContain('Überflurhydrant;');
      }
    });
  });

  describe('decimal comma parsing', () => {
    it('parses statischer_druck correctly', () => {
      const hy1 = parsed.find((r) => r.hydranten_nummer === 'TEST-HY1')!;
      expect(hy1.statischer_druck).toBeCloseTo(5.6);
    });

    it('parses meereshoehe correctly', () => {
      const hy1 = parsed.find((r) => r.hydranten_nummer === 'TEST-HY1')!;
      expect(hy1.meereshoehe).toBeCloseTo(116.52);
    });

    it('parses raw_x coordinate with decimal comma', () => {
      const hy1 = parsed.find((r) => r.hydranten_nummer === 'TEST-HY1')!;
      expect(hy1.raw_x).toBeCloseTo(37648.217);
    });

    it('parses raw_y coordinate with decimal comma', () => {
      const hy1 = parsed.find((r) => r.hydranten_nummer === 'TEST-HY1')!;
      expect(hy1.raw_y).toBeCloseTo(310270.421);
    });

    it('parses dimension as integer', () => {
      const hy2 = parsed.find((r) => r.hydranten_nummer === 'TEST-HY2')!;
      expect(hy2.dimension).toBe(100);
    });
  });

  describe('coordinate conversion to WGS84', () => {
    it('converts all 3 rows', () => {
      expect(converted).toHaveLength(3);
    });

    it('produces valid Austrian latitude (roughly 47.8-47.95)', () => {
      for (const row of converted) {
        expect(row.lat).toBeGreaterThan(47.8);
        expect(row.lat).toBeLessThan(47.95);
      }
    });

    it('produces valid Austrian longitude (roughly 16.7-16.9)', () => {
      for (const row of converted) {
        expect(row.lng).toBeGreaterThan(16.7);
        expect(row.lng).toBeLessThan(16.9);
      }
    });

    it('generates a geohash for each row', () => {
      for (const row of converted) {
        expect(row.geohash).toBeTruthy();
        expect(typeof row.geohash).toBe('string');
        expect(row.geohash.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('sets name to documentKey', () => {
      for (const row of converted) {
        expect(row.name).toBe(row.documentKey);
      }
    });
  });

  describe('document key generation', () => {
    it('generates lowercase keys with underscores', () => {
      const hy1 = parsed.find((r) => r.hydranten_nummer === 'TEST-HY1')!;
      expect(hy1.documentKey).toBe('testgemeinde_test-hy1');
    });

    it('generates unique keys for each row', () => {
      const keys = parsed.map((r) => r.documentKey);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});
