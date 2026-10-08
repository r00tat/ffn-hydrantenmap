'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { BekleidungStatus } from '../../common/bekleidung';
import { BEKLEIDUNG_IMPORT_MAX_BYTES } from '../../common/bekleidungImport';

/*
 * Die Server Actions der Bekleidung melden erwartete Fehler als
 * maschinenlesbaren Code (`alreadyIssued:<stueckId>`, `notEmpty`, …). Hier
 * wird daraus ein Text für die Oberfläche.
 */

const SIMPLE_CODES = [
  'notEmpty',
  'importRunning',
  'fuehrungLocked',
  'personExists',
  'personInactive',
  'programmTextRequired',
  'tagWithAnzahl',
  'artikelNotEinzeln',
  'artikelNotMenge',
  'nothingToIssue',
  'nothingToReturn',
  'forbidden',
] as const;

type SimpleCode = (typeof SIMPLE_CODES)[number];

export type ParsedBekleidungError =
  | { code: SimpleCode }
  | { code: 'fileTooLarge' }
  | { code: 'alreadyIssued'; stueckId: string }
  | { code: 'notAvailable'; stueckId: string; status: string }
  | { code: 'notIssued'; id: string }
  | { code: 'insufficientStock'; artikelId: string; groesse: string }
  | { code: 'tagExists'; tag: string }
  | { code: 'personDecisionMissing'; key: string }
  | { code: 'unknownPerson'; personId: string }
  | { code: 'unknown'; message: string };

/** Zerlegt den Fehlertext einer Action in Code und Parameter. */
export function parseBekleidungError(error: string): ParsedBekleidungError {
  if ((SIMPLE_CODES as readonly string[]).includes(error)) {
    return { code: error as SimpleCode };
  }
  if (error === 'fileTooLarge') return { code: 'fileTooLarge' };
  const colon = error.indexOf(':');
  if (colon > 0) {
    const head = error.slice(0, colon);
    const rest = error.slice(colon + 1);
    switch (head) {
      case 'alreadyIssued':
        return { code: 'alreadyIssued', stueckId: rest };
      case 'notIssued':
        return { code: 'notIssued', id: rest };
      case 'notAvailable': {
        const next = rest.indexOf(':');
        if (next > 0) {
          return {
            code: 'notAvailable',
            stueckId: rest.slice(0, next),
            status: rest.slice(next + 1),
          };
        }
        break;
      }
      case 'tagExists':
        return { code: 'tagExists', tag: rest };
      case 'personDecisionMissing':
        return { code: 'personDecisionMissing', key: rest };
      case 'unknownPerson':
        return { code: 'unknownPerson', personId: rest };
      case 'insufficientStock': {
        // Die Größe kann selbst einen Doppelpunkt enthalten — nur am ersten trennen.
        const next = rest.indexOf(':');
        if (next > 0) {
          return {
            code: 'insufficientStock',
            artikelId: rest.slice(0, next),
            groesse: rest.slice(next + 1),
          };
        }
        break;
      }
    }
  }
  return { code: 'unknown', message: error };
}

export interface BekleidungErrorContext {
  /**
   * Anzeigename eines Stücks; ohne Auflösung steht die ID da. Bei
   * `notIssued` kann die ID auch die einer Mengen-Ausgabe sein.
   */
  stueckLabel?: (id: string) => string;
  artikelLabel?: (id: string) => string;
}

/** Liefert eine Funktion, die einen Fehlercode in einen Text übersetzt. */
export function useBekleidungErrorText() {
  const t = useTranslations('bekleidung.errors');
  const tStatus = useTranslations('bekleidung.status');
  return useCallback(
    (error: string, ctx: BekleidungErrorContext = {}): string => {
      const parsed = parseBekleidungError(error);
      switch (parsed.code) {
        case 'alreadyIssued':
          return t('alreadyIssued', {
            stueck: ctx.stueckLabel?.(parsed.stueckId) ?? parsed.stueckId,
          });
        case 'notIssued':
          return t('notIssued', { stueck: ctx.stueckLabel?.(parsed.id) ?? parsed.id });
        case 'notAvailable':
          return t('notAvailable', {
            stueck: ctx.stueckLabel?.(parsed.stueckId) ?? parsed.stueckId,
            status: tStatus.has(parsed.status as BekleidungStatus)
              ? tStatus(parsed.status as BekleidungStatus)
              : parsed.status,
          });
        case 'insufficientStock':
          return t('insufficientStock', {
            artikel: ctx.artikelLabel?.(parsed.artikelId) ?? parsed.artikelId,
            groesse: parsed.groesse,
          });
        case 'tagExists':
          return t('tagExists', { tag: parsed.tag });
        case 'personDecisionMissing':
          return t('personDecisionMissing', { key: parsed.key });
        case 'unknownPerson':
          return t('unknownPerson');
        case 'fileTooLarge':
          return t('fileTooLarge', { maxKb: Math.floor(BEKLEIDUNG_IMPORT_MAX_BYTES / 1000) });
        case 'unknown':
          return t('unknown', { error: parsed.message });
        default:
          return t(parsed.code);
      }
    },
    [t, tStatus],
  );
}
