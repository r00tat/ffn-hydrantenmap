import 'server-only';

import { getDefaultStorageBucket } from '../firebase/storageBucket';
import { ocrStoragePdf } from './ocrDokument';
import { indexPdfOnServer } from './pdfjsNode';
import type { ReindexDeps } from './reindexRunner';

/** @param ocrKey Ablage der Vision-Ausgabe, je Dokument eindeutig. */
export function reindexDeps(ocrKey: string): ReindexDeps {
  return {
    async readFile(storagePath) {
      const bucket = await getDefaultStorageBucket();
      const [buf] = await bucket.file(storagePath).download();
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },
    index: indexPdfOnServer,
    ocr: (storagePath, pageCount) => ocrStoragePdf(storagePath, ocrKey, pageCount),
  };
}
