import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import {
  IMediaLibraryAdapter,
  ICompressorAdapter,
  ICommitAdapter,
  IBackgroundJobAdapter,
  LibraryAuthorizationState,
  MediaType,
  MediaQueryOptions,
  MediaPage,
  MediaAvailability,
  AlbumInfo,
  MediaItem,
  CompressionOptions,
  CompressionCandidate,
  CommitRequestItem,
  BatchCommitSummary,
  JobStatus,
} from '../contracts';

function getMediaStore() {
  const mod = NativeModules.KeeprMediaStore;
  if (!mod) {
    throw new Error('KeeprMediaStore native module is not available');
  }
  return mod;
}

function getCompressor() {
  const mod = NativeModules.KeeprCompressor;
  if (!mod) {
    throw new Error('KeeprCompressor native module is not available');
  }
  return mod;
}

function getCommit() {
  const mod = NativeModules.KeeprCommit;
  if (!mod) {
    throw new Error('KeeprCommit native module is not available');
  }
  return mod;
}

function getWorkManager() {
  const mod = NativeModules.KeeprWorkManager;
  if (!mod) {
    throw new Error('KeeprWorkManager native module is not available');
  }
  return mod;
}

export class AndroidMediaLibraryAdapter implements IMediaLibraryAdapter {
  async getAuthorizationState(): Promise<LibraryAuthorizationState> {
    return getMediaStore().getAuthorizationState();
  }

  async requestAuthorization(types: MediaType[]): Promise<LibraryAuthorizationState> {
    return getMediaStore().requestAuthorization(types);
  }

  async openSettings(): Promise<void> {
    return getMediaStore().openSettings();
  }

  async queryMedia(options?: MediaQueryOptions): Promise<MediaPage> {
    return getMediaStore().queryMedia(options || {});
  }

  async getItemAvailability(id: string): Promise<MediaAvailability> {
    return getMediaStore().getItemAvailability(id);
  }

  async listAlbums(): Promise<AlbumInfo[]> {
    return getMediaStore().listAlbums();
  }

  async presentLimitedLibraryPicker(): Promise<void> {
    return getMediaStore().presentLimitedLibraryPicker();
  }
}

export class AndroidCompressorAdapter implements ICompressorAdapter {
  private eventEmitter: NativeEventEmitter | null = null;

  private getEventEmitter(): NativeEventEmitter {
    if (!this.eventEmitter) {
      this.eventEmitter = new NativeEventEmitter(getCompressor());
    }
    return this.eventEmitter;
  }

  async compressImage(
    item: MediaItem,
    options?: CompressionOptions
  ): Promise<CompressionCandidate> {
    return getCompressor().compressImage(item, options || {});
  }

  async compressVideo(
    item: MediaItem,
    options?: CompressionOptions,
    onProgress?: (progress: number) => void
  ): Promise<CompressionCandidate> {
    let subscription: { remove: () => void } | null = null;
    if (onProgress) {
      const emitter = this.getEventEmitter();
      subscription = emitter.addListener(
        'onCompressionProgress',
        (event: any) => {
          if (event && event.candidateId === item.id) {
            onProgress(event.progress);
          }
        }
      );
    }

    try {
      return await getCompressor().compressVideo(item, options || {});
    } finally {
      subscription?.remove();
    }
  }

  async cancel(candidateId: string): Promise<void> {
    return getCompressor().cancel(candidateId);
  }

  async cleanupStaged(stagedPath: string): Promise<void> {
    return getCompressor().cleanupStaged(stagedPath);
  }
}

export class AndroidCommitAdapter implements ICommitAdapter {
  canTrash(): boolean {
    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10) || 0;
    return apiLevel >= 30; // Android 11+
  }

  getPlatformRecoveryDescription(): string {
    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10) || 0;
    if (apiLevel >= 30) {
      return 'Deleted items are moved to system trash, where retention and recovery are managed by Android and your device settings.';
    } else if (apiLevel >= 29) {
      return 'Items are permanently deleted upon user consent. Android 10 does not support system trash.';
    }
    return 'Items are permanently deleted from shared storage.';
  }

  async commitBatch(items: CommitRequestItem[]): Promise<BatchCommitSummary> {
    return getCommit().commitBatch(items);
  }
}

export class AndroidBackgroundJobAdapter implements IBackgroundJobAdapter {
  async scheduleJob(
    jobId: string,
    type: string,
    payload: Record<string, unknown>
  ): Promise<boolean> {
    return getWorkManager().scheduleJob(jobId, type, payload);
  }

  async cancelJob(jobId: string): Promise<void> {
    return getWorkManager().cancelJob(jobId);
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    return getWorkManager().getJobStatus(jobId);
  }
}
