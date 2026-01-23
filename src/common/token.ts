/**
 * Authorization token for the API (GeoJson)
 */
export interface Token {
    id?: string;
    description: string;
    owner: string;
    /** Optional expiration date as ISO string */
    expiresAt?: string;
}