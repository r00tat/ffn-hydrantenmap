/**
 * Stammdaten einer Gruppe — Absender, Bankverbindung und Logo.
 *
 * Rein und ohne Firestore, dieselbe Bauweise wie `common/atemschutzRechnung.ts`:
 * Die Kostenersatz-Berechnung, die Füllungsverrechnung, die
 * Einstellungsoberfläche und beide PDF-Pfade brauchen dieselben Regeln.
 *
 * Ein eigenes Dokument und nicht das Gruppen-Dokument: Dessen Felder liest
 * jedes Gruppenmitglied, und die Bankverbindung gehört nicht in jeden
 * Einsatz-Screen. Ein gemeinsames Dokument und nicht je Feature eines: Die
 * IBAN an zwei Orten läuft auseinander, sobald sich das Konto ändert.
 */

/** Untersammlung unter `groups/{groupId}`. */
export const GROUP_CONFIG_COLLECTION_ID = 'groupConfig';
export const GROUP_STAMMDATEN_DOC = 'stammdaten';

/** Wurzel der Logodateien im Storage. */
export const STAMMDATEN_STORAGE_ROOT = 'groups';

/**
 * Höchstgröße einer Logodatei. Dieselbe Zahl steht in `storage.rules`; ein
 * Test in `groupStammdaten.test.ts` liest die Datei und vergleicht beide.
 * Wer sie hier ändert, ändert sie dort mit.
 */
export const STAMMDATEN_LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Kein SVG: `@react-pdf/renderer` rendert es als `<Image>` nicht. Ein
 * angenommenes SVG ergäbe ein Logo, das in der Vorschau steht und auf jedem
 * Beleg fehlt.
 */
export const STAMMDATEN_LOGO_TYPES = ['image/png', 'image/jpeg'] as const;

