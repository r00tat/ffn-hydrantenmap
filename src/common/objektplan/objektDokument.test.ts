import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isAllowedObjektDokumentType,
  OBJEKT_DOKUMENT_MAX_MB,
  objektDokumentKind,
  objektDokumentStoragePath,
  wantsOcr,
  type ObjektDokument,
} from './objektDokument';

describe('objektDokument', () => {
  it('lässt PDF und Bilder zu, sonst nichts', () => {
    expect(isAllowedObjektDokumentType('application/pdf')).toBe(true);
    expect(isAllowedObjektDokumentType('image/jpeg')).toBe(true);
    expect(isAllowedObjektDokumentType('image/png')).toBe(true);
    expect(isAllowedObjektDokumentType('image/svg+xml')).toBe(false);
    expect(isAllowedObjektDokumentType('application/acad')).toBe(false);
    expect(isAllowedObjektDokumentType('')).toBe(false);
  });

  it('unterscheidet PDF und Bild', () => {
    expect(objektDokumentKind('application/pdf')).toBe('pdf');
    expect(objektDokumentKind('image/jpeg')).toBe('bild');
  });

  it('legt die Datei unter dem Risikoobjekt ab, mit sicherem Namen', () => {
    expect(objektDokumentStoragePath('ro1', 'd1', 'Plan EG (neu).pdf')).toBe(
      'risikoobjekt/ro1/d1-Plan_EG__neu_.pdf',
    );
  });
});

describe('wantsOcr', () => {
  const base: ObjektDokument = {
    id: 'd1',
    name: 'plan.pdf',
    contentType: 'application/pdf',
    storagePath: 'risikoobjekt/o/d1-plan.pdf',
    size: 1,
    sha256: 'x',
    indexStatus: 'ok',
    createdAt: '',
    createdBy: '',
  };

  it('will einen Scan ohne Textebene erkennen', () => {
    expect(wantsOcr({ ...base, indexStatus: 'ohneText' })).toBe(true);
  });

  it('will einen Plan mit Textebene, aber ohne Melder erkennen (Nummern als Linien)', () => {
    expect(wantsOcr({ ...base, melder: [] })).toBe(true);
    expect(wantsOcr(base)).toBe(true);
  });

  it('lässt Pläne mit Meldern, Bilder, Fehler und bereits Erkanntes aus', () => {
    const melder = [{ kennung: '3/1', gruppe: 3, melder: 1, seite: 1, box: [0, 0, 1, 1] as [number, number, number, number] }];
    expect(wantsOcr({ ...base, melder })).toBe(false);
    expect(wantsOcr({ ...base, indexStatus: 'ohneText', ocr: true })).toBe(false);
    expect(wantsOcr({ ...base, contentType: 'image/png', indexStatus: 'bild' })).toBe(false);
    expect(wantsOcr({ ...base, indexStatus: 'fehler' })).toBe(false);
  });
});

describe('Schranken spiegeln die storage.rules', () => {
  const rules = fs.readFileSync(path.join(process.cwd(), 'storage.rules'), 'utf8');
  const rule = rules.split('match /risikoobjekt/')[1]?.split('match ')[0] ?? '';

  it('kennt dieselbe Höchstgröße wie die Regel', () => {
    const match = rule.match(/request\.resource\.size < (\d+) \* 1024 \* 1024/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(OBJEKT_DOKUMENT_MAX_MB);
  });

  // Das Verhalten selbst prüft firebase/storage.rules.test.ts im Emulator.
  it('lesen und anlegen über die Freigabe im Metadatum', () => {
    expect(rule).toContain('objektFileGroups(resource.metadata)');
    expect(rule).toContain('objektFileGroups(request.resource.metadata)');
  });
});
