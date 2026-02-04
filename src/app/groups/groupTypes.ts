export interface Group {
  id?: string;
  name: string;
  description?: string;
}

/**
 * Known groups with predefined IDs
 */
export const KNOWN_GROUPS: Group[] = [
  {
    id: 'ffnd',
    name: 'FF Neusiedl am See',
    description: 'Mitglieder der FF Neusiedl am See',
  },
  {
    id: 'allUsers',
    name: 'Alle Benutzer',
    description: 'Alle registrierten Benutzer',
  },
  {
    id: 'kostenersatz',
    name: 'Kostenersatz',
    description: 'Zugang zur Kostenersatz-Funktion',
  },
];
