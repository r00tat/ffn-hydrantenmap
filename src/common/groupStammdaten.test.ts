import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GROUP_STAMMDATEN,
  STAMMDATEN_LOGO_MAX_BYTES,
  absenderNameOf,
  isAllowedLogoType,
  sanitizeStammdatenLogoPath,
  stammdatenLogoPath,
  stammdatenLuecken,
  type GroupStammdaten,
} from './groupStammdaten';

const vollstaendig: GroupStammdaten = {
  absenderName: 'Freiwillige Feuerwehr Musterdorf',
  absenderAdresse: 'Hauptstraße 1\n1234 Musterdorf',
  absenderKontakt: '+43 1 234, https://example.at',
  kontoinhaber: 'FF Musterdorf',
  iban: 'AT40 3300 0000 0202 0402',
  bic: 'RLBBAT2E',
};

describe('stammdatenLuecken', () => {
  it('meldet nichts, wenn Absender, Adresse und IBAN stehen', () => {
    expect(stammdatenLuecken(vollstaendig)).toEqual([]);
  });

  it('meldet jedes fehlende Pflichtfeld einzeln', () => {
    expect(stammdatenLuecken({ ...DEFAULT_GROUP_STAMMDATEN })).toEqual([
      'absenderName',
      'absenderAdresse',
      'iban',
    ]);
  });

  it('nimmt den Gruppennamen als Absender an', () => {
    const ohneAbsender = { ...vollstaendig, absenderName: '  ' };
    expect(stammdatenLuecken(ohneAbsender, 'FF Musterdorf')).toEqual([]);
    expect(stammdatenLuecken(ohneAbsender, '')).toEqual(['absenderName']);
  });

  it('stürzt bei einem Altdokument ohne die Felder nicht ab', () => {
    // Ein Dokument aus der Zeit vor diesen Feldern trägt sie nicht. Ein
    // Absturz ausgerechnet beim Prüfen auf Vollständigkeit wäre das
    // Gegenteil des Zwecks.
    expect(() => stammdatenLuecken({} as GroupStammdaten)).not.toThrow();
  });

  it('lässt BIC und Kontoinhaber offen', () => {
    // Innerhalb des EWR ist der BIC entbehrlich, und der Kontoinhaber fällt
    // auf den Absender zurück.
    expect(stammdatenLuecken({ ...vollstaendig, bic: '', kontoinhaber: '' })).toEqual([]);
  });
});

describe('absenderNameOf', () => {
  it('bevorzugt den gepflegten Absender', () => {
    expect(absenderNameOf(vollstaendig, 'Musterdorf')).toBe(
      'Freiwillige Feuerwehr Musterdorf',
    );
  });

  it('fällt auf den Gruppennamen zurück', () => {
    expect(absenderNameOf({ ...vollstaendig, absenderName: '' }, 'Musterdorf')).toBe(
      'Musterdorf',
    );
  });

  it('liefert einen leeren String, wenn beides fehlt', () => {
    expect(absenderNameOf({ ...DEFAULT_GROUP_STAMMDATEN })).toBe('');
  });
});

describe('stammdatenLogoPath', () => {
  it('baut den Pfad unter der Gruppe', () => {
    expect(stammdatenLogoPath('ffnd', 'logo.png')).toBe('groups/ffnd/stammdaten/logo.png');
  });

  it('entschärft Sonderzeichen im Namen', () => {
    expect(stammdatenLogoPath('ffnd', '../../etc/passwd')).toBe(
      'groups/ffnd/stammdaten/.._.._etc_passwd',
    );
  });

  it('ersetzt einen Namen aus lauter Punkten', () => {
    expect(stammdatenLogoPath('ffnd', '..')).toBe('groups/ffnd/stammdaten/logo');
  });
});

describe('sanitizeStammdatenLogoPath', () => {
  it('nimmt einen Pfad der eigenen Gruppe an', () => {
    expect(sanitizeStammdatenLogoPath('groups/ffnd/stammdaten/a-logo.png', 'ffnd')).toBe(
      'groups/ffnd/stammdaten/a-logo.png',
    );
  });

  it('verwirft den Pfad einer fremden Gruppe', () => {
    // Der Pfad kommt aus dem Browser. Ohne diese Prüfung ließe sich ein
    // beliebiges Storage-Objekt in das eigene Dokument schreiben und danach
    // brav signieren.
    expect(
      sanitizeStammdatenLogoPath('groups/andere/stammdaten/logo.png', 'ffnd'),
    ).toBeUndefined();
    expect(
      sanitizeStammdatenLogoPath('bugReports/1/screenshot.png', 'ffnd'),
    ).toBeUndefined();
  });

  it('verwirft zusätzliche Pfadsegmente', () => {
    expect(
      sanitizeStammdatenLogoPath('groups/ffnd/stammdaten/tief/logo.png', 'ffnd'),
    ).toBeUndefined();
  });

  it('verträgt einen führenden Schrägstrich und Nicht-Strings', () => {
    expect(sanitizeStammdatenLogoPath('/groups/ffnd/stammdaten/logo.png', 'ffnd')).toBe(
      'groups/ffnd/stammdaten/logo.png',
    );
    expect(sanitizeStammdatenLogoPath(undefined, 'ffnd')).toBeUndefined();
    expect(sanitizeStammdatenLogoPath(42 as unknown as string, 'ffnd')).toBeUndefined();
  });
});

describe('isAllowedLogoType', () => {
  it('nimmt PNG und JPEG an', () => {
    expect(isAllowedLogoType('image/png')).toBe(true);
    expect(isAllowedLogoType('image/jpeg')).toBe(true);
  });

  it('lehnt SVG ab', () => {
    // react-pdf rendert SVG als <Image> nicht — ein angenommener Upload
    // ergäbe ein Logo, das nur im Browser zu sehen ist.
    expect(isAllowedLogoType('image/svg+xml')).toBe(false);
    expect(isAllowedLogoType('application/pdf')).toBe(false);
    expect(isAllowedLogoType('')).toBe(false);
  });
});

describe('Logo-Schranken spiegeln die storage.rules', () => {
  const rules = fs.readFileSync(path.join(process.cwd(), 'storage.rules'), 'utf8');
  const logoRule =
    rules.split('match /groups/{groupId}/stammdaten/')[1]?.split('match ')[0] ?? '';

  it('kennt dieselbe Höchstgröße wie die Regel', () => {
    const match = logoRule.match(/request\.resource\.size < (\d+) \* 1024 \* 1024/);
    expect(match).not.toBeNull();
    expect(STAMMDATEN_LOGO_MAX_BYTES).toBe(Number(match?.[1]) * 1024 * 1024);
  });

  it('prüft denselben Contenttype wie die Regel', () => {
    expect(logoRule).toContain("request.resource.contentType.matches('image/(png|jpeg)')");
  });
});
