'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ATEMSCHUTZ_CONFIG_COLLECTION_ID,
  ATEMSCHUTZ_RECHNUNG_CONFIG_DOC,
  DEFAULT_RECHNUNG_CONFIG,
  type AtemschutzRechnungConfig,
} from '../common/atemschutzRechnung';
import { firestore } from '../components/firebase/firebase';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';

/**
 * Die Rechnungskonfiguration einer Gruppe, mit den Vorgaben aufgefüllt.
 *
 * Ohne gepflegtes Dokument gelten `DEFAULT_RECHNUNG_CONFIG` — vor allem der
 * Vorgabetarif `5.01`, ohne den der Dialog keinen Preis anzeigen könnte.
 */
export default function useAtemschutzRechnungConfig(groupId?: string): AtemschutzRechnungConfig {
  const [geladen, setGeladen] = useState<{
    groupId: string;
    config: AtemschutzRechnungConfig;
  }>();

  useEffect(() => {
    if (!groupId) return;
    const unsubscribe = onSnapshot(
      doc(
        firestore,
        GROUP_COLLECTION_ID,
        groupId,
        ATEMSCHUTZ_CONFIG_COLLECTION_ID,
        ATEMSCHUTZ_RECHNUNG_CONFIG_DOC,
      ),
      (snapshot) => {
        setGeladen({
          groupId,
          config: { ...DEFAULT_RECHNUNG_CONFIG, ...(snapshot.data() ?? {}) },
        });
      },
      (err) => {
        console.error('useAtemschutzRechnungConfig failed', err);
        setGeladen({ groupId, config: { ...DEFAULT_RECHNUNG_CONFIG } });
      },
    );
    return () => unsubscribe();
  }, [groupId]);

  if (!groupId || !geladen || geladen.groupId !== groupId) {
    return DEFAULT_RECHNUNG_CONFIG;
  }
  return geladen.config;
}
