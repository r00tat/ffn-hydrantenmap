import 'server-only';

import { GoogleAuth } from 'google-auth-library';
import { ocrIndexFromResponses } from '../../common/objektplan/ocrIndex';
import type { PdfPlanIndex } from '../../common/objektplan/pdfIndex';
import { getDefaultStorageBucket } from '../firebase/storageBucket';
import { OCR_OUTPUT_PREFIX, ocrPdf, type VisionOcrDeps } from './visionOcr';

/**
 * Texterkennung eines PDFs im Standard-Bucket über Cloud Vision. Der Dienst
 * meldet sich mit seinem Service Account an (ADC); Vision liest und schreibt
 * den Bucket mit denselben Rechten. Hintergrund: docs/objektplaene.md,
 * „Texterkennung (OCR)".
 */

let auth: GoogleAuth | undefined;

async function visionDeps(): Promise<VisionOcrDeps> {
  auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const bucket = await getDefaultStorageBucket();
  return {
    async request<T>(options: { url: string; method: 'GET' | 'POST'; data?: unknown }) {
      const res = await client.request<T>(options);
      return res.data;
    },
    async readOutput(prefix) {
      const [files] = await bucket.getFiles({ prefix });
      const result: string[] = [];
      for (const file of files.filter((f) => f.name.endsWith('.json'))) {
        const [content] = await file.download();
        result.push(content.toString('utf8'));
      }
      return result;
    },
    async deleteOutput(prefix) {
      await bucket.deleteFiles({ prefix });
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/**
 * Erkennt den Text des PDFs unter `storagePath`; `key` trennt parallele Läufe.
 * Mit `pageCount` bis fünf geht der Plan direkt an Vision statt über den Bucket.
 */
export async function ocrStoragePdf(
  storagePath: string,
  key: string,
  pageCount?: number,
): Promise<PdfPlanIndex> {
  const bucket = await getDefaultStorageBucket();
  const pages = await ocrPdf(
    bucket.name,
    storagePath,
    `${OCR_OUTPUT_PREFIX}/${key}/${Date.now()}`,
    await visionDeps(),
    { pageCount },
  );
  return ocrIndexFromResponses(pages);
}
