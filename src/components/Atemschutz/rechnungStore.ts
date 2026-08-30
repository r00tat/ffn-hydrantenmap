import 'server-only';

import { ATEMSCHUTZ_FUELLUNG_COLLECTION_ID, type AtemschutzGeraet } from '../../common/atemschutz';
import {
  ATEMSCHUTZ_CONFIG_COLLECTION_ID,
  ATEMSCHUTZ_EMPFAENGER_COLLECTION_ID,
  ATEMSCHUTZ_RECHNUNG_COLLECTION_ID,
  ATEMSCHUTZ_RECHNUNG_CONFIG_DOC,
  DEFAULT_RECHNUNG_CONFIG,
  FUELLUNG_TARIF_IDS,
  type AtemschutzRechnung,
  type AtemschutzRechnungConfig,
} from '../../common/atemschutzRechnung';
import {
  DEFAULT_VERSION_ID,
  getDefaultRatesWithVersion,
} from '../../common/defaultKostenersatzRates';
import {
  KOSTENERSATZ_RATES_COLLECTION,
  KOSTENERSATZ_VERSIONS_COLLECTION,
  type KostenersatzRate,
  type KostenersatzVersion,
} from '../../common/kostenersatz';
import { firestore } from '../../server/firebase/admin';
import { GROUP_COLLECTION_ID } from '../firebase/firestore';
import { loadGeraete } from './atemschutzStammdaten';

export function empfaengerRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(ATEMSCHUTZ_EMPFAENGER_COLLECTION_ID);
}

export function rechnungRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(ATEMSCHUTZ_RECHNUNG_COLLECTION_ID);
}

export function fuellungRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(ATEMSCHUTZ_FUELLUNG_COLLECTION_ID);
}

export function rechnungConfigRef(groupId: string) {
  return firestore
    .collection(GROUP_COLLECTION_ID)
    .doc(groupId)
    .collection(ATEMSCHUTZ_CONFIG_COLLECTION_ID)
    .doc(ATEMSCHUTZ_RECHNUNG_CONFIG_DOC);
}

export async function loadRechnungConfig(groupId: string): Promise<AtemschutzRechnungConfig> {
  const doc = await rechnungConfigRef(groupId).get();
  if (!doc.exists) return { ...DEFAULT_RECHNUNG_CONFIG };
  return { ...DEFAULT_RECHNUNG_CONFIG, ...doc.data() };
}

export async function loadRechnung(
  groupId: string,
  rechnungId: string,
): Promise<AtemschutzRechnung> {
  const doc = await rechnungRef(groupId).doc(rechnungId).get();
  if (!doc.exists) {
    throw new Error(`atemschutzRechnung ${rechnungId} not found`);
  }
  return { id: doc.id, ...doc.data() } as AtemschutzRechnung;
}

export interface FuellungTarife {
  /** rateId → Preis. */
  preise: Record<string, number>;
  rateVersion: string;
}

/**
 * Die beiden Fülltarife aus dem Kostenersatz-Katalog.
 *
 * Gelesen wird über das Admin SDK, das die Firestore-Regeln umgeht — die
 * Berechtigung steht im Action-Guard und wird hier nicht noch einmal geprüft.
 * Der Client zeigt dieselben Werte über `useKostenersatzRates()`; verbindlich
 * ist trotzdem, was hier herauskommt: Ein vom Client geschickter Betrag wird
 * nie geglaubt.
 */
export async function loadFuellungTarife(): Promise<FuellungTarife> {
  const versionSnapshot = await firestore
    .collection(KOSTENERSATZ_VERSIONS_COLLECTION)
    .where('isActive', '==', true)
    .limit(1)
    .get();
  const version = versionSnapshot.empty
    ? undefined
    : (versionSnapshot.docs[0].data() as KostenersatzVersion);
  const rateVersion = version?.id ?? DEFAULT_VERSION_ID;

  const snapshot = await firestore
    .collection(KOSTENERSATZ_RATES_COLLECTION)
    .where('version', '==', rateVersion)
    .get();

  const rates: KostenersatzRate[] = snapshot.empty
    ? getDefaultRatesWithVersion()
    : snapshot.docs.map((d) => d.data() as KostenersatzRate);

  const preise: Record<string, number> = {};
  for (const rate of rates) {
    if (FUELLUNG_TARIF_IDS.includes(rate.id)) preise[rate.id] = rate.price;
  }

  // Ein Katalog ohne Kategorie 5 wäre eine unvollständige Pflege, keine
  // Aussage „Füllen ist kostenlos". Dann gilt der Gesetzestext aus dem Code.
  for (const rateId of FUELLUNG_TARIF_IDS) {
    if (typeof preise[rateId] !== 'number') {
      const fallback = getDefaultRatesWithVersion().find((r) => r.id === rateId);
      if (fallback) preise[rateId] = fallback.price;
    }
  }

  return { preise, rateVersion };
}

/** `geraetId` → Volumen, für die informative Spalte in der Position. */
export async function loadVolumen(groupId: string): Promise<Record<string, number>> {
  const geraete: AtemschutzGeraet[] = await loadGeraete(groupId);
  const volumen: Record<string, number> = {};
  for (const geraet of geraete) {
    if (geraet.id && typeof geraet.volumenLiter === 'number') {
      volumen[geraet.id] = geraet.volumenLiter;
    }
  }
  return volumen;
}
