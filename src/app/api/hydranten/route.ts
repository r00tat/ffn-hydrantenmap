import type { NextApiRequest, NextApiResponse } from 'next';
import { GisWgsObject } from '../../../common/gis-objects';
import userRequired from '../../../server/auth/userRequired';
import { firestore } from '../../../server/firebase/admin';
import { NextRequest, NextResponse } from 'next/server';

export interface Hydrant extends GisWgsObject {
  dimension: string;
  dynamischer_druck?: number; // there's a typo in the API "Dynamsicher Druck"
  statischer_druck?: number;
  leistung?: number;
  ortschaft: string;
  leitungsart?: string;
}

export interface HydrantenResponse {
  hydranten: Hydrant[];
}

let records: Hydrant[];

const getRecords = async () => {
  if (!records) {
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

export async function POST(req: NextRequest) {
  try {
    await userRequired(req);
    const records = await getRecords();
    return NextResponse.json({ hydranten: records });
  } catch (err: any) {
    console.error(`failed get hydranten`, err);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
