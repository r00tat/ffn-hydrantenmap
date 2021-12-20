// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';

export interface Hydrant {
  name: string;
  dimension: string;
  dynamsicher_druck?: number; // there's a typo in the API "Dynamsicher Druck"
  statischer_druck?: number;
  leistung?: number;
  lat: number;
  lng: number;
  ortschaft: string;
}

export interface HydrantenResponse {
  hydranten: Hydrant[];
}

let records: Hydrant[];

const getRecords = () => {
  if (!records) {
    const data = readFileSync(`${process.cwd()}/public/hydranten.csv`);
    records = parse(data, {
      columns: true,
      skip_empty_lines: true,
    });
  }
  return records;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<HydrantenResponse>
) {
  const records = getRecords();
  res.status(200).json({ hydranten: records });
}
