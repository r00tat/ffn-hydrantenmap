'use server';
import 'server-only';

import {
  sanitizeStammdatenLogoPath,
  type GroupStammdaten,
} from '../../common/groupStammdaten';
import { actionGroupMemberRequired } from '../../components/Fahrtenbuch/authGuards';
import {
  deleteStammdatenLogo,
  loadGroupStammdaten,
  signStammdatenLogoUrl,
  stammdatenRef,
} from '../../server/groups/stammdatenStore';
import { actionGroupAdminRequired } from './groupAdminGuard';

export interface StammdatenActionResult {
  success: boolean;
  error?: string;
}

function trimmed(wert?: string): string {
  return (wert ?? '').trim();
}

/**
 * Absender, Bankverbindung und Logo einer Gruppe.
 *
 * `actionGroupAdminRequired` und nicht der Mitglieds-Guard: Die Werte stehen
 * auf jedem Beleg der Gruppe und sind keine Tagesarbeit — dieselbe Schranke
 * wie bei `saveAtemschutzRechnungConfig`.
 */
export async function saveGroupStammdaten(request: {
  groupId: string;
  stammdaten: Omit<GroupStammdaten, 'updatedAt' | 'updatedBy'>;
}): Promise<StammdatenActionResult> {
  try {
    const { groupId, stammdaten } = request;
    const session = await actionGroupAdminRequired(groupId);

    // Der Pfad kommt aus dem Browser: geprüft wird gegen die eigene Gruppe,
    // sonst zeigte das Dokument auf ein fremdes Storage-Objekt und die
    // Anzeige signierte es brav.
    const logoPath = sanitizeStammdatenLogoPath(stammdaten.logoPath, groupId);

    // Das abgelöste Logo wegräumen — sonst sammelt jeder Austausch eine
    // weitere verwaiste Datei an.
    const bisher = await loadGroupStammdaten(groupId);
    if (bisher.logoPath && bisher.logoPath !== logoPath) {
      await deleteStammdatenLogo(bisher.logoPath);
    }

    await stammdatenRef(groupId).set(
      {
        absenderName: trimmed(stammdaten.absenderName),
        absenderAdresse: trimmed(stammdaten.absenderAdresse),
        absenderKontakt: trimmed(stammdaten.absenderKontakt),
        kontoinhaber: trimmed(stammdaten.kontoinhaber),
        // Leerzeichen in der IBAN sind üblich und beim Abtippen hilfreich —
        // gespeichert wird die Eingabe, nur ohne Rand.
        iban: trimmed(stammdaten.iban),
        bic: trimmed(stammdaten.bic),
        logoPath: logoPath ?? '',
        updatedAt: new Date().toISOString(),
        updatedBy: session.user.email ?? session.user.name ?? 'unbekannt',
      },
      { merge: true },
    );
    return { success: true };
  } catch (err) {
    console.error('saveGroupStammdaten failed', err);
    return { success: false, error: 'saveFailed' };
  }
}

/**
 * Kurzlebige Lese-URL für die Vorschau im Formular.
 *
 * Mitgliedschaft genügt: Wer die Stammdaten liest, darf das Logo sehen. Die
 * Storage-Regel sperrt das Lesen für alle, weil sie die Gruppe nicht prüfen
 * kann — deshalb geht der Weg über diese Action.
 */
export async function signStammdatenLogo(request: {
  groupId: string;
}): Promise<{ url?: string; error?: string }> {
  try {
    const { groupId } = request;
    await actionGroupMemberRequired(groupId);
    const stammdaten = await loadGroupStammdaten(groupId);
    if (!stammdaten.logoPath) return {};
    return { url: await signStammdatenLogoUrl(stammdaten.logoPath) };
  } catch (err) {
    console.error('signStammdatenLogo failed', err);
    return { error: 'logoLoadFailed' };
  }
}
