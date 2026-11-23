import { describe, expect, it } from 'vitest';
import {
  driveDokumentId,
  driveImportFormat,
  isSkippedDriveFolder,
  parseDriveLink,
  planDriveSync,
  type DriveFileInfo,
} from './driveSync';
import type { ObjektDokument } from './objektDokument';

describe('parseDriveLink', () => {
  it.each([
    ['https://drive.google.com/drive/folders/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N', 'folder'],
    [
      'https://drive.google.com/drive/u/1/folders/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N?usp=sharing',
      'folder',
    ],
    ['https://drive.google.com/file/d/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N/view?usp=drive_link', 'file'],
    ['https://drive.google.com/open?id=1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N', 'unknown'],
  ])('erkennt %s', (url, kind) => {
    expect(parseDriveLink(url)).toEqual({ kind, id: '1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N' });
  });

  it.each([
    [undefined],
    [''],
    ['https://www.example.com/drive/folders/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N'],
    ['https://docs.google.com/document/d/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N/edit'],
    ['https://drive.google.com/drive/folders/kurz'],
    ['kein link'],
  ])('lehnt %s ab', (url) => {
    expect(parseDriveLink(url)).toBeNull();
  });
});

describe('isSkippedDriveFolder', () => {
  it.each(['Archiv', 'archiv 2019', 'Alt', 'alte Pläne', 'Old', 'veraltet'])(
    'überspringt %s',
    (name) => expect(isSkippedDriveFolder(name)).toBe(true),
  );
  it.each(['Laufkarten', 'Brandschutzplan', 'Altbau'])('nimmt %s', (name) =>
    expect(isSkippedDriveFolder(name)).toBe(false),
  );
});

function file(id: string, over: Partial<DriveFileInfo> = {}): DriveFileInfo {
  return {
    id,
    name: `${id}.pdf`,
    mimeType: 'application/pdf',
    md5Checksum: `md5-${id}`,
    size: 1000,
    ...over,
  };
}

function dok(id: string, over: Partial<ObjektDokument> = {}): ObjektDokument {
  return {
    id,
    name: `${id}.pdf`,
    contentType: 'application/pdf',
    storagePath: `risikoobjekt/o/${id}`,
    size: 1000,
    sha256: 'x',
    indexStatus: 'ok',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'erika.musterfrau@example.com',
    ...over,
  };
}

describe('planDriveSync', () => {
  it('importiert neue Dateien unter einer festen ID', () => {
    const plan = planDriveSync([file('a')], []);
    expect(plan.importFiles).toEqual([{ file: file('a'), dokumentId: 'drive-a' }]);
    expect(plan.remove).toEqual([]);
  });

  it('lässt unveränderte Dateien in Ruhe', () => {
    const plan = planDriveSync(
      [file('a')],
      [dok('drive-a', { quelle: 'drive', driveFileId: 'a', driveMd5: 'md5-a' })],
    );
    expect(plan.importFiles).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('holt eine geänderte Datei neu und ersetzt das alte Dokument', () => {
    const alt = dok('drive-a', { quelle: 'drive', driveFileId: 'a', driveMd5: 'md5-alt' });
    const plan = planDriveSync([file('a')], [alt]);
    expect(plan.importFiles).toEqual([
      { file: file('a'), dokumentId: 'drive-a', replaces: alt },
    ]);
  });

  it('entfernt Drive-Dokumente, deren Datei nicht mehr im Ordner liegt', () => {
    const weg = dok('drive-b', { quelle: 'drive', driveFileId: 'b', driveMd5: 'md5-b' });
    const plan = planDriveSync([], [weg]);
    expect(plan.remove).toEqual([weg]);
  });

  it('rührt hochgeladene Dokumente nie an', () => {
    const plan = planDriveSync([], [dok('manuell')]);
    expect(plan.remove).toEqual([]);
  });

  it('überspringt nicht unterstützte und zu große Dateien', () => {
    const form = file('d', { mimeType: 'application/vnd.google-apps.form' });
    const dwg = file('e', { mimeType: 'image/vnd.dwg' });
    const riesig = file('f', { size: 200 * 1024 * 1024 });
    const plan = planDriveSync([form, dwg, riesig, file('g', { mimeType: 'image/png' })], []);
    expect(plan.importFiles.map((i) => i.file.id)).toEqual(['g']);
    expect(plan.skipped.map((s) => s.id)).toEqual(['d', 'e', 'f']);
  });

  it('entfernt ein Drive-Dokument, dessen Datei nun zu groß ist', () => {
    const alt = dok('drive-f', { quelle: 'drive', driveFileId: 'f', driveMd5: 'md5-f' });
    const plan = planDriveSync([file('f', { size: 200 * 1024 * 1024 })], [alt]);
    expect(plan.remove).toEqual([alt]);
  });

  it('bildet die Dokument-ID aus der Drive-ID', () => {
    expect(driveDokumentId('1ZZ_x-y')).toBe('drive-1ZZ_x-y');
  });

  it('übernimmt Google-Dokumente als PDF, ohne md5 und Größe', () => {
    const doc = file('d', {
      name: 'Einsatzplan',
      mimeType: 'application/vnd.google-apps.document',
      md5Checksum: undefined,
      size: undefined,
      version: '12',
    });
    const plan = planDriveSync([doc], []);
    expect(plan.importFiles.map((i) => i.file.id)).toEqual(['d']);
  });

  it('holt ein Google-Dokument erst nach einer Änderung neu', () => {
    const doc = file('d', {
      mimeType: 'application/vnd.google-apps.spreadsheet',
      md5Checksum: undefined,
      version: '12',
    });
    const alt = dok('drive-d', { quelle: 'drive', driveFileId: 'd', driveVersion: '12' });
    expect(planDriveSync([doc], [alt]).importFiles).toEqual([]);
    const neu = planDriveSync([{ ...doc, version: '13' }], [alt]);
    expect(neu.importFiles).toEqual([{ file: { ...doc, version: '13' }, dokumentId: 'drive-d', replaces: alt }]);
  });
});

describe('driveImportFormat', () => {
  it('lässt PDFs und Bilder, wie sie sind', () => {
    expect(driveImportFormat(file('a'))).toEqual({
      exportPdf: false,
      name: 'a.pdf',
      contentType: 'application/pdf',
    });
  });

  it.each([
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
    'application/vnd.google-apps.drawing',
  ])('exportiert %s als PDF mit Endung', (mimeType) => {
    expect(driveImportFormat(file('a', { name: 'Laufkarte EG', mimeType }))).toEqual({
      exportPdf: true,
      name: 'Laufkarte EG.pdf',
      contentType: 'application/pdf',
    });
  });

  it('hängt die Endung nicht doppelt an', () => {
    const f = file('a', { name: 'Plan.PDF', mimeType: 'application/vnd.google-apps.document' });
    expect(driveImportFormat(f).name).toBe('Plan.PDF');
  });
});
