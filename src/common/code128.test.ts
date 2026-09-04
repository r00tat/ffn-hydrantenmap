import { describe, expect, it } from 'vitest';
import { BitArray, Code128Reader } from '@zxing/library';
import {
  CODE128_QUIET_ZONE,
  Code128UnsupportedError,
  code128Path,
  code128Runs,
  code128Supported,
  code128Width,
} from './code128';

/**
 * Der Gegenbeweis zur Mustertabelle: Das erzeugte Symbol wird von einem
 * fremden Decoder gelesen.
 *
 * ZXing liegt als Abhängigkeit ohnehin im Projekt — es ist der Reader, der am
 * Sammelplatz auf iOS scannt. Eine Tabelle mit 107 Zeilen von Hand gegen die
 * Norm zu prüfen wäre unzuverlässig; sie gegen den Decoder zu prüfen, der die
 * Etiketten später wirklich liest, ist die Aussage, auf die es ankommt.
 */
function decode(text: string): string {
  const runs = code128Runs(text);
  const breite = code128Width(text) + 2 * CODE128_QUIET_ZONE;
  const row = new BitArray(breite);

  let x = CODE128_QUIET_ZONE;
  runs.forEach((laenge, i) => {
    // Gerade Läufe sind Striche, ungerade Lücken — `BitArray` startet hell.
    if (i % 2 === 0) row.setRange(x, x + laenge);
    x += laenge;
  });

  return new Code128Reader().decodeRow(0, row, undefined).getText();
}

describe('code128Runs', () => {
  it('beginnt mit einem Strich und endet mit einem Strich', () => {
    // Das Stoppzeichen hat sieben Läufe statt sechs — der Abschlussstrich
    // gehört dazu. Eine gerade Anzahl hieße: das Symbol endet in einer Lücke.
    const runs = code128Runs('2016-FL-035');
    expect(runs.length % 2).toBe(1);
  });

  it('ist so breit wie Start, Nutzdaten, Prüfzeichen und Stopp zusammen', () => {
    // Jedes Zeichen belegt 11 Module, das Stoppzeichen 13. Bei n Nutzzeichen
    // also 11 * (1 Start + n + 1 Prüfzeichen) + 13.
    expect(code128Width('ABC')).toBe(11 * (1 + 3 + 1) + 13);
    expect(code128Width('2016-FL-035')).toBe(11 * (1 + 11 + 1) + 13);
  });

  it('wirft bei einem Zeichen außerhalb von Codeset B', () => {
    // Ein Umlaut in einer Kennung ist nicht vorgesehen, aber eintippbar.
    expect(() => code128Runs('Flasche Grün')).toThrow(Code128UnsupportedError);
  });
});

describe('code128Runs — gegen den ZXing-Decoder gelesen', () => {
  it('liest eine Inventarnummer zurück', () => {
    expect(decode('2016-FL-035')).toBe('2016-FL-035');
  });

  it('liest eine Maskenkennung zurück', () => {
    expect(decode('2016-MU-046')).toBe('2016-MU-046');
  });

  it('liest eine ASSP-Flaschennummer mit Punkten zurück', () => {
    expect(decode('2.16.19')).toBe('2.16.19');
  });

  it('liest eine reine Ziffernfolge zurück', () => {
    expect(decode('21619')).toBe('21619');
  });

  it('liest eine Seriennummer mit Schrägstrich zurück', () => {
    expect(decode('2016/031')).toBe('2016/031');
  });

  it('liest ein einzelnes Zeichen zurück', () => {
    expect(decode('A')).toBe('A');
  });

  it('liest Klein- und Großbuchstaben samt Leerzeichen zurück', () => {
    expect(decode('PA 4000 alt')).toBe('PA 4000 alt');
  });
});

describe('code128Supported', () => {
  it('nimmt die druckbaren ASCII-Zeichen', () => {
    expect(code128Supported('2016-FL-035')).toBe(true);
    expect(code128Supported('a Z 9 . / -')).toBe(true);
  });

  it('lehnt Umlaute und Leerstrings ab', () => {
    expect(code128Supported('Grün')).toBe(false);
    expect(code128Supported('')).toBe(false);
    expect(code128Supported('   ')).toBe(false);
  });
});

describe('code128Path', () => {
  it('zeichnet einen Strich je gesetztem Lauf, in Modulkoordinaten', () => {
    const { path, width } = code128Path('A');
    expect(width).toBe(code128Width('A'));
    // Ein Pfad aus `M x,0 h b v1 h-b z`-Segmenten: so viele Striche wie
    // gerade Läufe — dieselbe Bauweise wie `qrCodePath`.
    const striche = code128Runs('A').filter((_, i) => i % 2 === 0).length;
    expect(path.match(/M/g)).toHaveLength(striche);
  });

  it('setzt den ersten Strich auf x = 0', () => {
    expect(code128Path('A').path.startsWith('M0,0')).toBe(true);
  });
});