export interface GroupStammdaten {
  /**
   * Voller Name auf Belegen, z.B. „Freiwillige Feuerwehr Neusiedl am See".
   * Leer heißt: der `feuerwehrName` aus dem Gruppendokument. Eigenes Feld,
   * weil auf einem Beleg der volle Name stehen soll, während `feuerwehrName`
   * die Schreibweise der Stammdaten trägt.
   */
  absenderName: string;
  /** Straße und Ort, mehrzeilig. */
  absenderAdresse: string;
  /** Telefon, Web, E-Mail — eine Zeile im Fuß. */
  absenderKontakt: string;
  /** Leer heißt: derselbe wie der Absender. */
  kontoinhaber: string;
  /** Gepflegt mit Leerzeichen, weil sie so abzutippen ist. */
  iban: string;
  /** Innerhalb des EWR entbehrlich, deshalb kein Pflichtfeld. */
  bic: string;
  /**
   * Storage-Pfad des Logos, nicht die Download-URL: Der Pfad ist stabil und
   * wird zur Anzeige serverseitig signiert — dieselbe Bauweise wie bei den
   * Mangel-Bildern.
   */
  logoPath?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/**
 * Durchgehend leer. Bewusst ohne Vorgabewerte: Eine hier eingetragene
 * Bankverbindung stünde auf den Belegen jeder Gruppe, die ihre eigene noch
 * nicht gepflegt hat — genau der Fehler, den diese Umstellung abstellt.
 */
export const DEFAULT_GROUP_STAMMDATEN: GroupStammdaten = {
  absenderName: '',
  absenderAdresse: '',
  absenderKontakt: '',
  kontoinhaber: '',
  iban: '',
  bic: '',
};

/** Nachsichtig gegenüber Feldern, die ein Altdokument nicht trägt. */
function gefuellt(wert?: string): boolean {
  return typeof wert === 'string' && wert.trim().length > 0;
}

/** Der Absender auf dem Beleg, mit Rückfall auf den Gruppennamen. */
export function absenderNameOf(
  stammdaten: GroupStammdaten,
  feuerwehrName?: string,
): string {
  return stammdaten?.absenderName?.trim() || feuerwehrName?.trim() || '';
}

/**
 * Fehlt etwas, ohne das der Beleg unbrauchbar ist?
 *
 * Absender, Anschrift und IBAN sind der Unterschied zwischen einem Beleg und
 * einem Zettel: Der Empfänger weiß sonst weder, von wem die Forderung kommt,
 * noch wohin er überweisen soll. BIC und Kontoinhaber stehen bewusst nicht
 * darin — der eine ist im EWR entbehrlich, der andere fällt auf den Absender
 * zurück.
 */
export function stammdatenLuecken(
  stammdaten: GroupStammdaten,
  feuerwehrName?: string,
): string[] {
  const luecken: string[] = [];
  if (!absenderNameOf(stammdaten ?? DEFAULT_GROUP_STAMMDATEN, feuerwehrName)) {
    luecken.push('absenderName');
  }
  if (!gefuellt(stammdaten?.absenderAdresse)) luecken.push('absenderAdresse');
  if (!gefuellt(stammdaten?.iban)) luecken.push('iban');
  return luecken;
}

export function isAllowedLogoType(contentType?: string): boolean {
  return (STAMMDATEN_LOGO_TYPES as readonly string[]).includes(contentType ?? '');
}

/** Wie `sanitizeMangelFileName`: nur harmlose Zeichen, kein reiner Punktname. */
function sanitizeLogoFileName(fileName: string): string {
  const safe = (fileName || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return /^\.+$/.test(safe) || !safe ? 'logo' : safe;
}

/** Der Ordner einer Gruppe: `groups/{groupId}/stammdaten`. */
export function stammdatenFolder(groupId: string): string {
  return `${STAMMDATEN_STORAGE_ROOT}/${groupId}/${GROUP_STAMMDATEN_DOC}`;
}

/** Der vollständige Storage-Pfad einer Logodatei. */
export function stammdatenLogoPath(groupId: string, fileName: string): string {
  return `${stammdatenFolder(groupId)}/${sanitizeLogoFileName(fileName)}`;
}

/**
 * Prüft einen vom Client behaupteten Logopfad gegen die eigene Gruppe.
 *
 * Der Pfad kommt aus dem Browser und ist damit frei wählbar: Ohne diese
 * Prüfung ließe sich `groups/andere/...` oder `bugReports/...` in das eigene
 * Dokument schreiben — und die Anzeige signiert anschließend brav, was darin
 * steht. Deshalb exakt vier Segmente unter der eigenen Gruppe.
 */
export function sanitizeStammdatenLogoPath(
  logoPath: unknown,
  groupId: string,
): string | undefined {
  if (typeof logoPath !== 'string') return undefined;
  // Ein führender Schrägstrich ist derselbe Pfad — der Firebase-Client gibt
  // ihn je nach Aufruf mit oder ohne zurück.
  const pfad = logoPath.replace(/^\/+/, '');
  const segmente = pfad.split('/');
  if (segmente.length !== 4) return undefined;
  if (segmente[0] !== STAMMDATEN_STORAGE_ROOT) return undefined;
  if (segmente[1] !== groupId) return undefined;
  if (segmente[2] !== GROUP_STAMMDATEN_DOC) return undefined;
  if (!segmente[3]) return undefined;
  return pfad;
}

/**
 * Das Logo, wie `@react-pdf/renderer` es als `<Image src>` annimmt.
 *
 * Steht in diesem reinen Modul und nicht im `'server-only'`-Store: Die beiden
 * PDF-Komponenten brauchen den Typ, und ein Import aus einem Server-Modul
 * heraus wäre ein Stolperstein, sobald eine von ihnen doch einmal im
 * Client-Bundle landet.
 */
export interface PdfLogo {
  data: Buffer;
  format: 'png' | 'jpg';
}

/** Das Format, das `@react-pdf/renderer` für ein `<Image src>` braucht. */
export function logoFormatOf(contentType?: string): 'png' | 'jpg' | undefined {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  return undefined;
}
