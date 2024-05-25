import { NextRequest, NextResponse } from 'next/server';
import userRequired from '../../../server/auth/userRequired';
import { queryHazmatDb } from '../../../server/hazmat-db';
import { ApiException } from '../errors';

export interface ErrorMessage {
  error: string;
}

export async function POST(req: NextRequest) {
  try {
    await userRequired(req);

    const unNumber = req.nextUrl.searchParams.get('unnumber');
    const name = req.nextUrl.searchParams.get('name');

    if (!unNumber && !name) {
      throw new ApiException('unnumber or name are required', { status: 400 });
    }

    console.info(
      `searching for ${req.nextUrl.searchParams
        .get('unnumber')
        ?.toString()} ${name?.toString()}`
    );
    const records = await queryHazmatDb(unNumber?.toString(), name?.toString());
    return NextResponse.json(records);
  } catch (err: any) {
    console.error(`failed to query hazmat db`, err);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
