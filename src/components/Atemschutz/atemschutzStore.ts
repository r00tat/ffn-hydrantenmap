'use client';

import {
  arrayUnion,
  collection,
  doc,
  type CollectionReference,
} from 'firebase/firestore';
import {
  ATEMSCHUTZ_AUSGABE_COLLECTION_ID,
  ATEMSCHUTZ_FUELLUNG_COLLECTION_ID,
  ATEMSCHUTZ_TRUPP_COLLECTION_ID,
  mitUeberwachungsUid,
  type AtemschutzAusgabe,
  type AtemschutzFuellung,
  type AtemschutzTrupp,
  type Druckabfrage,
  type UeberwachungPatch,
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

/**
 * Hängt eine Druckabfrage an — mit `arrayUnion` und nicht mit einem
 * überschriebenen Array.
 *
 * Am Sammelplatz und beim Gruppenkommandanten schaut mehr als ein Gerät auf
 * denselben Trupp. Wer das Array aus seinem geladenen Zustand neu schreibt,
 * löscht damit die Abfrage, die eine Sekunde vorher von einem anderen Gerät
 * kam — genau den Wert, auf den es ankommt. `arrayUnion` hängt serverseitig an.
 *
 * `ueberwachungUids` wird dabei mitgeführt: Wer eine Abfrage erfasst, arbeitet
 * an der Überwachung und soll die Warnungen bekommen. Das ist bewusst *kein*
 * `arrayUnion` — es wäre eines, aber die Liste ist kurz, und `mitUeberwachungsUid`
 * hält die Reihenfolge stabil, an der man sieht, wer zuerst übernommen hat.
 */
export async function addDruckabfrage(
  firecallId: string,
  trupp: AtemschutzTrupp,
  abfrage: Druckabfrage,
  actor: AtemschutzActor,
): Promise<void> {
  await updateDoc(doc(truppCollection(firecallId), trupp.id as string), {
    abfragen: arrayUnion(abfrage),
    ueberwachungUids: mitUeberwachungsUid(
      trupp.ueberwachungUids,
      actor.userId,
    ),
    ...touched(actor),
  });
}

/**
 * Übernahme der Zeitkontrolle und Änderungen an ihren Feldern.
 *
 * Eigene Funktion statt `updateTrupp`, damit der Aufrufer nicht versehentlich
 * `status` mitschickt: Der Zustandswechsel eines Trupps läuft über
 * `canTransition`, die Überwachung fasst ihn nicht an.
 */
export async function updateUeberwachung(
  firecallId: string,
  truppId: string,
  patch: UeberwachungPatch,
  actor: AtemschutzActor,
): Promise<void> {
  await updateDoc(doc(truppCollection(firecallId), truppId), {
    ...patch,
    ...touched(actor),
  });
}
