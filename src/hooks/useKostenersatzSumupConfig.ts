'use client';

import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  KostenersatzSumupConfig,
  DEFAULT_SUMUP_CONFIG,
  KOSTENERSATZ_SUMUP_CONFIG_DOC,
} from '../common/kostenersatz';
import {
  KOSTENERSATZ_CONFIG_COLLECTION,
} from '../common/kostenersatzEmail';
import useFirebaseLogin from './useFirebaseLogin';

/**
 * Load and manage SumUp configuration from Firestore
 * Falls back to default config if none exists
 */
export function useKostenersatzSumupConfig() {
  const [config, setConfig] = useState<KostenersatzSumupConfig>(DEFAULT_SUMUP_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { email } = useFirebaseLogin();

  useEffect(() => {
    const docRef = doc(
      firestore,
      KOSTENERSATZ_CONFIG_COLLECTION,
      KOSTENERSATZ_SUMUP_CONFIG_DOC
    );

    const unsubscribe = onSnapshot(
      docRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setConfig(docSnapshot.data() as KostenersatzSumupConfig);
        } else {
          setConfig(DEFAULT_SUMUP_CONFIG);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error loading SumUp config:', err);
        setError(err);
        setConfig(DEFAULT_SUMUP_CONFIG);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /**
   * Save SumUp configuration to Firestore
   */
  const saveConfig = useCallback(
    async (newConfig: Partial<KostenersatzSumupConfig>) => {
      const docRef = doc(
        firestore,
        KOSTENERSATZ_CONFIG_COLLECTION,
        KOSTENERSATZ_SUMUP_CONFIG_DOC
      );

      const updatedConfig: KostenersatzSumupConfig = {
        ...config,
        ...newConfig,
      };

      try {
        await setDoc(docRef, updatedConfig);
        return true;
      } catch (err) {
        console.error('Error saving SumUp config:', err);
        throw err;
      }
    },
    [config]
  );

  return {
    config,
    loading,
    error,
    saveConfig,
  };
}
