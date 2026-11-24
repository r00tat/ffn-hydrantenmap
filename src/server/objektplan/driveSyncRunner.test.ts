import { describe, expect, it, vi } from 'vitest';
import type { DriveFileInfo } from '../../common/objektplan/driveSync';
import type { ObjektDokument } from '../../common/objektplan/objektDokument';
import { runDriveSync, type DriveSyncDeps } from './driveSyncRunner';

const FOLDER = 'https://drive.google.com/drive/folders/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N';
const NOW = '2026-11-23T10:00:00.000Z';

function fakeDeps(files: DriveFileInfo[], existing: ObjektDokument[] = []) {
  const written: ObjektDokument[] = [];
  const deps = {
    listFiles: vi.fn(async () => files),
    download: vi.fn(async (id: string) => new TextEncoder().encode(`inhalt-${id}`)),
    exportPdf: vi.fn(async (id: string) => new TextEncoder().encode(`export-${id}`)),
    index: vi.fn(async () => ({
      seiten: 1,
      seitenText: ['Brandmeldezentrale 3/05'],
      melder: [
        {
          kennung: '3/05',
          gruppe: 3,
          melder: 5,
          seite: 1,
          box: [0.1, 0.1, 0.2, 0.2] as [number, number, number, number],
        },
      ],
      textGekuerzt: false,
    })),
    saveFile: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
    loadDokumente: vi.fn(async () => existing),
    writeDokument: vi.fn(async (_o: string, d: ObjektDokument) => {
      written.push(d);
    }),
    deleteDokument: vi.fn(async () => {}),
  } satisfies DriveSyncDeps;
  return { deps, written };
}

const pdf: DriveFileInfo = {
  id: 'abcdefghijklmnopqrstuvwxyz',
  name: 'Brandschutzplan gesamt.pdf',
  mimeType: 'application/pdf',
  md5Checksum: 'md5-1',
  size: 2_400_000,
};

