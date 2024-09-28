import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { v4 as uuid } from 'uuid';
import { allSettled } from '../common/promise';
import { firestore } from '../components/firebase/firebase';
import {
  FcMarker,
  FIRECALL_COLLECTION_ID,
  FirecallItem,
  FirecallLayer,
} from '../components/firebase/firestore';
import { uploadFile } from '../components/inputs/FileUploader';
import { blobFromBase64String, downloadAttachmentBase64 } from './useExport';

export async function copyItem(
  firecallId: string,
  item: FirecallItem
): Promise<FirecallItem[]> {
  const newId = uuid();

  const newItem: FirecallItem = {
    ...item,
    id: newId,
  };

  if (item.type === 'marker') {
    // we have got attachments
    (newItem as FcMarker).attachments = await copyAttachments(
      firecallId,
      item as FcMarker
    );
  }

  if (item.type === 'layer') {
    const layerItems = await copyLayer(
      firecallId,
      item as FirecallLayer,
      newId
    );
    return [newItem, ...layerItems];
  }

  return [newItem];
}

export async function copyAttachments(firecallId: string, m: FcMarker) {
  if (m.attachments) {
    const attachments = await allSettled<string>(
      m.attachments?.map(async (attachment) => {
        const a = await downloadAttachmentBase64(attachment);
        const blob = blobFromBase64String(a.data, a.mimeType);
        const uploadRef = await uploadFile(firecallId, a.name, blob, {
          contentType: a.mimeType,
        });
        return uploadRef.toString();
      })
    );

    return attachments;
  }
  return undefined;
}

export async function copyLayer(
  firecallId: string,
  layer: FirecallLayer,
  newLayerId: string
) {
  const markers = (
    await getDocs(
      query(
        collection(firestore, FIRECALL_COLLECTION_ID, firecallId, 'item'),
        where('layer', '==', layer.id)
      )
    )
  ).docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirecallItem));

  const newMarkers = (
    await allSettled(
      markers.map((m) => copyItem(firecallId, { ...m, layer: newLayerId }))
    )
  ).flat();

  return newMarkers;
}

export default async function copyAndSaveFirecallItems(
  firecallId: string,
  item: FirecallItem
) {
  const newItems = await copyItem(firecallId, {
    ...item,
    name: `${item.name} Kopie`,
  });
  const firecallDoc = doc(
    collection(firestore, FIRECALL_COLLECTION_ID),
    firecallId
  );

  const itemCol = collection(firecallDoc, 'item');
  const layerCol = collection(firecallDoc, 'layer');

  const batch = writeBatch(firestore);

  newItems.forEach((item) => {
    batch.set(
      doc(item.type === 'layer' ? layerCol : itemCol, item.id),
      Object.fromEntries(Object.entries(item).filter(([key, value]) => value))
    );
  });

  await batch.commit();
}
