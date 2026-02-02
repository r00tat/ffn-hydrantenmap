/**
 * Seed Kostenersatz default rates to Firestore
 *
 * Usage:
 *   npx ts-node scripts/seedKostenersatzRates.ts
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS environment variable
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  DEFAULT_RATES,
  DEFAULT_VERSION,
  DEFAULT_VERSION_ID,
} from '../src/common/defaultKostenersatzRates';
import {
  KOSTENERSATZ_RATES_COLLECTION,
  KOSTENERSATZ_VERSIONS_COLLECTION,
} from '../src/common/kostenersatz';

async function seedRates() {
  // Initialize Firebase Admin if not already initialized
  if (getApps().length === 0) {
    const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!serviceAccount) {
      console.error('GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
      process.exit(1);
    }

    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  const db = getFirestore();
  const batch = db.batch();

  console.log('Seeding Kostenersatz rates...');

  // Add version
  const versionRef = db.collection(KOSTENERSATZ_VERSIONS_COLLECTION).doc(DEFAULT_VERSION_ID);
  batch.set(versionRef, {
    ...DEFAULT_VERSION,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  });
  console.log(`  - Version: ${DEFAULT_VERSION.name}`);

  // Add all rates
  let count = 0;
  for (const rate of DEFAULT_RATES) {
    const docId = `${DEFAULT_VERSION_ID}_${rate.id}`;
    const rateRef = db.collection(KOSTENERSATZ_RATES_COLLECTION).doc(docId);
    batch.set(rateRef, {
      ...rate,
      version: DEFAULT_VERSION_ID,
      validFrom: DEFAULT_VERSION.validFrom,
    });
    count++;
  }
  console.log(`  - Rates: ${count}`);

  // Commit batch
  await batch.commit();
  console.log('Done!');
}

// Run if executed directly
seedRates().catch((error) => {
  console.error('Error seeding rates:', error);
  process.exit(1);
});
