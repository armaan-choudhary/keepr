import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import {
  IMediaLibraryAdapter,
  ICompressorAdapter,
  ICommitAdapter,
  IBackgroundJobAdapter,
  LibraryAuthorizationState,
  MediaType,
  MediaItem,
  MediaPage,
  MediaQueryOptions,
  MediaAvailability,
  AlbumInfo,
  CompressionOptions,
  CompressionCandidate,
  CommitRequestItem,
  BatchCommitSummary,
  JobStatus,
} from '../contracts';

function getMediaModule() {
  const mod = NativeModules.KeeprMediaModule;
  if (!mod) {
    throw new Error(
      'KeeprMediaModule is not linked. Ensure the iOS native module is compiled and linked.'
    );
  }
  return mod;
}

function getCompressorModule() {
  const mod = NativeModules.KeeprCompressorModule;
  if (!mod) {
    throw new Error(
      'KeeprCompressorModule is not linked. Ensure the iOS native module is compiled and linked.'
    );
  }
  return mod;
}

function getCommitModule() {
  const mod = NativeModules.KeeprCommitModule;
  if (!mod) {
    throw new Error(
      'KeeprCommitModule is not linked. Ensure the iOS native module is compiled and linked.'
    );
  }
  return mod;
}

function getBackgroundModule() {
  const mod = NativeModules.KeeprBackgroundModule;
  if (!mod) {
    throw new Error(
      'KeeprBackgroundModule is not linked. Ensure the iOS native module is compiled and linked.'
    );
  }
  return mod;
}

export class IOSMediaLibraryAdapter implements IMediaLibraryAdapter {
  async getAuthorizationState(): Promise<LibraryAuthorizationState> {
    const mod = getMediaModule();
    const raw = await mod.getAuthorizationState();
    return {
      status: raw.status,
      scope: raw.scope,
      canSelectMore: Boolean(raw.canSelectMore),
      details: raw.details,
    };
  }

  async requestAuthorization(types: MediaType[]): Promise<LibraryAuthorizationState> {
    const mod = getMediaModule();
    const raw = await mod.requestAuthorization(types);
    return {
      status: raw.status,
      scope: raw.scope,
      canSelectMore: Boolean(raw.canSelectMore),
      details: raw.details,
    };
  }

  async openSettings(): Promise<void> {
    const mod = getMediaModule();
    await mod.openSettings();
  }

  async queryMedia(options?: MediaQueryOptions): Promise<MediaPage> {
    const mod = getMediaModule();
    const opts = {
      pageSize: options?.pageSize ?? 50,
      pageToken: options?.pageToken,
      mediaTypes: options?.mediaTypes,
      sortBy: options?.sortBy ?? 'date',
      sortOrder: options?.sortOrder ?? 'desc',
      albumId: options?.albumId,
      minSizeBytes: options?.minSizeBytes,
      maxSizeBytes: options?.maxSizeBytes,
      isScreenshot: options?.isScreenshot,
    };

    const raw = await mod.queryMedia(opts);
    return {
      items: raw.items as MediaItem[],
      nextPageToken: raw.nextPageToken ?? undefined,
      totalCount: raw.totalCount,
      isLimitedScope: raw.isLimitedScope,
    };
  }

  async getItemAvailability(id: string): Promise<MediaAvailability> {
    const mod = getMediaModule();
    const raw = await mod.getItemAvailability(id);
    return raw as MediaAvailability;
  }

  async listAlbums(): Promise<AlbumInfo[]> {
    const mod = getMediaModule();
    const raw = await mod.listAlbums();
    return (raw as any[]).map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      itemCount: a.itemCount,
      isReadOnly: Boolean(a.isReadOnly),
      coverAssetRef: a.coverAssetRef ?? undefined,
    }));
  }

  async presentLimitedLibraryPicker(): Promise<void> {
    const mod = getMediaModule();
    await mod.presentLimitedLibraryPicker();
  }
}

export class IOSCompressorAdapter implements ICompressorAdapter {
  private compressorEmitter?: NativeEventEmitter;

  private getEmitter(): NativeEventEmitter | undefined {
    if (!this.compressorEmitter && NativeModules.KeeprCompressorModule) {
      this.compressorEmitter = new NativeEventEmitter(NativeModules.KeeprCompressorModule);
    }
    return this.compressorEmitter;
  }

  async compressImage(
    item: MediaItem,
    options?: CompressionOptions
  ): Promise<CompressionCandidate> {
    const mod = getCompressorModule();
    const opts = {
      maxDimension: options?.maxDimension ?? 2560,
      quality: options?.quality ?? 0.8,
      format: options?.format ?? 'AUTO',
      preserveMetadata: options?.preserveMetadata ?? true,
    };

    const raw = await mod.compressImage(item, opts);
    return raw as CompressionCandidate;
  }

  async compressVideo(
    item: MediaItem,
    options?: CompressionOptions,
    onProgress?: (progress: number) => void
  ): Promise<CompressionCandidate> {
    const mod = getCompressorModule();
    const opts = {
      maxDimension: options?.maxDimension ?? 1920,
      quality: options?.quality ?? 0.8,
      targetBitrateKbps: options?.targetBitrateKbps,
      preserveMetadata: options?.preserveMetadata ?? true,
    };

    let subscription: { remove: () => void } | undefined;
    const emitter = this.getEmitter();

    if (onProgress && emitter) {
      subscription = emitter.addListener(
        'onCompressionProgress',
        (event: any) => {
          if (event && event.originalId === item.id) {
            onProgress(event.progress);
          }
        }
      );
    }

    try {
      const raw = await mod.compressVideo(item, opts);
      return raw as CompressionCandidate;
    } finally {
      subscription?.remove();
    }
  }

  async cancel(candidateId: string): Promise<void> {
    const mod = getCompressorModule();
    await mod.cancel(candidateId);
  }

  async cleanupStaged(stagedPath: string): Promise<void> {
    const mod = getCompressorModule();
    await mod.cleanupStaged(stagedPath);
  }
}

export class IOSCommitAdapter implements ICommitAdapter {
  async commitBatch(items: CommitRequestItem[]): Promise<BatchCommitSummary> {
    const mod = getCommitModule();
    const raw = await mod.commitBatch(items);
    return raw as BatchCommitSummary;
  }

  canTrash(): boolean {
    // iOS PhotoKit does not provide MediaStore-style programmatic trash/recovery.
    // Deletions are handled by iOS PhotoKit and placed into the system "Recently Deleted" album,
    // with recovery managed entirely by iOS and user device settings.
    return false;
  }

  getPlatformRecoveryDescription(): string {
    return "Deleted items are removed through iOS PhotoKit and placed in the system 'Recently Deleted' album, with recovery managed by iOS and your device settings.";
  }
}

export class IOSBackgroundJobAdapter implements IBackgroundJobAdapter {
  async scheduleJob(
    jobId: string,
    type: string,
    payload: Record<string, unknown>
  ): Promise<boolean> {
    const mod = getBackgroundModule();
    const success = await mod.scheduleJob(jobId, type, payload);
    return Boolean(success);
  }

  async cancelJob(jobId: string): Promise<void> {
    const mod = getBackgroundModule();
    await mod.cancelJob(jobId);
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const mod = getBackgroundModule();
    const raw = await mod.getJobStatus(jobId);
    return raw as JobStatus;
  }
}
