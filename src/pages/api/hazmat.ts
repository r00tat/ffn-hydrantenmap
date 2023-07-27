import type { NextApiRequest, NextApiResponse } from 'next';
import { HazmatMaterial } from '../../common/hazmat';
import userRequired from '../../server/auth/userRequired';
import { queryHazmatDb } from '../../server/hazmat-db';

export interface ErrorMessage {
  error: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HazmatMaterial[] | ErrorMessage>
) {
  if (!(await userRequired(req, res))) {
    return;
  }

  if (!req.query.unnumber && !req.query.name) {
    res.status(400).json({
      error: 'unnumber or name are required',
    });
    return;
  }

  try {
    console.info(
      `searching for ${req.query.unnumber?.toString()} ${req.query.name?.toString()}`
    );
    const records = await queryHazmatDb(
      req.query.unnumber?.toString(),
      req.query.name?.toString()
    );
    res.status(200).json(records);
  } catch (err) {
    console.error(`failed to query hazmat db`, err);
    res.status(500).json({ error: (err as ErrorMessage).error });
    return;
  }
}
