import 'server-only';

import { stammdatenLuecken, type GroupStammdaten } from '../../common/groupStammdaten';
import type { Firecall } from '../../components/firebase/firestore';
import { loadGroupFeuerwehrName, loadGroupStammdaten } from './stammdatenStore';

/**
 * Der Beleg wird verweigert, nicht beschönigt.
 *
 * Ein Kostenersatz-PDF ohne Empfänger und Konto sieht aus wie ein Beleg und
 * ist keiner — der Fehler fiele erst beim Zahlungspflichtigen auf. Deshalb
 * ein harter Stopp mit den Namen der fehlenden Felder, den die Oberfläche in
 * einen Hinweis auf die Verwaltung übersetzen kann.
 */
export class StammdatenUnvollstaendigError extends Error {
  readonly luecken: string[];
  readonly groupId?: string;

  constructor(luecken: string[], groupId?: string) {
    super('stammdatenUnvollstaendig');
    this.name = 'StammdatenUnvollstaendigError';
    this.luecken = luecken;
    this.groupId = groupId;
  }
}

export interface StammdatenKontext {
  groupId: string;
  stammdaten: GroupStammdaten;
  /** Aus dem Gruppendokument — Rückfall für den Absender. */
  feuerwehrName: string;
}

/** Die Stammdaten einer Gruppe, oder ein Fehler. */
export async function requireGroupStammdaten(
  groupId: string,
): Promise<StammdatenKontext> {
  const [stammdaten, feuerwehrName] = await Promise.all([
    loadGroupStammdaten(groupId),
    loadGroupFeuerwehrName(groupId),
  ]);
  const luecken = stammdatenLuecken(stammdaten, feuerwehrName);
  if (luecken.length > 0) {
    throw new StammdatenUnvollstaendigError(luecken, groupId);
  }
  return { groupId, stammdaten, feuerwehrName };
}

/**
 * Die Stammdaten zum Einsatz — die Gruppe steht am Einsatz selbst.
 *
 * Fehlt sie, ist nicht bestimmbar, wessen Konto auf dem Beleg stünde: Das
 * Feld ist beim Anlegen Pflicht, Alteinsätze tragen es aber nicht.
 */
export async function requireStammdatenForFirecall(
  firecall: Firecall,
): Promise<StammdatenKontext> {
  const groupId = firecall.group?.trim();
  if (!groupId) throw new StammdatenUnvollstaendigError(['group']);
  return requireGroupStammdaten(groupId);
}
