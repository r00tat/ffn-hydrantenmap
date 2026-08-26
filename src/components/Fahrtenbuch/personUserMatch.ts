/**
 * Zuordnung von Fahrtenbuch-Personen zu Benutzerkonten — als **Vorschlag** für
 * einen Admin, nicht als Berechtigung.
 *
 * Der Unterschied ist der ganze Punkt. Ein Namensvergleich darf nie darüber
 * entscheiden, wer einen Eintrag ändern darf: Der Anzeigename eines Kontos
 * gehört dem Benutzer selbst und ist jederzeit änderbar (siehe
 * `EntryModifyActor` in [entryPermissions.ts](./entryPermissions.ts)). Als
 * Vorschlag, den ein Admin sieht und bestätigt, ist derselbe Vergleich dagegen
 * genau das richtige Werkzeug — nur 5 von rund 110 Personendatensätzen tragen
 * überhaupt eine E-Mail, über den Namen geht also der Großteil der Arbeit.
 *
 * Deshalb gilt hier: **nichts still entscheiden.** Was nicht eindeutig ist,
 * wird als mehrdeutig gemeldet und wartet auf einen Menschen.
 */

import { normalizePersonName, type FahrtenbuchPerson } from '../../common/fahrtenbuch';

/** Ein Benutzerkonto, soweit die Zuordnung und ihre Anzeige es brauchen. */
export interface PersonUserCandidate {
  uid: string;
  displayName?: string;
  email?: string;
  /** In Firebase Auth gesperrt. */
  disabled?: boolean;
  /** In der App freigeschaltet (`user/{uid}.isAuthorized`). */
  isAuthorized?: boolean;
  /** Mitglied der Gruppe, zu der die Person gehört. */
  inGroup?: boolean;
}

export type PersonUserMatchStatus =
  /** Genau ein offenes Konto trifft — vorbelegt, aber bestätigungspflichtig. */
  | 'unique'
  /** Mehrere Konten, ein umkämpftes Konto oder ein Zusatz zu einer bestehenden
   *  Verknüpfung: Ein Mensch muss entscheiden. */
  | 'ambiguous'
  /** Kein Konto gefunden. */
  | 'none'
  /** Verknüpft, und es kommt nichts Neues dazu. */
  | 'linked';

export interface PersonUserMatch {
  personId: string;
  personName: string;
  status: PersonUserMatchStatus;
  /** Schon gespeicherte Verknüpfungen dieser Person. */
  linkedUserIds: string[];
  /** Konten, die noch nicht verknüpft sind und in Frage kommen. */
  candidates: PersonUserCandidate[];
  /**
   * IDs anderer Personen, die auf dasselbe Konto zeigen. Gesetzt heißt: Der
   * Vorschlag ist umkämpft und darf nicht vorbelegt werden — zwei echte
   * Menschen können denselben Namen tragen, das Konto gehört aber nur einem.
   */
  contestedBy?: string[];
}

/** Reihenfolge nach Handlungsbedarf — oben, was eine Entscheidung braucht. */
const STATUS_ORDER: Record<PersonUserMatchStatus, number> = {
  ambiguous: 0,
  unique: 1,
  none: 2,
  linked: 3,
};

function normalizedEmail(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/**
 * Die Konten, die zu einer Person passen könnten.
 *
 * Die gepflegte E-Mail wiegt mehr als der Name: Sie steht in den Stammdaten der
 * Gruppe, ist dort von Hand gepflegt und trifft auch dann, wenn im Konto ein
 * Spitzname oder ein alter Nachname steht. Ein E-Mail-Treffer beendet die Suche
 * deshalb — er löst auch die Doppelregistrierung auf, bei der zwei Konten
 * denselben Namen tragen.
 */
function candidatesFor(
  person: FahrtenbuchPerson,
  users: PersonUserCandidate[],
): PersonUserCandidate[] {
  const email = normalizedEmail(person.email);
  if (email) {
    const byEmail = users.filter((u) => normalizedEmail(u.email) === email);
    if (byEmail.length > 0) return byEmail;
  }
  const name = normalizePersonName(person.name ?? '');
  if (!name) return [];
  return users.filter(
    (u) => normalizePersonName(u.displayName ?? '') === name,
  );
}

/**
 * Ordnet die Personen einer Gruppe den Benutzerkonten zu und sagt je Person,
 * wie sicher die Zuordnung ist.
 *
 * Personen ohne ID fallen heraus — ohne sie gibt es nichts zu speichern.
 */
export function matchPersonsToUsers(
  persons: FahrtenbuchPerson[],
  users: PersonUserCandidate[],
): PersonUserMatch[] {
  const withId = persons.filter((p) => !!p.id);

  // Erst alle Kandidaten sammeln, dann die Konflikte auszählen: Ob ein
  // Vorschlag umkämpft ist, lässt sich erst sagen, wenn alle Personen gesehen
  // sind.
  const perPerson = withId.map((person) => {
    const linkedUserIds = person.userIds ?? [];
    const candidates = candidatesFor(person, users).filter(
      (candidate) => !linkedUserIds.includes(candidate.uid),
    );
    return { person, linkedUserIds, candidates };
  });

  const claimants = new Map<string, string[]>();
  for (const { person, candidates } of perPerson) {
    for (const candidate of candidates) {
      claimants.set(candidate.uid, [
        ...(claimants.get(candidate.uid) ?? []),
        person.id as string,
      ]);
    }
  }

  const matches = perPerson.map(({ person, linkedUserIds, candidates }) => {
    const personId = person.id as string;
    const contestedBy = [
      ...new Set(
        candidates.flatMap((candidate) =>
          (claimants.get(candidate.uid) ?? []).filter((id) => id !== personId),
        ),
      ),
    ];

    const status: PersonUserMatchStatus =
      candidates.length === 0
        ? linkedUserIds.length > 0
          ? 'linked'
          : 'none'
        : contestedBy.length > 0 || linkedUserIds.length > 0
          ? // Umkämpft, oder ein Zusatz zu einer bestehenden Verknüpfung: Ob ein
            // weiteres Konto derselben Person gehört oder eine Zweitregistrierung
            // aufgeräumt werden sollte, entscheidet kein Namensvergleich.
            'ambiguous'
          : candidates.length === 1
            ? 'unique'
            : 'ambiguous';

    const match: PersonUserMatch = {
      personId,
      personName: person.name ?? '',
      status,
      linkedUserIds,
      candidates,
    };
    if (contestedBy.length > 0) match.contestedBy = contestedBy;
    return match;
  });

  return matches.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.personName.localeCompare(b.personName, 'de'),
  );
}

/** Was der Dialog am Ende schickt: je Person die endgültige Kontenliste. */
export interface PersonUserLink {
  personId: string;
  userIds: string[];
}
