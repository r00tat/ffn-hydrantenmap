import { isInternalEmail } from '../../common/internalDomains';
import { auth } from '../../components/firebase/firebase';

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
  const sortedExpectedGroups = [...expectedGroups].sort().join(',');

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    // Force Firebase to get fresh ID token with new custom claims
    await auth.currentUser?.getIdToken(true);

    // Verify the new token has the expected claims
    const tokenResult = await auth.currentUser?.getIdTokenResult();
    if (!tokenResult) return false;

    const tokenAuthorized = !!tokenResult.claims.authorized;
    const tokenGroups = [...((tokenResult.claims.groups as string[]) || [])]
      .sort()
      .join(',');

    if (
      tokenAuthorized === expectedAuthorized &&
      tokenGroups === sortedExpectedGroups
    ) {
      return true;
    }

    console.info(
      `token refresh attempt ${attempt + 1}/${maxRetries}: claims not yet updated`
    );
  }

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
  let claimsMatch = false;

  for (let attempt = 0; attempt < maxRetries && !claimsMatch; attempt++) {
    if (attempt > 0) {
      console.info(`retrying token refresh (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    // Force Firebase to get fresh ID token with new custom claims
    await auth.currentUser!.getIdToken(true);

    // Verify the new token has the expected claims
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

  return claimsMatch;
}
