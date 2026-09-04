/**
 * Code-128-Encoder für die Geräteetiketten des Atemschutzes.
 *
 * Warum selbst gerechnet: `@zxing/library` liegt zwar im Projekt, bringt aber
 * nur Reader mit — im `MultiFormatWriter` ist alles außer QR auskommentiert.
 * Eine Bibliothek allein für 107 Zeilen Mustertabelle und eine Prüfziffer
 * aufzunehmen wäre unverhältnismäßig; dafür ist der Code hier rein, ohne DOM
 * und ohne Zustand, und gegen genau den Decoder getestet, der die Etiketten am
 * Sammelplatz später liest.
 *
 * **Nur Codeset B.** Es deckt die druckbaren ASCII-Zeichen ab und damit jede
 * vorkommende Kennung (`2016-FL-035`, `2.16.19`, `2016/031`). Codeset C würde
 * reine Ziffernpaare halb so breit drucken, aber die Inventarnummern sind
 * gemischt und die Umschaltlogik ist die Fehlerquelle, die man sich damit
 * einhandelt.
 */

/**
 * Die Balkenmuster der Werte 0–106, je sechs Lauflängen in Modulen
 * (Strich, Lücke, Strich, Lücke, Strich, Lücke). Der Wert 106 — das
 * Stoppzeichen — hat sieben, weil das Symbol mit einem Strich endet.
 *
 * Die Tabelle steht in der ISO/IEC 15417. Sie hier von Hand nachzuprüfen wäre
 * unzuverlässig; `code128.test.ts` liest stattdessen jedes erzeugte Symbol mit
 * dem ZXing-Decoder zurück.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213',
  '122312', '132212', '221213', '221312', '231212', '112232', '122132',
  '122231', '113222', '123122', '123221', '223211', '221132', '221231',
  '213212', '223112', '312131', '311222', '321122', '321221', '312212',
  '322112', '322211', '212123', '212321', '232121', '111323', '131123',
  '131321', '112313', '132113', '132311', '211313', '231113', '231311',
  '112133', '112331', '132131', '113123', '113321', '133121', '313121',
  '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114',
  '413111', '241112', '134111', '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112', '421211', '212141', '214121',
  '412121', '111143', '111341', '131141', '114113', '114311', '411113',
  '411311', '113141', '114131', '311141', '411131', '211412', '211214',
  '211232', '2331112',
];

/** Startzeichen des Codesets B. */
const START_B = 104;

/** Das Stoppzeichen — der letzte Eintrag der Tabelle. */
const STOP = 106;

/** Der Wert eines Zeichens in Codeset B: ASCII 32 (`' '`) ist 0. */
const ASCII_OFFSET = 32;

/** Das höchste in Codeset B darstellbare Zeichen (`'~'`). */
const ASCII_MAX = 126;

/**
 * Die Ruhezone links und rechts, in Modulen.
 *
 * Die Norm verlangt zehn; ohne sie findet ein Decoder den Anfang des Symbols
 * nicht und das gedruckte Etikett ist schlicht unlesbar — der häufigste Fehler
 * bei selbst gebauten Barcodes.
 */
export const CODE128_QUIET_ZONE = 10;

/** Ein Zeichen, das Codeset B nicht kennt — etwa ein Umlaut. */
export class Code128UnsupportedError extends Error {
  /** Das erste Zeichen, an dem es scheitert. */
  readonly zeichen: string;

  constructor(zeichen: string) {
    super(`Code 128 (Codeset B) kann das Zeichen ${JSON.stringify(zeichen)} nicht darstellen`);
    this.name = 'Code128UnsupportedError';
    this.zeichen = zeichen;
  }
}

/**
 * Lässt sich der Text als Code 128 drucken?
 *
 * Der Dialog fragt damit vorab, statt den Fehler beim Zeichnen aufschlagen zu
 * lassen. Leer zählt als nicht darstellbar: Ein Symbol ohne Nutzdaten wäre ein
 * gültiger, aber sinnloser Strichcode.
 */
export function code128Supported(text: string): boolean {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return false;
  for (const zeichen of trimmed) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (code < ASCII_OFFSET || code > ASCII_MAX) return false;
  }
  return true;
}

/**
 * Das Symbol als Lauflängen in Modulen, beginnend mit einem Strich:
 * `[Strich, Lücke, Strich, …]`. Die Anzahl ist immer ungerade, weil das
 * Stoppzeichen mit einem Strich schließt.
 *
 * Ohne Ruhezone — die gehört zur Darstellung und nicht zum Symbol; wer
 * zeichnet, nimmt `CODE128_QUIET_ZONE`.
 */
export function code128Runs(text: string): number[] {
  const nutzdaten = (text ?? '').trim();
  const werte: number[] = [START_B];

  for (const zeichen of nutzdaten) {
    const code = zeichen.codePointAt(0) ?? 0;
    if (code < ASCII_OFFSET || code > ASCII_MAX) {
      throw new Code128UnsupportedError(zeichen);
    }
    werte.push(code - ASCII_OFFSET);
  }

  // Prüfzeichen: Startwert plus jeder Nutzwert mal seiner Position, modulo 103.
  // Die Position zählt ab 1 — das Startzeichen geht ungewichtet ein.
  let summe = START_B;
  for (let i = 1; i < werte.length; i++) summe += werte[i] * i;
  werte.push(summe % 103);

  werte.push(STOP);

  const runs: number[] = [];
  for (const wert of werte) {
    for (const ziffer of PATTERNS[wert]) runs.push(Number(ziffer));
  }
  return runs;
}

/** Breite des Symbols in Modulen, ohne Ruhezone. */
export function code128Width(text: string): number {
  return code128Runs(text).reduce((summe, laenge) => summe + laenge, 0);
}

export interface Code128Path {
  /** SVG-Pfad der Striche, in Modulkoordinaten bei Höhe 1. */
  path: string;
  /** Breite des Symbols in Modulen — die `viewBox`-Breite. */
  width: number;
}

/**
 * Die Striche als ein einziger SVG-Pfad statt vieler Rechtecke — dieselbe
 * Bauweise wie `qrCodePath` beim EPC-Code.
 *
 * Die Höhe ist 1, die Breite die Modulzahl. Wer zeichnet, streckt über die
 * `viewBox` auf die gewünschte Größe; ein Strichcode ist in der Höhe beliebig
 * dehnbar, nur die Breitenverhältnisse dürfen sich nicht ändern.
 */
export function code128Path(text: string): Code128Path {
  const runs = code128Runs(text);
  const parts: string[] = [];
  let x = 0;
  runs.forEach((laenge, i) => {
    if (i % 2 === 0) parts.push(`M${x},0h${laenge}v1h-${laenge}z`);
    x += laenge;
  });
  return { path: parts.join(' '), width: x };
}
