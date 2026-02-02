'use client';

import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import {
  DEFAULT_EMAIL_CONFIG,
  KostenersatzEmailConfig,
  KOSTENERSATZ_CONFIG_COLLECTION,
  KOSTENERSATZ_EMAIL_CONFIG_DOC,
} from '../common/kostenersatzEmail';
import useFirebaseLogin from './useFirebaseLogin';

/**
 * Load and manage email configuration from Firestore
 * Falls back to default config if none exists
 */
export function useKostenersatzEmailConfig() {
  const [config, setConfig] = useState<KostenersatzEmailConfig>(DEFAULT_EMAIL_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { email } = useFirebaseLogin();

  useEffect(() => {
    const docRef = doc(
      firestore,
      KOSTENERSATZ_CONFIG_COLLECTION,
      KOSTENERSATZ_EMAIL_CONFIG_DOC
    );

    const unsubscribe = onSnapshot(
      docRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setConfig(docSnapshot.data() as KostenersatzEmailConfig);
        } else {
          // Use default config if none exists
          setConfig(DEFAULT_EMAIL_CONFIG);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error loading email config:', err);
        setError(err);
        setConfig(DEFAULT_EMAIL_CONFIG);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /**
   * Save email configuration to Firestore
   */
  const saveConfig = useCallback(
    async (newConfig: Partial<KostenersatzEmailConfig>) => {
      const docRef = doc(
        firestore,
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
    [config, email]
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