describe('runDriveSync', () => {
  it('meldet einen Link, der nicht auf Drive zeigt', async () => {
    const { deps } = fakeDeps([]);
    const result = await runDriveSync('obj', 'https://example.com/plan.pdf', deps, NOW);
    expect(result).toEqual({ status: 'keinDriveLink' });
    expect(deps.listFiles).not.toHaveBeenCalled();
  });

  it('holt eine neue Datei, indiziert sie und legt das Dokument an', async () => {
    const { deps, written } = fakeDeps([pdf]);
    const result = await runDriveSync('obj', FOLDER, deps, NOW);

    expect(result).toMatchObject({ status: 'ok', imported: 1, removed: 0, failed: 0 });
    expect(deps.download).toHaveBeenCalledWith(pdf.id);
    const path = `risikoobjekt/obj/drive-${pdf.id}-Brandschutzplan_gesamt.pdf`;
    expect(deps.saveFile).toHaveBeenCalledWith(path, expect.any(Uint8Array), 'application/pdf');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      id: `drive-${pdf.id}`,
      name: pdf.name,
      storagePath: path,
      size: pdf.size,
      indexStatus: 'ok',
      seiten: 1,
      quelle: 'drive',
      driveFileId: pdf.id,
      driveMd5: 'md5-1',
      createdAt: NOW,
      createdBy: 'drive',
    });
    expect(written[0].melder).toHaveLength(1);
    expect(written[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('schreibt das Dokument erst nach der Datei', async () => {
    const order: string[] = [];
    const { deps } = fakeDeps([pdf]);
    deps.saveFile.mockImplementation(async () => {
      order.push('datei');
    });
    deps.writeDokument.mockImplementation(async () => {
      order.push('dokument');
    });
    await runDriveSync('obj', FOLDER, deps, NOW);
    expect(order).toEqual(['datei', 'dokument']);
  });

  it('löscht die alte Datei, wenn eine umbenannte Datei neu geholt wird', async () => {
    const alt: ObjektDokument = {
      id: `drive-${pdf.id}`,
      name: 'alt.pdf',
      contentType: 'application/pdf',
      storagePath: `risikoobjekt/obj/drive-${pdf.id}-alt.pdf`,
      size: 1,
      sha256: 'x',
      indexStatus: 'ok',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'drive',
      quelle: 'drive',
      driveFileId: pdf.id,
      driveMd5: 'md5-0',
    };
    const { deps } = fakeDeps([pdf], [alt]);
    const result = await runDriveSync('obj', FOLDER, deps, NOW);
    expect(result).toMatchObject({ imported: 1 });
    expect(deps.deleteFile).toHaveBeenCalledWith(alt.storagePath);
  });

  it('entfernt Dokument und Datei, wenn die Drive-Datei fehlt', async () => {
    const weg: ObjektDokument = {
      id: 'drive-weg',
      name: 'weg.pdf',
      contentType: 'application/pdf',
      storagePath: 'risikoobjekt/obj/drive-weg-weg.pdf',
      size: 1,
      sha256: 'x',
      indexStatus: 'ok',
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'drive',
      quelle: 'drive',
      driveFileId: 'weg',
      driveMd5: 'm',
    };
    const { deps } = fakeDeps([], [weg]);
    const result = await runDriveSync('obj', FOLDER, deps, NOW);
    expect(result).toMatchObject({ status: 'ok', imported: 0, removed: 1 });
    expect(deps.deleteDokument).toHaveBeenCalledWith('obj', 'drive-weg');
    expect(deps.deleteFile).toHaveBeenCalledWith(weg.storagePath);
  });

  it('macht mit den übrigen Dateien weiter, wenn eine scheitert', async () => {
    const zweite = { ...pdf, id: 'zweitedateizweitedatei', name: 'b.pdf' };
    const { deps, written } = fakeDeps([pdf, zweite]);
    deps.download.mockImplementationOnce(async () => {
      throw new Error('403');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runDriveSync('obj', FOLDER, deps, NOW);
    expect(result).toMatchObject({ status: 'ok', imported: 1, failed: 1 });
    expect(written.map((d) => d.driveFileId)).toEqual([zweite.id]);
  });

  it('meldet einen Fehler, wenn der Ordner nicht lesbar ist', async () => {
    const { deps } = fakeDeps([]);
    deps.listFiles.mockRejectedValue(new Error('File not found'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await runDriveSync('obj', FOLDER, deps, NOW);
    expect(result).toEqual({ status: 'nichtLesbar' });
    expect(deps.deleteDokument).not.toHaveBeenCalled();
  });

  it('liest Scans per Texterkennung, sobald die Datei abgelegt ist', async () => {
    const { deps, written } = fakeDeps([pdf]);
    deps.index.mockResolvedValue({ seiten: 1, seitenText: [''], melder: [], textGekuerzt: false });
    const order: string[] = [];
    deps.saveFile.mockImplementation(async () => {
      order.push('datei');
    });
    const ocr = vi.fn(async () => {
      order.push('ocr');
      return { seiten: 1, seitenText: ['Gruppe 2/07'], melder: [], textGekuerzt: false };
    });
    await runDriveSync('obj', FOLDER, { ...deps, ocr }, NOW);
    expect(order).toEqual(['datei', 'ocr']);
    expect(ocr).toHaveBeenCalledWith(`risikoobjekt/obj/drive-${pdf.id}-Brandschutzplan_gesamt.pdf`);
    expect(written[0]).toMatchObject({ indexStatus: 'ok', ocr: true, seitenText: ['Gruppe 2/07'] });
  });

  it('legt den Scan auch ab, wenn die Texterkennung scheitert', async () => {
    const { deps, written } = fakeDeps([pdf]);
    deps.index.mockResolvedValue({ seiten: 1, seitenText: [''], melder: [], textGekuerzt: false });
    const ocr = vi.fn(async () => {
      throw new Error('Vision nicht erreichbar');
    });
    const result = await runDriveSync('obj', FOLDER, { ...deps, ocr }, NOW);
    expect(result).toMatchObject({ imported: 1, failed: 0 });
    expect(written[0]).toMatchObject({ indexStatus: 'ohneText' });
    expect(written[0].ocr).toBeUndefined();
  });

  it('liest auch PDFs mit Textebene, aber ohne Melder (Kennungen als Linien)', async () => {
    const { deps, written } = fakeDeps([pdf]);
    deps.index.mockResolvedValue({ seiten: 1, seitenText: ['LEGENDE'], melder: [], textGekuerzt: false });
    const box: [number, number, number, number] = [0.1, 0.1, 0.2, 0.2];
    const ocr = vi.fn(async () => ({
      seiten: 1,
      seitenText: ['1003/04'],
      melder: [{ kennung: '1003/04', gruppe: 1003, melder: 4, seite: 1, box }],
      textGekuerzt: false,
    }));
    await runDriveSync('obj', FOLDER, { ...deps, ocr }, NOW);
    expect(ocr).toHaveBeenCalled();
    expect(written[0]).toMatchObject({ indexStatus: 'ok', ocr: true, seitenText: ['LEGENDE\n1003/04'] });
    expect(written[0].melder).toHaveLength(1);
  });

  it('ruft die Texterkennung nicht für PDFs mit gefundenen Meldern auf', async () => {
    const { deps } = fakeDeps([pdf]);
    const ocr = vi.fn();
    await runDriveSync('obj', FOLDER, { ...deps, ocr }, NOW);
    expect(ocr).not.toHaveBeenCalled();
  });

  it('exportiert ein Google-Dokument als PDF und merkt sich die Version', async () => {
    const doc: DriveFileInfo = {
      id: 'googledokumentgoogledok',
      name: 'Einsatzplan Tiefgarage',
      mimeType: 'application/vnd.google-apps.document',
      version: '42',
    };
    const { deps, written } = fakeDeps([doc]);
    const result = await runDriveSync('obj', FOLDER, deps, NOW);

    expect(result).toMatchObject({ status: 'ok', imported: 1, failed: 0 });
    expect(deps.exportPdf).toHaveBeenCalledWith(doc.id);
    expect(deps.download).not.toHaveBeenCalled();
    const path = `risikoobjekt/obj/drive-${doc.id}-Einsatzplan_Tiefgarage.pdf`;
    expect(deps.saveFile).toHaveBeenCalledWith(path, expect.any(Uint8Array), 'application/pdf');
    expect(deps.index).toHaveBeenCalled();
    expect(written[0]).toMatchObject({
      name: 'Einsatzplan Tiefgarage.pdf',
      contentType: 'application/pdf',
      storagePath: path,
      size: new TextEncoder().encode(`export-${doc.id}`).byteLength,
      driveVersion: '42',
      indexStatus: 'ok',
    });
    expect(written[0].driveMd5).toBeUndefined();
  });
});
