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
import {
  FIRECALL_COLLECTION_ID,
  GROUP_COLLECTION_ID,
} from '../firebase/firestore';

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

/**
 * Das Füllprotokoll liegt unter der **Gruppe**, nicht unter dem Einsatz:
 * Gefüllt wird überwiegend im Feuerwehrhaus, und der Nachweis ist einer über
 * die Flasche, nicht über den Einsatz. Der Einsatzbezug steht als Feld
 * `firecallId` am Dokument.
 */
export function fuellungCollection(groupId: string): CollectionReference {
  return collection(
    firestore,
    GROUP_COLLECTION_ID,
    groupId,
    ATEMSCHUTZ_FUELLUNG_COLLECTION_ID,
  );
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
  groupId: string,
  data: NeueFuellung,
  actor: AtemschutzActor,
): Promise<string> {
  const ref = await addDoc(fuellungCollection(groupId), {
    ...data,
    ...created(actor),
  });
  return ref.id;
}

export async function updateFuellung(
  groupId: string,
  fuellungId: string,
  patch: Partial<NeueFuellung>,
  actor: AtemschutzActor,
): Promise<void> {
  await updateDoc(doc(fuellungCollection(groupId), fuellungId), {
    ...patch,
    ...touched(actor),
  });
}

export async function deleteFuellung(
  groupId: string,
  fuellungId: string,
): Promise<void> {
  await deleteDoc(doc(fuellungCollection(groupId), fuellungId));
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
