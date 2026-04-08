import { isInternalEmail } from '../../common/internalDomains';
import { auth } from '../../components/firebase/firebase';
import { loginTimer } from '../../common/loginTiming';

export { isInternalEmail };

/**
 * Retry token refresh until claims match expected values or max retries reached.
 * Firebase custom claims can take a moment to propagate after being set.
 */
export async function refreshTokenUntilClaimsMatch(
  expectedAuthorized: boolean,
  expectedGroups: string[],
  maxRetries = 5,
  retryDelayMs = 1000
): Promise<boolean> {
  const timer = loginTimer('refreshTokenUntilClaimsMatch');
  const sortedExpectedGroups = [...expectedGroups].sort().join(',');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      timer.step(`delay before attempt ${attempt + 1}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    timer.step(`getIdToken (attempt ${attempt + 1}/${maxRetries})`);
    await auth.currentUser?.getIdToken(true);

    const tokenResult = await auth.currentUser?.getIdTokenResult();
    if (!tokenResult) {
      timer.done();
      return false;
    }

    const tokenAuthorized = !!tokenResult.claims.authorized;
    const tokenGroups = [...((tokenResult.claims.groups as string[]) || [])]
      .sort()
      .join(',');

    if (
      tokenAuthorized === expectedAuthorized &&
      tokenGroups === sortedExpectedGroups
    ) {
      timer.done();
      return true;
    }

    console.info(
      `token refresh attempt ${attempt + 1}/${maxRetries}: claims not yet updated`
    );
  }

  timer.done();
  return false;
}

/**
 * Refresh token and verify claims match expected values.
 * Used when admin updates user authorization.
 */
export async function refreshTokenWithRetry(
  expectedAuthorized: boolean,
  expectedGroups: string[],
  maxRetries = 5,
  retryDelayMs = 1000
): Promise<boolean> {
  const timer = loginTimer('refreshTokenWithRetry');
  let claimsMatch = false;

  for (let attempt = 0; attempt < maxRetries && !claimsMatch; attempt++) {
    if (attempt > 0) {
      timer.step(`delay before attempt ${attempt + 1}`);
      console.info(`retrying token refresh (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    timer.step(`getIdToken (attempt ${attempt + 1}/${maxRetries})`);
    await auth.currentUser!.getIdToken(true);

    const tokenResult = await auth.currentUser!.getIdTokenResult();
    const tokenAuthorized = !!tokenResult.claims.authorized;
    const tokenGroups = [...((tokenResult.claims.groups as string[]) || [])].sort();

    claimsMatch =
      tokenAuthorized === expectedAuthorized &&
      JSON.stringify(tokenGroups) === JSON.stringify(expectedGroups);

    if (claimsMatch) {
      console.info(`token claims now match Firestore data`);
    }
  }

  if (!claimsMatch) {
    console.warn(`token claims still differ after ${maxRetries} retries, may need manual re-login`);
  }

  timer.done();
  return claimsMatch;
}
