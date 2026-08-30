'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { setDoc } from '../lib/firestoreClient';
import { firestore } from '../components/firebase/firebase';
import {
  DEFAULT_EMAIL_CONFIG,
  KostenersatzEmailConfig,
  KOSTENERSATZ_CONFIG_COLLECTION,
  KOSTENERSATZ_EMAIL_CONFIG_DOC,
} from '../common/kostenersatzEmail';
import { GROUP_COLLECTION_ID } from '../components/firebase/firestore';
import useFirebaseLogin from './useFirebaseLogin';

/**
 * Mailvorlagen des Kostenersatzes einer Gruppe, mit den Vorgaben als Rückfall.
 *
 * Je Gruppe und nicht mehr app-weit: Der Vorlagentext nennt über
 * `{{ absender.* }}` die Bankverbindung, und die steht in den
 * Gruppen-Stammdaten. Eine gemeinsame Vorlage trüge die IBAN einer fremden
 * Feuerwehr.
 *
 * Der geladene Stand trägt seine `groupId` mit und wird beim Rendern
 * ausgewertet, statt sie im Effekt-Rumpf zurückzusetzen: Ein `setState` dort
 * löst eine Renderkaskade aus (ESLint `react-hooks/set-state-in-effect`) —
 * dieselbe Bauweise wie in `useGroupFeuerwehrName`.
 */
export function useKostenersatzEmailConfig(groupId?: string) {
  const [geladen, setGeladen] = useState<{
    groupId: string;
    config: KostenersatzEmailConfig;
  }>();
  const [error, setError] = useState<Error | null>(null);
  const { email } = useFirebaseLogin();

  useEffect(() => {
    if (!groupId) return;

    const docRef = doc(
      firestore,
      GROUP_COLLECTION_ID,
      groupId,
      KOSTENERSATZ_CONFIG_COLLECTION,
      KOSTENERSATZ_EMAIL_CONFIG_DOC
    );

    const unsubscribe = onSnapshot(
      docRef,
      (docSnapshot) => {
        setGeladen({
          groupId,
          // Mit den Vorgaben aufgefüllt: Ein Dokument aus der Zeit vor einem
          // Feld trüge es sonst als `undefined` in die Vorlage.
          config: {
            ...DEFAULT_EMAIL_CONFIG,
            ...((docSnapshot.data() as KostenersatzEmailConfig | undefined) ?? {}),
          },
        });
      },
      (err) => {
        console.error('Error loading email config:', err);
        setError(err);
        setGeladen({ groupId, config: DEFAULT_EMAIL_CONFIG });
      }
    );

    return () => unsubscribe();
  }, [groupId]);

  const passt = !!groupId && geladen?.groupId === groupId;
  const config = passt ? geladen.config : DEFAULT_EMAIL_CONFIG;
  const loading = !!groupId && !passt;

  /**
   * Save email configuration to Firestore
   */
  const saveConfig = useCallback(
    async (newConfig: Partial<KostenersatzEmailConfig>) => {
      if (!groupId) throw new Error('no group selected');
      const docRef = doc(
        firestore,
        GROUP_COLLECTION_ID,
        groupId,
        KOSTENERSATZ_CONFIG_COLLECTION,
        KOSTENERSATZ_EMAIL_CONFIG_DOC
      );

      const updatedConfig: KostenersatzEmailConfig = {
        ...config,
        ...newConfig,
        updatedAt: new Date().toISOString(),
        updatedBy: email || 'unknown',
      };

      try {
        await setDoc(docRef, updatedConfig);
        return true;
      } catch (err) {
        console.error('Error saving email config:', err);
        throw err;
      }
    },
    [config, email, groupId]
  );

  /**
   * Reset configuration to defaults
   */
  const resetToDefaults = useCallback(async () => {
    return saveConfig(DEFAULT_EMAIL_CONFIG);
  }, [saveConfig]);

  return {
    config,
    loading,
    error,
    saveConfig,
    resetToDefaults,
  };
}
