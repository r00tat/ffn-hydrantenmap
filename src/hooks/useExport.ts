import {
  collection,
  doc,
  query,
  getDocs,
  getDoc,
  addDoc,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from '../components/firebase/firebase';
import { Firecall, FirecallItem } from '../components/firebase/firestore';
import { v4 as uuid } from 'uuid';

export interface FirecallExport extends Firecall {
  items: FirecallItem[];
}

export async function exportFirecall(
  firecallId: string
): Promise<FirecallExport> {
  const firecallDoc = doc(firestore, 'call', firecallId);
  const firecall = (await getDoc(firecallDoc)).data() as Firecall;

  const items = (await getDocs(query(collection(firecallDoc, 'item')))).docs;

  return {
    ...firecall,
    items: items.map((i) => i.data() as FirecallItem),
  };
}

export async function importFirecall(firecall: FirecallExport) {
  const { items, ...firecallData } = firecall;
  const firecallDoc = await addDoc(collection(firestore, 'call'), firecallData);
  const itemCol = collection(firecallDoc, 'items');

  const batch = writeBatch(firestore);
  items.forEach((item) => {
    batch.set(doc(itemCol, uuid()), item);
  });

  batch.commit();
  return firecallDoc;
}
