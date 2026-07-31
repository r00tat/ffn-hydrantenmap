import { NextRequest, NextResponse } from 'next/server';
import userRequired from '../../../server/auth/userRequired';
import { createAppCheckToken } from '../../../server/firebase/appCheck';

/**
 * Mint an App Check token for clients that cannot attest themselves.
 *
 * Used by the Chrome extension, which has no App Check provider of its own
 * (see `src/server/firebase/appCheck.ts`). A verified Firebase ID token of an
 * authorized user is the entry ticket, so this endpoint grants nothing that the
 * caller could not already do directly against Firestore.
 *
 * This is an API route rather than a server action on purpose: the caller is an
 * external HTTP client on a `chrome-extension://` origin, which needs plain
 * CORS (see `src/proxy.ts`) instead of the server-action protocol.
 */
export async function POST(req: NextRequest) {
  try {
    await userRequired(req);

    return NextResponse.json(await createAppCheckToken());
  } catch (err: any) {
    console.warn(`failed to mint app check token: ${err}`);
    return NextResponse.json(
      { error: err.message },
      { status: err.status || 500 }
    );
  }
}
