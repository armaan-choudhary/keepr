import { ILocalStorageEngine } from './storageEngine';

const PROTECTION_KEY_PREFIX = 'protection:item:';
const ALL_PROTECTED_SET_KEY = 'protection:all_ids';

export class ProtectionRegistry {
  private readonly storage: ILocalStorageEngine;
  private memoryCache: Set<string> | null = null;

  constructor(storage: ILocalStorageEngine) {
    this.storage = storage;
  }

  private async loadCache(): Promise<Set<string>> {
    if (this.memoryCache !== null) {
      return this.memoryCache;
    }

    const saved = await this.storage.get<string[]>(ALL_PROTECTED_SET_KEY);
    this.memoryCache = new Set(saved ?? []);
    return this.memoryCache;
  }

  private async persistCache(): Promise<void> {
    if (this.memoryCache !== null) {
      await this.storage.set(ALL_PROTECTED_SET_KEY, Array.from(this.memoryCache));
    }
  }

  async isProtected(mediaId: string): Promise<boolean> {
    const cache = await this.loadCache();
    return cache.has(mediaId);
  }

  async protect(mediaId: string): Promise<void> {
    const cache = await this.loadCache();
    if (!cache.has(mediaId)) {
      cache.add(mediaId);
      await this.persistCache();
      await this.storage.set(`${PROTECTION_KEY_PREFIX}${mediaId}`, {
        mediaId,
        protectedAt: Date.now(),
      });
    }
  }

  async unprotect(mediaId: string): Promise<void> {
    const cache = await this.loadCache();
    if (cache.has(mediaId)) {
      cache.delete(mediaId);
      await this.persistCache();
      await this.storage.remove(`${PROTECTION_KEY_PREFIX}${mediaId}`);
    }
  }

  async getProtectedIds(): Promise<Set<string>> {
    const cache = await this.loadCache();
    return new Set(cache);
  }

  async batchSetProtection(
    entries: Array<{ mediaId: string; isProtected: boolean }>
  ): Promise<void> {
    const cache = await this.loadCache();
    const now = Date.now();

    for (const { mediaId, isProtected } of entries) {
      if (isProtected) {
        cache.add(mediaId);
        await this.storage.set(`${PROTECTION_KEY_PREFIX}${mediaId}`, {
          mediaId,
          protectedAt: now,
        });
      } else {
        cache.delete(mediaId);
        await this.storage.remove(`${PROTECTION_KEY_PREFIX}${mediaId}`);
      }
    }

    await this.persistCache();
  }

  async clear(): Promise<void> {
    const cache = await this.loadCache();
    for (const mediaId of cache) {
      await this.storage.remove(`${PROTECTION_KEY_PREFIX}${mediaId}`);
    }
    cache.clear();
    await this.storage.remove(ALL_PROTECTED_SET_KEY);
  }
}
