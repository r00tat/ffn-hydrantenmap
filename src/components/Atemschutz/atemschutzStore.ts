'use client';

import { collection, doc, type CollectionReference } from 'firebase/firestore';
import {
  ATEMSCHUTZ_AUSGABE_COLLECTION_ID,
  ATEMSCHUTZ_FUELLUNG_COLLECTION_ID,
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
  type AtemschutzAusgabe,
  type AtemschutzFuellung,
  type AtemschutzTrupp,
} from '../../common/atemschutz';
import { addDoc, deleteDoc, updateDoc } from '../../lib/firestoreClient';
import { firestore } from '../firebase/firebase';
import { FIRECALL_COLLECTION_ID } from '../firebase/firestore';

/** Wer geschrieben hat und wann — dieselben vier Felder wie überall sonst. */
export interface AtemschutzActor {
  userId: string;
  now: string;
}

function firecallCollection(
  firecallId: string,
  name: string,
): CollectionReference {
  return collection(firestore, FIRECALL_COLLECTION_ID, firecallId, name);
}

export function fuellungCollection(firecallId: string) {
  return firecallCollection(firecallId, ATEMSCHUTZ_FUELLUNG_COLLECTION_ID);
}

export function truppCollection(firecallId: string) {
  return firecallCollection(firecallId, ATEMSCHUTZ_TRUPP_COLLECTION_ID);
}

export function ausgabeCollection(firecallId: string) {
  return firecallCollection(firecallId, ATEMSCHUTZ_AUSGABE_COLLECTION_ID);
}

/** Systemfelder beim Anlegen. */
function created(actor: AtemschutzActor) {
  return {
    createdAt: actor.now,
    createdBy: actor.userId,
    updatedAt: actor.now,
    updatedBy: actor.userId,
  };
}

/** Systemfelder beim Ändern. */
function touched(actor: AtemschutzActor) {
  return { updatedAt: actor.now, updatedBy: actor.userId };
}

export type NeueFuellung = Omit<
  AtemschutzFuellung,
  'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'
>;

export async function addFuellung(
  firecallId: string,
  data: NeueFuellung,
  actor: AtemschutzActor,
): Promise<string> {
  const ref = await addDoc(fuellungCollection(firecallId), {
    ...data,
    ...created(actor),
  });
  return ref.id;
}

export async function updateFuellung(
  firecallId: string,
  fuellungId: string,
  patch: Partial<NeueFuellung>,
  actor: AtemschutzActor,
): Promise<void> {
  await updateDoc(doc(fuellungCollection(firecallId), fuellungId), {
    ...patch,
    ...touched(actor),
  });
}

export async function deleteFuellung(
  firecallId: string,
  fuellungId: string,
): Promise<void> {
  await deleteDoc(doc(fuellungCollection(firecallId), fuellungId));
}

export type NeuerTrupp = Omit<
  AtemschutzTrupp,
  'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'
>;

export async function addTrupp(
  firecallId: string,
  data: NeuerTrupp,
  actor: AtemschutzActor,
): Promise<string> {
  const ref = await addDoc(truppCollection(firecallId), {
    ...data,
    ...created(actor),
  });
  return ref.id;
}

export async function updateTrupp(
  firecallId: string,
  truppId: string,
  patch: Partial<AtemschutzTrupp>,
  actor: AtemschutzActor,
): Promise<void> {
  await updateDoc(doc(truppCollection(firecallId), truppId), {
    ...patch,
    ...touched(actor),
  });
}

export async function deleteTrupp(
  firecallId: string,
  truppId: string,
): Promise<void> {
  await deleteDoc(doc(truppCollection(firecallId), truppId));
}

export type NeueAusgabe = Omit<
  AtemschutzAusgabe,
  'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'
>;

export async function addAusgabe(
  firecallId: string,
  data: NeueAusgabe,
  actor: AtemschutzActor,
): Promise<string> {
  const ref = await addDoc(ausgabeCollection(firecallId), {
    ...data,
    ...created(actor),
  });
  return ref.id;
}

export async function updateAusgabe(
  firecallId: string,
  ausgabeId: string,
  patch: Partial<NeueAusgabe>,
  actor: AtemschutzActor,
): Promise<void> {
  await updateDoc(doc(ausgabeCollection(firecallId), ausgabeId), {
    ...patch,
    ...touched(actor),
  });
}
