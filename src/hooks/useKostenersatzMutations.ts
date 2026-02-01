'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { useCallback } from 'react';
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
import useFirebaseLogin from './useFirebaseLogin';
import { useFirecallId } from './useFirecall';

// ============================================================================
// Calculation Mutations
// ============================================================================

/**
 * Hook to add a new calculation to a firecall
 */
export function useKostenersatzAdd(firecallIdOverride?: string) {
  const contextFirecallId = useFirecallId();
  const firecallId = firecallIdOverride || contextFirecallId;
  const { email } = useFirebaseLogin();

  return useCallback(
    async (
      calculation: Omit<KostenersatzCalculation, 'id' | 'createdBy' | 'createdAt'>
    ) => {
      if (!firecallId || firecallId === 'unknown') {
        throw new Error('No firecall selected');
      }

      const now = new Date().toISOString();
      const newCalc: Omit<KostenersatzCalculation, 'id'> = {
        ...calculation,
        createdBy: email || 'unknown',
        createdAt: now,
        updatedAt: now,
      };

      console.info(`Adding kostenersatz calculation to firecall ${firecallId}`);

      const docRef = await addDoc(
        collection(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          KOSTENERSATZ_SUBCOLLECTION
        ),
        newCalc
      );

      return docRef.id;
    },
    [email, firecallId]
  );
}

/**
 * Hook to update an existing calculation
 */
export function useKostenersatzUpdate(firecallIdOverride?: string) {
  const contextFirecallId = useFirecallId();
  const firecallId = firecallIdOverride || contextFirecallId;
  const { email } = useFirebaseLogin();

  return useCallback(
    async (calculation: KostenersatzCalculation) => {
      if (!firecallId || firecallId === 'unknown') {
        throw new Error('No firecall selected');
      }

      const calcId = calculation.id;
      if (!calcId) {
        throw new Error('Calculation ID is required for update');
      }

      const updatedCalc = {
        ...calculation,
        updatedAt: new Date().toISOString(),
      };

      // Remove id from data (it's in the document path)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...dataWithoutId } = updatedCalc;

      console.info(
        `Updating kostenersatz calculation ${calcId} in firecall ${firecallId}`
      );

      await setDoc(
        doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          KOSTENERSATZ_SUBCOLLECTION,
          calcId
        ),
        dataWithoutId,
        { merge: false }
      );
    },
    [email, firecallId]
  );
}

/**
 * Hook to delete a calculation
 */
export function useKostenersatzDelete(firecallIdOverride?: string) {
  const contextFirecallId = useFirecallId();
  const firecallId = firecallIdOverride || contextFirecallId;

  return useCallback(
    async (calculationId: string) => {
      if (!firecallId || firecallId === 'unknown') {
        throw new Error('No firecall selected');
      }

      console.info(
        `Deleting kostenersatz calculation ${calculationId} from firecall ${firecallId}`
      );

      await deleteDoc(
        doc(
          firestore,
          FIRECALL_COLLECTION_ID,
          firecallId,
          KOSTENERSATZ_SUBCOLLECTION,
          calculationId
        )
      );
    },
    [firecallId]
  );
}

/**
 * Hook to duplicate a calculation
 */
export function useKostenersatzDuplicate(firecallIdOverride?: string) {
  const addCalculation = useKostenersatzAdd(firecallIdOverride);

  return useCallback(
    async (original: KostenersatzCalculation) => {
      // Create a copy without id, reset status to draft, clear tracking fields
      const { id, createdAt, createdBy, pdfUrl, emailSentAt, ...rest } = original;

      const duplicated = {
        ...rest,
        status: 'draft' as const,
        comment: original.comment
          ? `${original.comment} (Kopie)`
          : 'Kopie',
      };

      return await addCalculation(duplicated);
    },
    [addCalculation]
  );
}

// ============================================================================
// Template Mutations
// ============================================================================

/**
 * Hook to add a new template
 */
export function useKostenersatzTemplateAdd() {
  const { email } = useFirebaseLogin();

  return useCallback(
    async (template: Omit<KostenersatzTemplate, 'id' | 'createdBy' | 'createdAt'>) => {
      const now = new Date().toISOString();
      const newTemplate: Omit<KostenersatzTemplate, 'id'> = {
        ...template,
        createdBy: email || 'unknown',
        createdAt: now,
        updatedAt: now,
      };

      console.info(`Adding kostenersatz template: ${template.name}`);

      const docRef = await addDoc(
        collection(firestore, KOSTENERSATZ_TEMPLATES_COLLECTION),
        newTemplate
      );

      return docRef.id;
    },
    [email]
  );
}

/**
 * Hook to update a template
 */
