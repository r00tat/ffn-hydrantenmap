/**
 * EPC-QR-Code („Bezahlen mit Code") für SEPA-Überweisungen.
 *
 * Der Datensatz ist in der EPC069-12 der European Payments Council
 * festgelegt; jede österreichische Banking-App liest ihn.
 */

import qrcodegen from 'nayuki-qr-code-generator';

/**
 * SVG-Pfad der gesetzten Module. Ein Pfad statt vieler Rechtecke, weil
 * `@react-pdf/renderer` jedes Element einzeln in die Seite schreibt und ein
 * QR-Code aus über tausend Modulen besteht.
 */
export function qrCodePath(qr: qrcodegen.QrCode): string {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        parts.push(`M${x},${y}h1v1h-1z`);
      }
    }
  }
  return parts.join(' ');
}

export interface EpcAngaben {
  kontoinhaber: string;
  iban: string;
  bic?: string;
  betrag: number;
  verwendungszweck: string;
}

/** Die Feldlängen der EPC069-12. */
const MAX_NAME = 70;
const MAX_VERWENDUNGSZWECK = 140;

/**
 * Baut den EPC-Datensatz, oder `undefined`, wenn die Angaben nicht tragen.
 *
 * Lieber kein Code als ein falscher: Ein QR-Code, der zu einer Überweisung
 * ohne Empfänger oder über 0 € führt, ist schlimmer als ein Blatt ohne Code —
 * er sieht aus, als könnte man ihm vertrauen.
 */
export function buildEpcPayload(angaben: EpcAngaben): string | undefined {
  const kontoinhaber = angaben.kontoinhaber.trim().slice(0, MAX_NAME);
  // Die IBAN wird mit Leerzeichen gepflegt, weil sie so lesbar ist. Im
  // Datensatz haben sie nichts verloren.
  const iban = angaben.iban.replace(/\s+/g, '').toUpperCase();
  const bic = (angaben.bic ?? '').replace(/\s+/g, '').toUpperCase();

  if (!kontoinhaber || !iban) return undefined;
  // Der Betrag muss zwischen 0,01 und 999.999.999,99 liegen.
  if (!(angaben.betrag >= 0.01) || angaben.betrag > 999999999.99) {
    return undefined;
  }

  return [
    'BCD',
    // Version 002 lässt den BIC weg — innerhalb des EWR ist er entbehrlich,
    // und für viele Wehren steht er nicht in den Stammdaten.
    '002',
    '1',
    'SCT',
    bic,
    kontoinhaber,
    iban,
    `EUR${angaben.betrag.toFixed(2)}`,
    '', // Purpose Code
    '', // Strukturierte Referenz
    angaben.verwendungszweck.trim().slice(0, MAX_VERWENDUNGSZWECK),
    '', // Hinweis
  ].join('\n');
}

export interface EpcQrCode {
  path: string;
  size: number;
}

/** Datensatz und fertiger SVG-Pfad, oder `undefined` wie oben. */
export function epcQrCode(angaben: EpcAngaben): EpcQrCode | undefined {
  const payload = buildEpcPayload(angaben);
  if (!payload) return undefined;
  const qr = qrcodegen.QrCode.encodeText(payload, qrcodegen.QrCode.Ecc.MEDIUM);
  return { path: qrCodePath(qr), size: qr.size };
}
