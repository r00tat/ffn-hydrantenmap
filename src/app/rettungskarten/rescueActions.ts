'use server';
import 'server-only';

import { getLocale } from 'next-intl/server';
import { RescueSheetView } from '../../common/rescue/types';
import { DEFAULT_LOCALE, isLocale } from '../../i18n/config';
import {
  listRescueMakes,
  searchRescueSheets,
} from '../../server/rescue/rescueSheetLookup';
import { actionUserRequired } from '../auth';

export interface RescueSearchResult {
  sheets: RescueSheetView[];
  /** Der Katalog von Euro NCAP war nicht erreichbar. */
  error?: 'upstream';
}

export interface RescueMakesResult {
  makes: string[];
  error?: 'upstream';
}

async function activeLocale() {
  const locale = await getLocale();
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

/** Freitextsuche im Euro-Rescue-Katalog. */
export async function searchRescueSheetsAction(
  term: string,
): Promise<RescueSearchResult> {
  await actionUserRequired();
  try {
    return { sheets: await searchRescueSheets(term, await activeLocale()) };
  } catch (err) {
    console.error('Euro Rescue search failed:', err);
    return { sheets: [], error: 'upstream' };
  }
}

/** Alle Marken des Katalogs als Einstieg in die Suche. */
export async function loadRescueMakesAction(): Promise<RescueMakesResult> {
  await actionUserRequired();
  try {
    return { makes: await listRescueMakes() };
  } catch (err) {
    console.error('Euro Rescue makes failed:', err);
    return { makes: [], error: 'upstream' };
  }
}
