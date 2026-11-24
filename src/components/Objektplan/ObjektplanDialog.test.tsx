// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObjektDokument } from '../../common/objektplan/objektDokument';
import { renderWithIntl } from '../../test-utils/intlRender';

const firebaseLoginMock = vi.fn();
vi.mock('../../hooks/useFirebaseLogin', () => ({
  default: () => firebaseLoginMock(),
}));

const dokumente: ObjektDokument[] = [
  {
    id: 'eg',
    name: 'Erdgeschoss.pdf',
    contentType: 'application/pdf',
    storagePath: 'risikoobjekt/ro1/eg-Erdgeschoss.pdf',
    size: 100,
    sha256: 'abc',
    indexStatus: 'ok',
    seiten: 2,
    seitenText: ['Heizraum', 'Legende'],
    melder: [
      { kennung: '3/05E', gruppe: 3, melder: 5, zusatz: 'E', seite: 2, box: [0.1, 0.2, 0.3, 0.4] },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'admin@example.com',
  },
  {
    id: 'scan',
    name: 'Lageplan.pdf',
    contentType: 'application/pdf',
    storagePath: 'risikoobjekt/ro1/scan-Lageplan.pdf',
    size: 100,
    sha256: 'def',
    indexStatus: 'ohneText',
    seiten: 1,
    seitenText: [''],
    melder: [],
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'admin@example.com',
  },
];

// Upload, Storage und Firestore sind hier nicht Gegenstand; die Liste kommt fest.
const uploadMock = vi.fn();
const listMock = vi.fn();
vi.mock('./objektDokumente', () => ({
  useObjektDokumente: (art: string, id: string | undefined) => {
    listMock(art, id);
    return { dokumente, loading: false, fromCache: false };
  },
  uploadObjektDokument: (...args: unknown[]) => uploadMock(...args),
  checkObjektDokumentFile: vi.fn(() => null),
}));

const syncMock = vi.fn();
vi.mock('./objektplanActions', () => ({
  syncObjektDokumenteFromDrive: (art: string, id: string) => syncMock(art, id),
}));

const deleteActionMock = vi.fn();
const ocrActionMock = vi.fn();
const reindexActionMock = vi.fn();
vi.mock('./risikoobjektActions', () => ({
  reindexObjektDokumentAction: (...args: unknown[]) => reindexActionMock(...args),
  deleteObjektDokumentAction: (...args: unknown[]) => deleteActionMock(...args),
  ocrObjektDokumentAction: (...args: unknown[]) => ocrActionMock(...args),
}));

const onlineMock = vi.fn(() => true);
vi.mock('../../hooks/useOnline', () => ({ default: () => onlineMock() }));

// Der Viewer zieht pdfjs nach sich; hier zählt nur, was er bekommt.
vi.mock('./PlanViewer', () => ({
  default: (props: {
    dokument: ObjektDokument;
    page: number;
    highlights?: unknown[];
    jumpKey?: number;
    expanded?: boolean;
    onToggleExpanded?: () => void;
  }) => (
    <div data-testid="viewer" data-jump={props.jumpKey ?? 0} data-expanded={String(!!props.expanded)}>
      {props.dokument.id}|{props.page}|{JSON.stringify(props.highlights ?? [])}
      <button onClick={props.onToggleExpanded}>toggle</button>
    </div>
  ),
}));

import type { PlanObjekt } from '../../common/objektplan/objektArt';
import ObjektplanDialog from './ObjektplanDialog';

const objekt: PlanObjekt = {
  art: 'risikoobjekt',
  id: 'ro1',
  name: 'Volksschule',
  ortschaft: 'Neusiedl',
  adresse: 'Musterstraße 1',
  risikogruppe: 'B',
  einsatzplanummer: '1',
  erfassungsdatum: '',
  lat: 47.9,
  lng: 16.8,
  groups: ['ffx'],
};

beforeEach(() => {
  vi.clearAllMocks();
  firebaseLoginMock.mockReturnValue({
    isAdmin: false,
    email: 'user@example.com',
    groupRoles: { ffx: [] },
  });
  onlineMock.mockReturnValue(true);
  syncMock.mockResolvedValue({ status: 'ok', imported: 0, removed: 0, skipped: 0, failed: 0 });
});

const DRIVE = 'https://drive.google.com/drive/folders/1ZZGoCghcnWT-rPviKC2wAEjIBvIHZk3N';

describe('ObjektplanDialog', () => {
  it('blendet Suche und Liste aus, wenn der Plan vergrößert wird', () => {
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    expect(screen.getByTestId('objektplan-sidebar')).toBeVisible();
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('objektplan-sidebar')).not.toBeVisible();
    expect(screen.getByTestId('viewer')).toHaveAttribute('data-expanded', 'true');
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('objektplan-sidebar')).toBeVisible();
  });

  it('zeigt die erste Unterlage und die Liste mit Status', () => {
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    expect(screen.getByTestId('viewer')).toHaveTextContent('eg|1|[]');
    expect(screen.getByText('1 Melder')).toBeInTheDocument();
    expect(screen.getByText('Scan')).toBeInTheDocument();
  });

  it('findet einen Melder und übergibt seine Lage an den Viewer', () => {
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    fireEvent.change(screen.getByLabelText('Melder oder Text suchen'), {
      target: { value: 'MG 3 M 5' },
    });
    fireEvent.click(screen.getByText('3/05E'));
    expect(screen.getByTestId('viewer')).toHaveTextContent('eg|2|[[0.1,0.2,0.3,0.4]]');
  });

  it('öffnet mit Enter den ersten Treffer', () => {
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    const input = screen.getByLabelText('Melder oder Text suchen');
    fireEvent.change(input, { target: { value: '3/5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('viewer')).toHaveTextContent('eg|2|');
  });

  it('meldet, wenn nichts gefunden wird', () => {
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    fireEvent.change(screen.getByLabelText('Melder oder Text suchen'), {
      target: { value: 'Tiefgarage' },
    });
    expect(screen.getByText('Nichts gefunden.')).toBeInTheDocument();
  });

  it('springt bei erneutem Enter noch einmal zum Treffer', () => {
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    const input = screen.getByLabelText('Melder oder Text suchen');
    fireEvent.change(input, { target: { value: '3/5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const first = Number(screen.getByTestId('viewer').dataset.jump);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(Number(screen.getByTestId('viewer').dataset.jump)).toBe(first + 1);
  });

  it('bietet Hochladen und Löschen nur an, wer das Objekt pflegt', () => {
    const { unmount } = renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />,
    );
    expect(screen.queryByText('Unterlagen hochladen')).not.toBeInTheDocument();
    unmount();

    firebaseLoginMock.mockReturnValue({
      isAdmin: false,
      email: 'gruppenadmin@example.com',
      groupRoles: { ffx: ['gruppenadmin'] },
    });
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    expect(screen.getByText('Unterlagen hochladen')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Löschen')).toHaveLength(2);
  });

  it('zeigt Pläne eines nicht freigegebenen Objekts nicht an', () => {
    renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={{ ...objekt, groups: ['andere'], link: DRIVE }} />,
    );
    expect(
      screen.getByText('Die Pläne dieses Objekts sind für deine Gruppen nicht freigegeben.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('viewer')).not.toBeInTheDocument();
    expect(syncMock).not.toHaveBeenCalled();
  });
  it('gleicht beim Öffnen mit dem Drive-Link ab', async () => {
    renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={{ ...objekt, link: DRIVE }} />,
    );
    await waitFor(() => expect(syncMock).toHaveBeenCalledWith('risikoobjekt', 'ro1'));
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it('gleicht ohne Drive-Link, offline oder geschlossen nicht ab', () => {
    const { unmount } = renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={{ ...objekt, link: 'https://example.com/a.pdf' }} />,
    );
    unmount();
    const closed = renderWithIntl(
      <ObjektplanDialog open={false} onClose={vi.fn()} objekt={{ ...objekt, link: DRIVE }} />,
    );
    closed.unmount();
    onlineMock.mockReturnValue(false);
    renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={{ ...objekt, link: DRIVE }} />,
    );
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('meldet, wenn der Drive-Ordner nicht lesbar ist', async () => {
    syncMock.mockResolvedValue({ status: 'nichtLesbar' });
    renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={{ ...objekt, link: DRIVE }} />,
    );
    expect(
      await screen.findByText('Der Drive-Ordner ist für die App nicht lesbar.'),
    ).toBeInTheDocument();
  });

  it('bietet für Unterlagen aus Drive kein Löschen an', () => {
    dokumente[1].quelle = 'drive';
    firebaseLoginMock.mockReturnValue({ isAdmin: true, email: 'admin@example.com' });
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    expect(screen.getAllByLabelText('Löschen')).toHaveLength(1);
    expect(screen.getByText('Drive')).toBeInTheDocument();
    delete dokumente[1].quelle;
  });

  it('bietet die Texterkennung für Scans an, wer das Objekt pflegt', async () => {
    const { unmount } = renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />,
    );
    expect(screen.queryByRole('button', { name: 'Text erkennen (OCR)' })).not.toBeInTheDocument();
    unmount();

    firebaseLoginMock.mockReturnValue({
      isAdmin: false,
      email: 'gruppenadmin@example.com',
      groupRoles: { ffx: ['gruppenadmin'] },
    });
    ocrActionMock.mockResolvedValue({ ok: true, id: 'scan', hasText: true, melder: 2 });
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    // Nur der Scan, nicht das PDF mit Textebene.
    expect(screen.getAllByRole('button', { name: 'Text erkennen (OCR)' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Text erkennen (OCR)' }));
    await waitFor(() => expect(ocrActionMock).toHaveBeenCalledWith('risikoobjekt', 'ro1', 'scan'));
  });

  it('bietet keine zweite Texterkennung an und kennzeichnet erkannten Text', () => {
    dokumente[1].ocr = true;
    dokumente[0].ocr = true;
    firebaseLoginMock.mockReturnValue({ isAdmin: true, email: 'admin@example.com' });
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    expect(screen.queryByRole('button', { name: 'Text erkennen (OCR)' })).not.toBeInTheDocument();
    expect(screen.getByText('OCR')).toBeInTheDocument();
    delete dokumente[1].ocr;
    delete dokumente[0].ocr;
  });

  it('erkennt nach dem Hochladen eines Scans gleich den Text', async () => {
    firebaseLoginMock.mockReturnValue({ isAdmin: true, email: 'admin@example.com' });
    uploadMock.mockResolvedValue({ ...dokumente[1], id: 'neu' });
    ocrActionMock.mockResolvedValue({ ok: true, id: 'neu', hasText: true, melder: 3 });
    renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('Text erkannt, 3 Melder gefunden')).toBeInTheDocument();
    expect(ocrActionMock).toHaveBeenCalledWith('risikoobjekt', 'ro1', 'neu');
  });

  it('meldet, wenn die Texterkennung scheitert', async () => {
    firebaseLoginMock.mockReturnValue({ isAdmin: true, email: 'admin@example.com' });
    uploadMock.mockResolvedValue({ ...dokumente[1], id: 'neu' });
    ocrActionMock.mockResolvedValue({ ok: false, error: 'ocrFailed' });
    renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />,
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByText('Texterkennung fehlgeschlagen')).toBeInTheDocument();
  });

  it('liest einen Plan neu ein, wer das Objekt pflegt, und meldet das Ergebnis', async () => {
    const { unmount } = renderWithIntl(
      <ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />,
    );
    expect(screen.queryByRole('button', { name: 'Neu einlesen' })).not.toBeInTheDocument();
    unmount();

    firebaseLoginMock.mockReturnValue({ isAdmin: true, email: 'admin@example.com' });
    reindexActionMock.mockResolvedValue({ ok: true, id: 'scan', indexStatus: 'ok', melder: 4, ocr: true });
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    // Jede PDF-Unterlage, auch die mit gefundenen Meldern.
    expect(screen.getAllByRole('button', { name: 'Neu einlesen' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Neu einlesen' })[1]);
    expect(
      await screen.findByText('Lageplan.pdf: neu eingelesen, 4 Melder gefunden (mit OCR).'),
    ).toBeInTheDocument();
    expect(reindexActionMock).toHaveBeenCalledWith('risikoobjekt', 'ro1', 'scan');
  });

  it('meldet, wenn das Neu-Einlesen scheitert', async () => {
    firebaseLoginMock.mockReturnValue({ isAdmin: true, email: 'admin@example.com' });
    reindexActionMock.mockResolvedValue({ ok: false, error: 'reindexFailed' });
    renderWithIntl(<ObjektplanDialog open onClose={vi.fn()} objekt={objekt} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Neu einlesen' })[0]);
    expect(
      await screen.findByText('Erdgeschoss.pdf: Neu einlesen fehlgeschlagen.'),
    ).toBeInTheDocument();
  });

  it('liest und gleicht die Pläne eines gefährdeten Objekts unter dessen Art ab', async () => {
    renderWithIntl(
      <ObjektplanDialog
        open
        onClose={vi.fn()}
        objekt={{ ...objekt, art: 'gefahrobjekt', id: 'nd_markt', link: DRIVE }}
      />,
    );
    expect(listMock).toHaveBeenCalledWith('gefahrobjekt', 'nd_markt');
    await waitFor(() => expect(syncMock).toHaveBeenCalledWith('gefahrobjekt', 'nd_markt'));
  });
});
