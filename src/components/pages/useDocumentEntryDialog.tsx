'use client';

import { ReactNode, useCallback, useState } from 'react';
import useFirecallItemAdd from '../../hooks/useFirecallItemAdd';
import FirecallItemDialog from '../FirecallItems/FirecallItemDialog';
import type { FirecallItem } from '../firebase/firestore';

/** Einsatztagebuch (`diary`) oder Geschäftsbuch (`gb`). */
export type DocumentEntryKind = 'diary' | 'gb';

/**
 * Dialog für einen neuen Eintrag in Einsatztagebuch oder Geschäftsbuch,
 * gespeichert wie auf den Seiten selbst: als Element des Einsatzes mit der
 * nächsten laufenden Nummer.
 *
 * Eine Stelle für die Seiten, die Karten-Seitenleiste und das Tastenkürzel
 * (`components/hotkeys/GlobalHotkeys.tsx`), damit Nummerierung und Speichern
 * nicht an drei Orten auseinanderlaufen.
 */
export function DocumentEntryDialog({
  kind,
  nummer,
  onClose,
  autoFocusField,
}: {
  kind: DocumentEntryKind;
  /** Vorschlag für die laufende Nummer, im Dialog änderbar. */
  nummer: number;
  onClose: (saved?: FirecallItem) => void;
  autoFocusField?: string;
}) {
  const addItem = useFirecallItemAdd();
  const close = useCallback(
    (item?: FirecallItem) => {
      onClose(item);
      if (item) void addItem(item);
    },
    [addItem, onClose],
  );
  return (
    <FirecallItemDialog
      type={kind}
      item={{ type: kind, nummer } as Partial<FirecallItem> as FirecallItem}
      onClose={close}
      allowTypeChange={false}
      autoFocusField={autoFocusField}
    />
  );
}

export interface DocumentEntryDialogControl {
  open: () => void;
  isOpen: boolean;
  /** An beliebiger Stelle der Seite rendern. */
  dialog: ReactNode;
}

export function useDocumentEntryDialog(
  kind: DocumentEntryKind,
  nummer: number,
  { autoFocusField }: { autoFocusField?: string } = {},
): DocumentEntryDialogControl {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return {
    open,
    isOpen,
    dialog: isOpen ? (
      <DocumentEntryDialog
        kind={kind}
        nummer={nummer}
        onClose={close}
        autoFocusField={autoFocusField}
      />
    ) : null,
  };
}
