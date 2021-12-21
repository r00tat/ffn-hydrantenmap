// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import firebaseAdmin from '../../server/firebase/admin';
import { GisWgsObject } from '../../server/gis-objects';

export interface Hydrant extends GisWgsObject {
  dimension: string;
  dynamsicher_druck?: number; // there's a typo in the API "Dynamsicher Druck"
  statischer_druck?: number;
  leistung?: number;
  ortschaft: string;
}

export interface HydrantenResponse {
  hydranten: Hydrant[];
}

let records: Hydrant[];

const getRecords = async () => {
  if (!records) {
    const firestore = firebaseAdmin.firestore();

    records =
      (
        await firestore
          .collection('hydrant')
          // filter only for one field
          // .where('leistung', '>=', 1000)
          // .where('leistung', '<=', 1200)
          .get()
      )?.docs?.map((doc) => doc.data() as Hydrant) || [];
  }
  return records;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HydrantenResponse>
) {
  const records = await getRecords();
  res.status(200).json({ hydranten: records });
}
