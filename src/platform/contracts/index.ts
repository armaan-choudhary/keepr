export type MediaType = 'IMAGE' | 'VIDEO';

export type TriageDecision = 'KEEP' | 'COMPRESS' | 'DELETE';

export interface MediaItem {
  id: string; // opaque stable identifier
  mediaType: MediaType;
  assetRef: string; // opaque platform reference (URI or PHAsset local identifier)
  sizeBytes: number;
  capturedAt?: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  isFavorite?: boolean;
  isProtected?: boolean; // Keepr-local protection override
  mimeType?: string;
  filename?: string;
  sourceAlbumId?: string;
}

export type MediaAvailability =
  | 'availableOffline'
  | 'requiresNetwork'
  | 'permissionRevoked'
  | 'assetMissing';

export type LibraryAuthorizationStatus =
  | 'notDetermined'
  | 'restricted'
  | 'denied'
  | 'limited'
  | 'authorized';

export type LibraryAuthorizationScope = 'full' | 'selected' | 'none';

export interface LibraryAuthorizationState {
  status: LibraryAuthorizationStatus;
  scope: LibraryAuthorizationScope;
  canSelectMore: boolean;
  details?: string;
}

export interface MediaQueryOptions {
  pageSize?: number;
  pageToken?: string;
  mediaTypes?: MediaType[];
  sortBy?: 'date' | 'size';
  sortOrder?: 'asc' | 'desc';
  albumId?: string;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  isScreenshot?: boolean;
}

export interface MediaPage {
  items: MediaItem[];
  nextPageToken?: string;
  totalCount?: number;
  isLimitedScope?: boolean;
}

export type AlbumType = 'NATIVE_SYSTEM' | 'KEEPR_MANAGED';

export interface AlbumInfo {
  id: string;
  name: string;
  type: AlbumType;
  itemCount: number;
  isReadOnly: boolean;
  coverAssetRef?: string;
}

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
  format?: 'WEBP' | 'JPEG' | 'AUTO';
  preserveMetadata?: boolean;
  targetBitrateKbps?: number;
}

export interface CompressionCandidate {
  originalId: string;
  stagedPath: string;
  stagedSizeBytes: number;
  originalSizeBytes: number;
  estimatedSavingsBytes: number;
  measuredSavingsBytes: number;
  width: number;
  height: number;
  mimeType: string;
  isSmaller: boolean;
  isValid: boolean;
  error?: string;
}

export type CommitOutcome =
  | 'KEPT' // Item left untouched
  | 'TRASHED' // Moved to system trash (Android MediaStore trash)
  | 'PERMANENTLY_DELETED' // Deleted permanently (Android 10 consent or older)
  | 'REPLACED' // Compressed replacement published and original removed
  | 'RECENTLY_DELETED' // Placed in iOS Recently Deleted album via PhotoKit
  | 'DENIED' // User denied or cancelled system consent dialog (no changes applied to this item)
  | 'FAILED' // System error during processing or commit
  | 'SKIPPED'; // Protected item or invalid item skipped

export interface CommitRequestItem {
  mediaId: string;
  decision: TriageDecision;
  candidate?: CompressionCandidate;
  isProtected?: boolean;
}

export interface ItemCommitResult {
  mediaId: string;
  decision: TriageDecision;
  outcome: CommitOutcome;
  reclaimedBytes: number;
  error?: string;
  isPlatformTrash?: boolean;
}

export interface BatchCommitSummary {
  totalRequested: number;
  succeeded: number;
  failed: number;
  denied: number;
  totalReclaimedBytes: number;
  results: ItemCommitResult[];
}

export interface IMediaLibraryAdapter {
  getAuthorizationState(): Promise<LibraryAuthorizationState>;
  requestAuthorization(types: MediaType[]): Promise<LibraryAuthorizationState>;
  openSettings(): Promise<void>;
  queryMedia(options?: MediaQueryOptions): Promise<MediaPage>;
  getItemAvailability(id: string): Promise<MediaAvailability>;
  listAlbums(): Promise<AlbumInfo[]>;
  presentLimitedLibraryPicker?(): Promise<void>;
}

export interface ICompressorAdapter {
  compressImage(item: MediaItem, options?: CompressionOptions): Promise<CompressionCandidate>;
  compressVideo(
    item: MediaItem,
    options?: CompressionOptions,
    onProgress?: (progress: number) => void
  ): Promise<CompressionCandidate>;
  cancel(candidateId: string): Promise<void>;
  cleanupStaged(stagedPath: string): Promise<void>;
}

export interface ICommitAdapter {
  commitBatch(items: CommitRequestItem[]): Promise<BatchCommitSummary>;
  canTrash(): boolean;
  getPlatformRecoveryDescription(): string;
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface IBackgroundJobAdapter {
  scheduleJob(jobId: string, type: string, payload: Record<string, unknown>): Promise<boolean>;
  cancelJob(jobId: string): Promise<void>;
  getJobStatus(jobId: string): Promise<JobStatus>;
}
