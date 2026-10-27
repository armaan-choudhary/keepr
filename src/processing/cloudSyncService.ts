import { ILocalStorageEngine } from '../data/storageEngine';
import { TriageSession } from '../domain/models';

const CLOUD_SYNC_CONFIG_KEY = 'cloud_sync:_config';
const PENDING_SYNC_METADATA_KEY = 'cloud_sync:_pending_queue';

export interface CloudSyncConfig {
  enabled: boolean;
  provider?: 'GOOGLE_DRIVE' | 'ICLOUD_DRIVE' | 'CUSTOM';
  syncMediaFiles: boolean; // MUST be false by default!
  lastSyncTimestamp?: number;
  accountEmail?: string;
}

export type CloudSyncResult =
  | { success: true; syncedAt: number; itemsSynced: number }
  | { success: false; reason: 'DISABLED' | 'OFFLINE' | 'AUTH_ERROR' | 'NETWORK_ERROR'; error?: string };

export class CloudSyncService {
  private readonly storage: ILocalStorageEngine;
  private isOnline = false;

  constructor(storage: ILocalStorageEngine) {
    this.storage = storage;
  }

  /**
   * Cloud sync is strictly disabled by default.
   */
  async getConfig(): Promise<CloudSyncConfig> {
    const config = await this.storage.get<CloudSyncConfig>(CLOUD_SYNC_CONFIG_KEY);
    if (!config) {
      return {
        enabled: false,
        syncMediaFiles: false, // strictly false by default
      };
    }
    return config;
  }

  async isEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return Boolean(config.enabled);
  }

  async enable(provider: 'GOOGLE_DRIVE' | 'ICLOUD_DRIVE' = 'GOOGLE_DRIVE', accountEmail?: string): Promise<void> {
    const existing = await this.getConfig();
    await this.storage.set<CloudSyncConfig>(CLOUD_SYNC_CONFIG_KEY, {
      ...existing,
      enabled: true,
      provider,
      accountEmail,
      // Source media files sync is NEVER silently enabled
      syncMediaFiles: false,
    });
  }

  async disable(): Promise<void> {
    const existing = await this.getConfig();
    await this.storage.set<CloudSyncConfig>(CLOUD_SYNC_CONFIG_KEY, {
      ...existing,
      enabled: false,
    });
  }

  async disconnect(): Promise<void> {
    // Clear all sync credentials and pending sync metadata
    await this.storage.remove(CLOUD_SYNC_CONFIG_KEY);
    await this.storage.remove(PENDING_SYNC_METADATA_KEY);
  }

  setOnlineStatus(online: boolean): void {
    this.isOnline = online;
  }

  /**
   * Sync session metadata (decisions, counts, timestamps) without source media.
   * Offline-safe: does not fail or throw if offline or disabled.
   */
  async syncSessionMetadata(session: TriageSession): Promise<CloudSyncResult> {
    const config = await this.getConfig();
    if (!config.enabled) {
      return { success: false, reason: 'DISABLED' };
    }

    if (!this.isOnline) {
      // Offline fallback: Queue metadata locally for future sync
      await this.queuePendingMetadata(session.id);
      return { success: false, reason: 'OFFLINE' };
    }

    // In online mode with cloud sync enabled, simulates provider metadata sync
    const now = Date.now();
    await this.storage.set<CloudSyncConfig>(CLOUD_SYNC_CONFIG_KEY, {
      ...config,
      lastSyncTimestamp: now,
    });

    return {
      success: true,
      syncedAt: now,
      itemsSynced: Object.keys(session.decisions).length,
    };
  }

  private async queuePendingMetadata(sessionId: string): Promise<void> {
    const pending = (await this.storage.get<string[]>(PENDING_SYNC_METADATA_KEY)) ?? [];
    if (!pending.includes(sessionId)) {
      pending.push(sessionId);
      await this.storage.set(PENDING_SYNC_METADATA_KEY, pending);
    }
  }

  async getPendingQueue(): Promise<string[]> {
    return (await this.storage.get<string[]>(PENDING_SYNC_METADATA_KEY)) ?? [];
  }
}
