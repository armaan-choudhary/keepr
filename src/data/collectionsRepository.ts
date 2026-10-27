import { ILocalStorageEngine } from './storageEngine';
import { KeeprCollection, CollectionMember } from '../domain/models';
import { MediaAvailability } from '../platform/contracts';

const COLLECTION_KEY_PREFIX = 'collections:';
const COLLECTION_INDEX_KEY = 'collections:_index';

export class CollectionsRepository {
  private readonly storage: ILocalStorageEngine;

  constructor(storage: ILocalStorageEngine) {
    this.storage = storage;
  }

  private async getIndex(): Promise<string[]> {
    const index = await this.storage.get<string[]>(COLLECTION_INDEX_KEY);
    return index ?? [];
  }

  private async saveIndex(index: string[]): Promise<void> {
    await this.storage.set(COLLECTION_INDEX_KEY, index);
  }

  async createCollection(name: string, description?: string): Promise<KeeprCollection> {
    const id = `coll_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const collection: KeeprCollection = {
      id,
      name,
      description,
      createdAt: now,
      updatedAt: now,
      members: [],
      isKeeprManaged: true,
    };

    await this.storage.set(`${COLLECTION_KEY_PREFIX}${id}`, collection);

    const index = await this.getIndex();
    if (!index.includes(id)) {
      index.push(id);
      await this.saveIndex(index);
    }

    return collection;
  }

  async getCollection(id: string): Promise<KeeprCollection | null> {
    return this.storage.get<KeeprCollection>(`${COLLECTION_KEY_PREFIX}${id}`);
  }

  async listCollections(): Promise<KeeprCollection[]> {
    const index = await this.getIndex();
    const collections: KeeprCollection[] = [];

    for (const id of index) {
      const item = await this.getCollection(id);
      if (item) {
        collections.push(item);
      }
    }

    return collections;
  }

  async updateCollection(
    id: string,
    updates: Partial<Pick<KeeprCollection, 'name' | 'description' | 'coverAssetRef'>>
  ): Promise<KeeprCollection> {
    const collection = await this.getCollection(id);
    if (!collection) {
      throw new Error(`Collection not found: ${id}`);
    }

    const updated: KeeprCollection = {
      ...collection,
      ...updates,
      updatedAt: Date.now(),
    };

    await this.storage.set(`${COLLECTION_KEY_PREFIX}${id}`, updated);
    return updated;
  }

  async deleteCollection(id: string): Promise<boolean> {
    const existing = await this.getCollection(id);
    if (!existing) {
      return false;
    }

    await this.storage.remove(`${COLLECTION_KEY_PREFIX}${id}`);
    const index = await this.getIndex();
    const filtered = index.filter((item) => item !== id);
    await this.saveIndex(filtered);
    return true;
  }

  async addItems(
    id: string,
    items: Array<{
      mediaId: string;
      assetRef: string;
      isAvailable?: boolean;
      availability?: MediaAvailability;
    }>
  ): Promise<KeeprCollection> {
    const collection = await this.getCollection(id);
    if (!collection) {
      throw new Error(`Collection not found: ${id}`);
    }

    const now = Date.now();
    const existingMap = new Map(collection.members.map((m) => [m.mediaId, m]));

    for (const item of items) {
      if (!existingMap.has(item.mediaId)) {
        existingMap.set(item.mediaId, {
          mediaId: item.mediaId,
          assetRef: item.assetRef,
          addedAt: now,
          isAvailable: item.isAvailable ?? true,
          availability: item.availability ?? 'availableOffline',
        });
      }
    }

    const updated: KeeprCollection = {
      ...collection,
      members: Array.from(existingMap.values()),
      updatedAt: now,
    };

    await this.storage.set(`${COLLECTION_KEY_PREFIX}${id}`, updated);
    return updated;
  }

  async removeItems(id: string, mediaIds: string[]): Promise<KeeprCollection> {
    const collection = await this.getCollection(id);
    if (!collection) {
      throw new Error(`Collection not found: ${id}`);
    }

    const removeSet = new Set(mediaIds);
    const updatedMembers = collection.members.filter((m) => !removeSet.has(m.mediaId));

    const updated: KeeprCollection = {
      ...collection,
      members: updatedMembers,
      updatedAt: Date.now(),
    };

    await this.storage.set(`${COLLECTION_KEY_PREFIX}${id}`, updated);
    return updated;
  }

  async updateItemAvailability(
    collectionId: string,
    mediaId: string,
    isAvailable: boolean,
    availability?: MediaAvailability
  ): Promise<KeeprCollection> {
    const collection = await this.getCollection(collectionId);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    const updatedMembers = collection.members.map((member) => {
      if (member.mediaId === mediaId) {
        return {
          ...member,
          isAvailable,
          availability: availability ?? (isAvailable ? 'availableOffline' : 'assetMissing'),
        };
      }
      return member;
    });

    const updated: KeeprCollection = {
      ...collection,
      members: updatedMembers,
      updatedAt: Date.now(),
    };

    await this.storage.set(`${COLLECTION_KEY_PREFIX}${collectionId}`, updated);
    return updated;
  }

  /**
   * Preserves unavailable items across all collections without deleting them.
   * As specified in Section 2: "If an asset becomes unavailable, preserve
   * the collection entry and mark it unavailable; do not silently remove it."
   */
  async preserveUnavailableItem(
    mediaId: string,
    availability: MediaAvailability = 'assetMissing'
  ): Promise<void> {
    const collections = await this.listCollections();

    for (const coll of collections) {
      const hasItem = coll.members.some((m) => m.mediaId === mediaId);
      if (hasItem) {
        await this.updateItemAvailability(coll.id, mediaId, false, availability);
      }
    }
  }
}
