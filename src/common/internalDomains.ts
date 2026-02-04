/**
 * Email domains that are considered internal (auto-authorized)
 */
export const INTERNAL_EMAIL_DOMAINS = ['@ff-neusiedlamsee.at', '@ffnd.at'];

/**
 * Check if an email belongs to an internal user
 */
export function isInternalEmail(email: string | null | undefined): boolean {
  return !!email && INTERNAL_EMAIL_DOMAINS.some((domain) => email.endsWith(domain));
}
