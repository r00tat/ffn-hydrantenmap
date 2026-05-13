import type { Locale } from './config';

/**
 * Flat-key message catalogs. Keys use dot-notation namespacing
 * (e.g. `diary.titleM`). Placeholders use `{name}` style — same syntax
 * as next-intl uses in the web app.
 */
export type MessageCatalog = Record<string, string>;

const de: MessageCatalog = {
  // App shell
  'app.title': 'Einsatzkarte',
  'app.openInTab': 'In Einsatzkarte öffnen',
  'app.signOut': 'Abmelden ({email})',
  'app.tabOverview': 'Übersicht',
  'app.tabDiary': 'Tagebuch',

  // Login
  'login.intro': 'Melde dich an, um auf Einsatzdaten und das Tagebuch zuzugreifen.',
  'login.signInGoogle': 'Mit Google anmelden',
  'login.signingIn': 'Anmelden...',
  'login.failed': 'Anmeldung fehlgeschlagen',

  // Firecall select
  'firecall.label': 'Einsatz',

  // Firecall overview
  'overview.active': 'Aktiv',
  'overview.ended': 'Beendet',
  'overview.vehiclesSingular': '{count} Fahrzeug',
  'overview.vehiclesPlural': '{count} Fahrzeuge',
  'overview.personsSingular': '{count} Person',
  'overview.personsPlural': '{count} Personen',
  'overview.noCrew': 'Keine Mannschaft zugeordnet',
  'overview.noVehicle': 'Ohne Fahrzeug',

  // Diary list
  'diary.empty': 'Keine Tagebucheinträge vorhanden.',
  'diary.from': 'Von: {value}',
  'diary.to': 'An: {value}',

  // Diary form
  'diaryForm.M': 'Meldung',
  'diaryForm.B': 'Befehl',
  'diaryForm.F': 'Frage',
  'diaryForm.message': 'Nachricht',
  'diaryForm.fromLabel': 'Von',
  'diaryForm.toLabel': 'An',
  'diaryForm.description': 'Beschreibung',
  'diaryForm.create': 'Eintrag erstellen',
  'diaryForm.saving': 'Speichern...',
  'diaryForm.saveError': 'Eintrag konnte nicht gespeichert werden',
};

const en: MessageCatalog = {
  // App shell
  'app.title': 'Operations Map',
  'app.openInTab': 'Open in operations map',
  'app.signOut': 'Sign out ({email})',
  'app.tabOverview': 'Overview',
  'app.tabDiary': 'Diary',

  // Login
  'login.intro': 'Sign in to access operation data and the diary.',
  'login.signInGoogle': 'Sign in with Google',
  'login.signingIn': 'Signing in...',
  'login.failed': 'Sign-in failed',

  // Firecall select
  'firecall.label': 'Operation',

  // Firecall overview
  'overview.active': 'Active',
  'overview.ended': 'Ended',
  'overview.vehiclesSingular': '{count} vehicle',
  'overview.vehiclesPlural': '{count} vehicles',
  'overview.personsSingular': '{count} person',
  'overview.personsPlural': '{count} people',
  'overview.noCrew': 'No crew assigned',
  'overview.noVehicle': 'No vehicle',

  // Diary list
  'diary.empty': 'No diary entries yet.',
  'diary.from': 'From: {value}',
  'diary.to': 'To: {value}',

  // Diary form
  'diaryForm.M': 'Message',
  'diaryForm.B': 'Order',
  'diaryForm.F': 'Question',
  'diaryForm.message': 'Message',
  'diaryForm.fromLabel': 'From',
  'diaryForm.toLabel': 'To',
  'diaryForm.description': 'Description',
  'diaryForm.create': 'Create entry',
  'diaryForm.saving': 'Saving...',
  'diaryForm.saveError': 'Entry could not be saved',
};

const CATALOGS: Record<Locale, MessageCatalog> = { de, en };

export function getMessage(locale: Locale, key: string): string {
  const catalog = CATALOGS[locale] ?? CATALOGS.de;
  return catalog[key] ?? CATALOGS.de[key] ?? key;
}

/**
 * Replace `{placeholder}` tokens in a template string with stringified
 * values from `params`. Missing placeholders are left in place.
 */
export function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}
