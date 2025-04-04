import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  writeBatch,
} from 'firebase/firestore';
import { getBlob, getMetadata, getStorage, ref } from 'firebase/storage';
import { v4 as uuid } from 'uuid';
import app, { firestore } from '../components/firebase/firebase';
import {
  FcAttachment,
  FcItemAttachment,
  FcMarker,
  Firecall,
  FIRECALL_COLLECTION_ID,
  FIRECALL_ITEMS_COLLECTION_ID,
  FIRECALL_LAYERS_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
} from '../components/firebase/firestore';
import { uploadFile } from '../components/inputs/FileUploader';
import { ChatMessage } from '../common/chat';
import { allSettled } from '../common/promise';

export interface FirecallExport extends Firecall {
  items: FirecallItem[];
  chat: ChatMessage[];
  layers: FirecallLayer[];
}

const storage = getStorage(app);

function removeBase64Prefix(b64String: string) {
  return b64String.substring(b64String.indexOf(',') + 1);
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === 'string'
        ? resolve(removeBase64Prefix(reader.result as string))
        : reject('wrong result');
    reader.readAsDataURL(blob);
  });
}

export async function downloadAttachmentBase64(
  srcUrl: FcItemAttachment
): Promise<FcAttachment> {
  if (srcUrl instanceof Object) {
    return srcUrl;
  }

  const src = ref(storage, srcUrl as string);
  // this allows downloading via url
  // const downloadUrl = getDownloadURL(src);

  // to be able to download directly from the bucket via the sdk
  // the cors policy needs to be set
  // https://firebase.google.com/docs/storage/web/download-files?hl=en#download_data_directly_from_the_sdk
  const blob = await getBlob(src);

  const result = await blobToBase64(blob);
  const meta = await getMetadata(src);

  return {
    name: src.name.substring(37),
    mimeType: meta.contentType,
    data: result,
  };
}

export async function exportFirecall(
  firecallId: string
): Promise<FirecallExport> {
  const firecallDoc = doc(firestore, FIRECALL_COLLECTION_ID, firecallId);
  const firecall = (await getDoc(firecallDoc)).data() as Firecall;

  const items = (
    await getDocs(query(collection(firecallDoc, FIRECALL_ITEMS_COLLECTION_ID)))
  ).docs.map((d) => ({ ...d.data(), id: d.id } as FirecallItem));
  const chat = (await getDocs(query(collection(firecallDoc, 'chat')))).docs.map(
    (d) => ({ ...d.data(), id: d.id } as ChatMessage)
  );
  const layers = (
    await getDocs(query(collection(firecallDoc, FIRECALL_LAYERS_COLLECTION_ID)))
  ).docs.map((d) => ({ ...d.data(), id: d.id } as FirecallLayer));

  const exportItems = await Promise.all(
    items
      // .filter((i) => i.type === 'marker')
      // .map((item) => item as FcMarker)
      .map(async (item) => {
        if (item.type === 'marker') {
          // item.attachments =
          const m = item as FcMarker;
          if (m.attachments) {
            m.attachments = await allSettled<FcAttachment>(
              m.attachments?.map(downloadAttachmentBase64)
            );
          }

          return m;
        }

        return item;
      })
  );

  return {
    ...firecall,
    items: exportItems,
    chat: chat,
    layers: layers,
  };
}

export const blobFromBase64String = (
  base64String: string,
  mimeType?: string
) => {
  const byteArray = Uint8Array.from(
    atob(base64String)
      .split('')
      .map((char) => char.charCodeAt(0))
  );
  return new Blob([byteArray], { type: mimeType });
};

export async function importFirecall(firecall: FirecallExport) {
  const { items, chat, layers, id, ...firecallData } = firecall;
  const firecallDoc = await addDoc(
    collection(firestore, FIRECALL_COLLECTION_ID),
    firecallData
  );
  const itemCol = collection(firecallDoc, FIRECALL_ITEMS_COLLECTION_ID);
  const chatCol = collection(firecallDoc, 'chat');
  const layerCol = collection(firecallDoc, FIRECALL_LAYERS_COLLECTION_ID);

  // upload files for items

  const importItems = await allSettled(
    items.map(async (i) => {
      if (i.type === 'marker') {
        const m = i as FcMarker;

        if (m.attachments) {
          m.attachments = await allSettled(
            m.attachments.map(async (m) => {
              if (typeof m === 'string') {
                return m;
              }
              const a = m as FcAttachment;
              const blob = blobFromBase64String(a.data, a.mimeType);
              const uploadRef = await uploadFile(firecallDoc.id, a.name, blob, {
                contentType: a.mimeType,
              });
              return uploadRef.toString();
            })
          );
        }
      }
      return i;
    })
  );
  const batch = writeBatch(firestore);
  importItems.forEach((item) => {
    batch.set(doc(itemCol, item.id || uuid()), item);
  });

  await batch.commit();

  const chatBatch = writeBatch(firestore);
  chat.forEach((c) => {
    chatBatch.set(doc(chatCol, c.id || uuid()), c);
  });
  await chatBatch.commit();

  const layerBatch = writeBatch(firestore);
  layers.forEach((l) => {
    // keep the layer id, as this is referenced
    layerBatch.set(doc(layerCol, l.id || uuid()), l);
  });
  await layerBatch.commit();
  return firecallDoc;
}
