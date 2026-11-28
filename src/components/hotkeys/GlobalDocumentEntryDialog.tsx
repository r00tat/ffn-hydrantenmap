'use client';

import { useDiaries } from '../pages/EinsatzTagebuch';
import { useGeschaeftsbuchEintraege } from '../pages/Geschaeftsbuch';
import {
  DocumentEntryDialog,
  type DocumentEntryKind,
} from '../pages/useDocumentEntryDialog';

interface Props {
  onClose: () => void;
}

// Erst nach dem Laden öffnen: Der Dialog übernimmt die Nummer beim Öffnen,
// und ein Zähler aus einem noch leeren Einsatz schlüge `1` vor.

function DiaryEntry({ onClose }: Props) {
  const { diaryCounter, loading } = useDiaries();
  if (loading) return null;
  return <DocumentEntryDialog kind="diary" nummer={diaryCounter} onClose={onClose} />;
}

function GbEntry({ onClose }: Props) {
  const { diaryCounter, loading } = useGeschaeftsbuchEintraege();
  if (loading) return null;
  return <DocumentEntryDialog kind="gb" nummer={diaryCounter} onClose={onClose} />;
}

/**
 * Neuer Eintrag in Einsatztagebuch oder Geschäftsbuch von jeder Seite aus
 * (Kürzel `T` bzw. `G`), mit derselben Nummerierung wie auf den Seiten.
 */
export default function GlobalDocumentEntryDialog({
  kind,
  onClose,
}: Props & { kind: DocumentEntryKind }) {
  return kind === 'diary' ? (
    <DiaryEntry onClose={onClose} />
  ) : (
    <GbEntry onClose={onClose} />
  );
}
