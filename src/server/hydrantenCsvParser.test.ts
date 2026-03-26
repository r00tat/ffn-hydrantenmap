import { describe, it, expect } from 'vitest';
import { parseHydrantenCsv, type ParsedHydrantRow } from './hydrantenCsvParser';

const SAMPLE_CSV = `Wasserversorger,Ortsnetz / Versorgungseinheit,ART,Hydranten-Nr.,Gemeinde-WZ,Dimension,Leitungsart,Stat. Druck ,Dyn. Druck,Druck gemessen am,GOK ,X-Koordinate,Y-Koordinate
"(WV, WG, Gemeinde)",(Gemeinde),(Überflurhydrant;Unterflurhydrant),,(JA; NEIN),(DN 80; DN 100),(Ringleitung;   Endstrang),[bar],[bar],,[m ü.A.],(GK M34),(GK M34)
Wasserleitungsverband Nördl. Burgenland,Neusiedl,Überflurhydrant,HY1,---,80,Endstrang,"5,6",4,17/10/2024,"116,52","37648,217","310270,421"
Wasserleitungsverband Nördl. Burgenland,Neusiedl,Überflurhydrant,HY10,ja,80,Ringleitung,"5,5","4,5",17/10/2024,"116,65","38286,313","311524,357"`;

describe('parseHydrantenCsv', () => {
  it('parses CSV and maps fields correctly', () => {
    const result = parseHydrantenCsv(SAMPLE_CSV);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      ortschaft: 'Neusiedl',
      typ: 'Überflurhydrant',
      hydranten_nummer: 'HY1',
      fuellhydrant: 'NEIN',
      dimension: 80,
      leitungsart: 'Endstrang',
      statischer_druck: 5.6,
      dynamischer_druck: 4,
      druckmessung_datum: '17/10/2024',
      meereshoehe: 116.52,
      raw_x: 37648.217,
      raw_y: 310270.421,
    });
  });

  it('maps Gemeinde-WZ ja to JA', () => {
    const result = parseHydrantenCsv(SAMPLE_CSV);
    expect(result[1].fuellhydrant).toBe('JA');
  });

  it('skips description row', () => {
    const result = parseHydrantenCsv(SAMPLE_CSV);
    expect(result.every((r) => r.ortschaft !== '(Gemeinde)')).toBe(true);
  });

  it('handles empty CSV', () => {
    const headerOnly = SAMPLE_CSV.split('\n').slice(0, 2).join('\n');
    const result = parseHydrantenCsv(headerOnly);
    expect(result).toHaveLength(0);
  });

  it('generates document key from ortschaft + hydranten_nummer', () => {
    const result = parseHydrantenCsv(SAMPLE_CSV);
    expect(result[0].documentKey).toBe('neusiedl_hy1');
    expect(result[1].documentKey).toBe('neusiedl_hy10');
  });
});