export function useKostenersatzTemplateUpdate() {
  return useCallback(async (template: KostenersatzTemplate) => {
    const templateId = template.id;
    if (!templateId) {
      throw new Error('Template ID is required for update');
    }

    const updatedTemplate = {
      ...template,
      updatedAt: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, ...dataWithoutId } = updatedTemplate;

    console.info(`Updating kostenersatz template ${templateId}: ${template.name}`);

    await setDoc(
      doc(firestore, KOSTENERSATZ_TEMPLATES_COLLECTION, templateId),
      dataWithoutId,
      { merge: false }
    );
  }, []);
}

/**
 * Hook to delete a template
 */
export function useKostenersatzTemplateDelete() {
  return useCallback(async (templateId: string) => {
    console.info(`Deleting kostenersatz template ${templateId}`);

    await deleteDoc(doc(firestore, KOSTENERSATZ_TEMPLATES_COLLECTION, templateId));
  }, []);
}

/**
 * Hook to save a calculation as a template
 */
export function useKostenersatzSaveAsTemplate() {
  const addTemplate = useKostenersatzTemplateAdd();

  return useCallback(
    async (
      calculation: KostenersatzCalculation,
      name: string,
      description?: string,
      isShared: boolean = false
    ) => {
      const template: Omit<KostenersatzTemplate, 'id' | 'createdBy' | 'createdAt'> = {
        name,
        description,
        isShared,
        items: calculation.items.map((item) => ({
          rateId: item.rateId,
          einheiten: item.einheiten,
        })),
        defaultStunden: calculation.defaultStunden,
      };

      return await addTemplate(template);
    },
    [addTemplate]
  );
}

// ============================================================================
// Version & Rates Mutations (Admin only)
// ============================================================================

/**
 * Hook to create a new rate version
 */
export function useKostenersatzVersionAdd() {
  const { email } = useFirebaseLogin();

  return useCallback(
    async (version: Omit<KostenersatzVersion, 'createdAt' | 'createdBy'>) => {
      const now = new Date().toISOString();
      const newVersion: KostenersatzVersion = {
        ...version,
        createdAt: now,
        createdBy: email || 'unknown',
      };

      console.info(`Adding kostenersatz version: ${version.name}`);

      await setDoc(
        doc(firestore, KOSTENERSATZ_VERSIONS_COLLECTION, version.id),
        newVersion
      );

      return version.id;
    },
    [email]
  );
}

/**
 * Hook to update a rate version
 */
export function useKostenersatzVersionUpdate() {
  return useCallback(async (version: KostenersatzVersion) => {
    console.info(`Updating kostenersatz version: ${version.name}`);

    await setDoc(
      doc(firestore, KOSTENERSATZ_VERSIONS_COLLECTION, version.id),
      version,
      { merge: true }
    );
  }, []);
}

/**
 * Hook to set a version as active (and deactivate others)
 */
export function useKostenersatzVersionSetActive() {
  return useCallback(async (versionId: string, allVersions: KostenersatzVersion[]) => {
    const batch = writeBatch(firestore);

    // Deactivate all versions
    for (const version of allVersions) {
      batch.update(doc(firestore, KOSTENERSATZ_VERSIONS_COLLECTION, version.id), {
        isActive: version.id === versionId,
      });
    }

    console.info(`Setting kostenersatz version ${versionId} as active`);

    await batch.commit();
  }, []);
}

/**
 * Hook to add or update a rate
 */
export function useKostenersatzRateUpsert() {
  const { email } = useFirebaseLogin();

  return useCallback(
    async (rate: KostenersatzRate) => {
      // Document ID is combination of version and rate ID
      const docId = `${rate.version}_${rate.id}`;

      console.info(`Upserting kostenersatz rate ${docId}`);

      await setDoc(doc(firestore, KOSTENERSATZ_RATES_COLLECTION, docId), rate);
    },
    [email]
  );
}

/**
 * Hook to seed default rates for a version
 */
export function useKostenersatzSeedDefaultRates() {
  const { email } = useFirebaseLogin();

  return useCallback(
    async (version: KostenersatzVersion, rates: KostenersatzRate[]) => {
      const batch = writeBatch(firestore);

      // Add version
      batch.set(
        doc(firestore, KOSTENERSATZ_VERSIONS_COLLECTION, version.id),
        {
          ...version,
          createdAt: version.createdAt || new Date().toISOString(),
          createdBy: version.createdBy || email || 'system',
        }
      );

      // Add all rates
      for (const rate of rates) {
        const docId = `${version.id}_${rate.id}`;
        batch.set(doc(firestore, KOSTENERSATZ_RATES_COLLECTION, docId), {
          ...rate,
          version: version.id,
          validFrom: version.validFrom,
        });
      }

      console.info(
        `Seeding ${rates.length} default rates for version ${version.id}`
      );

      await batch.commit();
    },
    [email]
  );
}
