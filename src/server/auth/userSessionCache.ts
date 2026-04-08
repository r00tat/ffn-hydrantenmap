export interface CacheableUserData {
  isAuthorized: boolean;
  isAdmin: boolean;
  groups: string[];
  firecall?: string;
}

export class UserSessionCache {
  private cache = new Map<string, { data: CacheableUserData; expires: number }>();
  private knownUsers = new Set<string>();

  constructor(private ttlMs: number = 60_000) {}

  get(uid: string): CacheableUserData | undefined {
    const entry = this.cache.get(uid);
    if (entry && entry.expires > Date.now()) {
      return entry.data;
    }
    if (entry) {
      this.cache.delete(uid);
    }
    return undefined;
  }

  set(uid: string, data: CacheableUserData): void {
    this.cache.set(uid, { data, expires: Date.now() + this.ttlMs });
    this.knownUsers.add(uid);
  }

  invalidate(uid: string): void {
    this.cache.delete(uid);
  }

  isKnownUser(uid: string): boolean {
    return this.knownUsers.has(uid);
  }

  markKnownUser(uid: string): void {
    this.knownUsers.add(uid);
  }
}

/** Singleton instance for server-side caching */
export const userSessionCache = new UserSessionCache();
