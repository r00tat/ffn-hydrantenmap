'use server';
import 'server-only';

import { actionUserRequired } from '../auth';
import { loadOebfvToken } from './tokenStore';
import { parseFx, parseVehicleResult, Vehicle } from './parseVehicleData';
import { writeKennzeichenLog } from './queryLog';
import { KennzeichenSystem } from './logEntry';

const BASE_URL = 'https://www.feuerwehrapp.at/int';

const SYSTEM_PATH: Record<KennzeichenSystem, string> = {
  einsatz: 'kennzeichen',
  uebung: 'kennzeichenuebung',
};

export interface KennzeichenQueryInput {
  groupId: string;
  platePrefix: string;
  plateNumber: string;
  system: KennzeichenSystem;
}

export interface KennzeichenQueryResult {
  vehicles: Vehicle[];
  noResult: boolean;
  system: KennzeichenSystem;
  error?: 'no-token' | 'not-authorized' | 'upstream';
}

/** Extract the PHPSESSID cookie value from a fetch Response. */
function extractSessionCookie(res: Response): string | null {
  const getSetCookie = (res.headers as unknown as {
    getSetCookie?: () => string[];
  }).getSetCookie;
  const cookies = getSetCookie
    ? getSetCookie.call(res.headers)
    : [res.headers.get('set-cookie') ?? ''];
  for (const c of cookies) {
    const match = /PHPSESSID=([^;]+)/.exec(c ?? '');
    if (match) return match[1];
  }
  return null;
}

/** Runs the full session -> fx -> post flow against feuerwehrapp.at. */
async function runQuery(
  token: string,
  system: KennzeichenSystem,
  platePrefix: string,
  plateNumber: string
): Promise<string> {
  const path = SYSTEM_PATH[system];

  // 1. Establish a token-bound session, capture PHPSESSID.
  const sessionRes = await fetch(
    `${BASE_URL}/index.php?token=${encodeURIComponent(token)}`,
    { redirect: 'manual' }
  );
  const sessionId = extractSessionCookie(sessionRes);
  if (!sessionId) {
    throw new Error('Could not establish feuerwehrapp.at session (no PHPSESSID).');
  }
  const cookie = `PHPSESSID=${sessionId}`;

  // 2. Load the form to obtain the fx CSRF token (present for Einsatz, absent for Übung).
  const formRes = await fetch(`${BASE_URL}/${path}/index.php`, {
    headers: { Cookie: cookie },
  });
  const fx = parseFx(await formRes.text());

  // 3. Post the query.
  const body = new URLSearchParams({
    plate_pref: platePrefix.trim().toUpperCase(),
    plate_number: plateNumber.trim().toUpperCase(),
  });
  if (fx) body.set('fx', fx);

  const queryRes = await fetch(`${BASE_URL}/${path}/index.php`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!queryRes.ok) {
    throw new Error(`feuerwehrapp.at query failed: HTTP ${queryRes.status}`);
  }
  return queryRes.text();
}

/**
 * Query vehicle data for a plate. Guards membership, uses the group token,
 * parses the result, and logs every query (success or failure).
 */
export async function queryKennzeichen(
  input: KennzeichenQueryInput
): Promise<KennzeichenQueryResult> {
  const session = await actionUserRequired();
  const { groupId, platePrefix, plateNumber, system } = input;

  const userGroups = session.user.groups ?? [];
  const authorized = session.user.isAdmin || userGroups.includes(groupId);

  const logBase = {
    user: session.user.email ?? 'unknown',
    groupId,
    system,
    platePrefix,
    plateNumber,
    timestamp: new Date().toISOString(),
  };

  if (!authorized) {
    await writeKennzeichenLog({ ...logBase, resultCount: 0, success: false });
    return { vehicles: [], noResult: true, system, error: 'not-authorized' };
  }

  const token = await loadOebfvToken(groupId);
  if (!token) {
    await writeKennzeichenLog({ ...logBase, resultCount: 0, success: false });
    return { vehicles: [], noResult: true, system, error: 'no-token' };
  }

  try {
    const html = await runQuery(token, system, platePrefix, plateNumber);
    const { vehicles, noResult } = parseVehicleResult(html);
    await writeKennzeichenLog({
      ...logBase,
      resultCount: vehicles.length,
      success: true,
    });
    return { vehicles, noResult, system };
  } catch (err) {
    console.error('ÖBFV Kennzeichenabfrage failed:', err);
    await writeKennzeichenLog({ ...logBase, resultCount: 0, success: false });
    return { vehicles: [], noResult: true, system, error: 'upstream' };
  }
}
