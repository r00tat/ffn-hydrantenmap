'use client';

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { firestore } from '../components/firebase/firebase';
import { FIRECALL_COLLECTION_ID } from '../components/firebase/firestore';
import {
  KostenersatzCalculation,
  KostenersatzRate,
  KostenersatzTemplate,
  KostenersatzVersion,
  KOSTENERSATZ_RATES_COLLECTION,
  KOSTENERSATZ_SUBCOLLECTION,
  KOSTENERSATZ_TEMPLATES_COLLECTION,
  KOSTENERSATZ_VERSIONS_COLLECTION,
} from '../common/kostenersatz';
import {
  DEFAULT_VERSION,
  getDefaultRatesWithVersion,
  groupRatesByCategory,
} from '../common/defaultKostenersatzRates';
import useFirebaseLogin from './useFirebaseLogin';

// ============================================================================
// Rate Versions Hook
// ============================================================================

/**
 * Load all rate versions from Firestore
 * Returns the active version and all available versions
 */
export function useKostenersatzVersions() {
  const [versions, setVersions] = useState<KostenersatzVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(
      collection(firestore, KOSTENERSATZ_VERSIONS_COLLECTION),
      orderBy('validFrom', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const versionList: KostenersatzVersion[] = [];
        snapshot.forEach((doc) => {
          versionList.push({
            id: doc.id,
            ...doc.data(),
          } as KostenersatzVersion);
        });

        // If no versions exist, use default
        if (versionList.length === 0) {
          versionList.push(DEFAULT_VERSION);
        }

        setVersions(versionList);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading kostenersatz versions:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const activeVersion = useMemo(
    () => versions.find((v) => v.isActive) || versions[0],
    [versions]
  );

  return { versions, activeVersion, loading, error };
}

// ============================================================================
// Rates Hook
// ============================================================================

/**
 * Load rates for a specific version (or active version)
 * Falls back to default rates if none exist in Firestore
 */
export function useKostenersatzRates(versionId?: string) {
  const [rates, setRates] = useState<KostenersatzRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { activeVersion } = useKostenersatzVersions();

  const targetVersion = versionId || activeVersion?.id;

  useEffect(() => {
    if (!targetVersion) {
      // Use default rates while loading
      setRates(getDefaultRatesWithVersion());
      setLoading(false);
      return;
    }

    const q = query(
      collection(firestore, KOSTENERSATZ_RATES_COLLECTION),
      where('version', '==', targetVersion)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rateList: KostenersatzRate[] = [];
        snapshot.forEach((doc) => {
          rateList.push({
            id: doc.data().id, // Use the rate ID from data, not doc ID
            ...doc.data(),
          } as KostenersatzRate);
        });

        // If no rates exist for this version, use defaults
        if (rateList.length === 0) {
          setRates(getDefaultRatesWithVersion());
        } else {
          // Sort by sortOrder client-side
          rateList.sort((a, b) => a.sortOrder - b.sortOrder);
          setRates(rateList);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error loading kostenersatz rates:', err);
        setError(err);
        setRates(getDefaultRatesWithVersion());
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [targetVersion]);

  // Group rates by category for easy access
  const ratesByCategory = useMemo(() => groupRatesByCategory(rates), [rates]);

  // Create a lookup map for quick rate access by ID
  const ratesById = useMemo(() => {
    const map = new Map<string, KostenersatzRate>();
    rates.forEach((rate) => map.set(rate.id, rate));
    return map;
  }, [rates]);

  return { rates, ratesByCategory, ratesById, loading, error };
}

// ============================================================================
// Templates Hook
// ============================================================================

/**
 * Load templates - both shared and user's personal templates
 */
export function useKostenersatzTemplates() {
  const [templates, setTemplates] = useState<KostenersatzTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { email } = useFirebaseLogin();

  useEffect(() => {
    // Load all templates (we filter on client for now)
    // In production, you might want to use two queries or a composite index
    const q = query(
      collection(firestore, KOSTENERSATZ_TEMPLATES_COLLECTION),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const templateList: KostenersatzTemplate[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as KostenersatzTemplate;
          // Include if shared OR created by current user
          if (data.isShared || data.createdBy === email) {
            templateList.push({
              id: doc.id,
              ...data,
            });
          }
        });
        setTemplates(templateList);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading kostenersatz templates:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [email]);

  // Separate shared and personal templates
  const sharedTemplates = useMemo(
    () => templates.filter((t) => t.isShared),
    [templates]
  );

  const personalTemplates = useMemo(
    () => templates.filter((t) => !t.isShared && t.createdBy === email),
    [templates, email]
  );

  return { templates, sharedTemplates, personalTemplates, loading, error };
}

// ============================================================================
// Calculations Hook (for a specific firecall)
// ============================================================================

/**
 * Load all calculations for a specific firecall
 */
export function useFirecallKostenersatz(firecallId: string | undefined) {
  const [calculations, setCalculations] = useState<KostenersatzCalculation[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!firecallId || firecallId === 'unknown') {
      setCalculations([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(
        firestore,
        FIRECALL_COLLECTION_ID,
        firecallId,
        KOSTENERSATZ_SUBCOLLECTION
      ),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const calcList: KostenersatzCalculation[] = [];
        snapshot.forEach((doc) => {
          calcList.push({
            id: doc.id,
            ...doc.data(),
          } as KostenersatzCalculation);
        });
        setCalculations(calcList);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading kostenersatz calculations:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [firecallId]);

  return { calculations, loading, error };
}

// ============================================================================
// Single Calculation Hook
// ============================================================================

/**
 * Load a single calculation by ID
 */
export function useKostenersatzCalculation(
  firecallId: string | undefined,
  calculationId: string | undefined
) {
  const [calculation, setCalculation] =
    useState<KostenersatzCalculation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (
      !firecallId ||
      firecallId === 'unknown' ||
      !calculationId ||
      calculationId === 'new'
    ) {
      setCalculation(null);
      setLoading(false);
      return;
    }

    const docRef = doc(
      firestore,
      FIRECALL_COLLECTION_ID,
      firecallId,
      KOSTENERSATZ_SUBCOLLECTION,
      calculationId
    );

    const unsubscribe = onSnapshot(
      docRef,
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setCalculation({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          } as KostenersatzCalculation);
        } else {
          setCalculation(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error loading kostenersatz calculation:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [firecallId, calculationId]);

  return { calculation, loading, error };
}

// ============================================================================
// Calculation Statistics Hook
// ============================================================================

/**
 * Get statistics for calculations in a firecall
 */
export function useKostenersatzStats(firecallId: string | undefined) {
  const { calculations, loading, error } = useFirecallKostenersatz(firecallId);

  const stats = useMemo(() => {
    if (!calculations.length) {
      return {
        total: 0,
        drafts: 0,
        completed: 0,
        sent: 0,
        totalSum: 0,
      };
    }

    return {
      total: calculations.length,
      drafts: calculations.filter((c) => c.status === 'draft').length,
      completed: calculations.filter((c) => c.status === 'completed').length,
      sent: calculations.filter((c) => c.status === 'sent').length,
      totalSum: calculations.reduce((sum, c) => sum + c.totalSum, 0),
    };
  }, [calculations]);

  return { stats, loading, error };
}
