import 'server-only';

import { ApiException } from '../../app/api/errors';
import { KOSTENERSATZ_GROUP } from '../../common/kostenersatz';
import { actionGroupMemberRequired } from '../Fahrtenbuch/authGuards';

/**
 * Wer Füllungen abrechnen darf: Mitglied dieser Feuerwehr **und** freigeschaltet
 * für den Kostenersatz.
 *
 * Die beiden Bedingungen beantworten verschiedene Fragen — die eine *wessen*
 * Daten, die andere *ob* Rechnungen gestellt werden dürfen. Bewusst nicht an
 * die Gerätemeister-Rolle gebunden: Wer den Kostenersatz der Feuerwehr macht,
 * macht auch diese Rechnungen, und das ist nicht zwangsläufig der
 * Gerätemeister.
 *
 * In den Firestore-Regeln steht wörtlich derselbe Satz
 * (`fahrtenbuchMember() && kostenersatzUser()`) — Regel und Action können
 * damit nicht auseinanderlaufen.
 */
export async function actionFuellungRechnungRequired(groupId: string) {
  const session = await actionGroupMemberRequired(groupId);
  if (!session.user.groups?.includes(KOSTENERSATZ_GROUP)) {
    throw new ApiException(`user may not create invoices`, { status: 403 });
  }
  return session;
}
