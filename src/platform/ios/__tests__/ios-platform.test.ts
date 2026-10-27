import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import {
  IOSMediaLibraryAdapter,
  IOSCompressorAdapter,
  IOSCommitAdapter,
  IOSBackgroundJobAdapter,
} from '../index';
import {
  getPlatformMediaLibrary,
  getPlatformCompressor,
  getPlatformCommit,
  getPlatformBackgroundJob,
} from '../../index';
import { MediaItem, CompressionCandidate, CommitRequestItem } from '../../contracts';

// Mock NativeModules
const mockMediaModule = {
  getAuthorizationState: jest.fn(),
  requestAuthorization: jest.fn(),
  openSettings: jest.fn(),
  queryMedia: jest.fn(),
  getItemAvailability: jest.fn(),
  listAlbums: jest.fn(),
  presentLimitedLibraryPicker: jest.fn(),
};

const mockCompressorModule = {
  compressImage: jest.fn(),
  compressVideo: jest.fn(),
  cancel: jest.fn(),
  cleanupStaged: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

const mockCommitModule = {
  commitBatch: jest.fn(),
  canTrash: jest.fn(),
  getPlatformRecoveryDescription: jest.fn(),
};

const mockBackgroundModule = {
  scheduleJob: jest.fn(),
  cancelJob: jest.fn(),
  getJobStatus: jest.fn(),
};

NativeModules.KeeprMediaModule = mockMediaModule;
NativeModules.KeeprCompressorModule = mockCompressorModule;
NativeModules.KeeprCommitModule = mockCommitModule;
NativeModules.KeeprBackgroundModule = mockBackgroundModule;

describe('IOSMediaLibraryAdapter', () => {
  let adapter: IOSMediaLibraryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new IOSMediaLibraryAdapter();
  });

  it('retrieves authorization state with scope and canSelectMore', async () => {
    mockMediaModule.getAuthorizationState.mockResolvedValueOnce({
      status: 'limited',
      scope: 'selected',
      canSelectMore: true,
      details: 'Limited Photos access',
    });

    const state = await adapter.getAuthorizationState();
    expect(state).toEqual({
      status: 'limited',
      scope: 'selected',
      canSelectMore: true,
      details: 'Limited Photos access',
    });
    expect(mockMediaModule.getAuthorizationState).toHaveBeenCalledTimes(1);
  });

  it('requests authorization for specific media types', async () => {
    mockMediaModule.requestAuthorization.mockResolvedValueOnce({
      status: 'authorized',
      scope: 'full',
      canSelectMore: false,
    });

    const state = await adapter.requestAuthorization(['IMAGE', 'VIDEO']);
    expect(state.status).toBe('authorized');
    expect(state.scope).toBe('full');
    expect(mockMediaModule.requestAuthorization).toHaveBeenCalledWith(['IMAGE', 'VIDEO']);
  });

  it('opens system settings', async () => {
    mockMediaModule.openSettings.mockResolvedValueOnce(undefined);
    await adapter.openSettings();
    expect(mockMediaModule.openSettings).toHaveBeenCalledTimes(1);
  });

  it('queries paged media with filters', async () => {
    mockMediaModule.queryMedia.mockResolvedValueOnce({
      items: [
        {
          id: 'asset-1',
          mediaType: 'IMAGE',
          assetRef: 'asset-1',
          sizeBytes: 1024000,
          capturedAt: 1700000000000,
          width: 3840,
          height: 2160,
          isFavorite: false,
        },
      ],
      nextPageToken: '50',
      totalCount: 150,
      isLimitedScope: false,
    });

    const result = await adapter.queryMedia({
      pageSize: 50,
      sortBy: 'date',
      sortOrder: 'desc',
    });

    expect(result.items.length).toBe(1);
    expect(result.nextPageToken).toBe('50');
    expect(result.totalCount).toBe(150);
    expect(mockMediaModule.queryMedia).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50, sortBy: 'date' })
    );
  });

  it('checks item availability offline', async () => {
    mockMediaModule.getItemAvailability.mockResolvedValueOnce('requiresNetwork');
    const availability = await adapter.getItemAvailability('asset-cloud-only');
    expect(availability).toBe('requiresNetwork');
    expect(mockMediaModule.getItemAvailability).toHaveBeenCalledWith('asset-cloud-only');
  });

  it('lists native user albums', async () => {
    mockMediaModule.listAlbums.mockResolvedValueOnce([
      {
        id: 'album-1',
        name: 'Vacation',
        type: 'NATIVE_SYSTEM',
        itemCount: 42,
        isReadOnly: false,
        coverAssetRef: 'asset-1',
      },
    ]);

    const albums = await adapter.listAlbums();
    expect(albums.length).toBe(1);
    expect(albums[0].name).toBe('Vacation');
    expect(albums[0].isReadOnly).toBe(false);
  });

  it('handles limited access restriction for album operations', async () => {
    mockMediaModule.listAlbums.mockRejectedValueOnce(
      new Error(
        'Native album operations are unavailable under iOS Limited Photos access. PhotoKit does not permit fetching or creating albums without full library authorization. Use Keepr collections to organize your selected media, or upgrade to Full Access in iOS Settings.'
      )
    );

    await expect(adapter.listAlbums()).rejects.toThrow(
      /Native album operations are unavailable under iOS Limited Photos access/
    );
  });

  it('queries media with limited scope indicator', async () => {
    mockMediaModule.queryMedia.mockResolvedValueOnce({
      items: [],
      nextPageToken: null,
      totalCount: 5,
      isLimitedScope: true,
    });

    const result = await adapter.queryMedia();
    expect(result.isLimitedScope).toBe(true);
    expect(result.items).toEqual([]);
  });

  it('presents limited library picker', async () => {
    mockMediaModule.presentLimitedLibraryPicker.mockResolvedValueOnce(undefined);
    await adapter.presentLimitedLibraryPicker();
    expect(mockMediaModule.presentLimitedLibraryPicker).toHaveBeenCalledTimes(1);
  });
});

describe('IOSCompressorAdapter', () => {
  let adapter: IOSCompressorAdapter;

  const mockItem: MediaItem = {
    id: 'asset-img-1',
    mediaType: 'IMAGE',
    assetRef: 'asset-img-1',
    sizeBytes: 5000000,
    width: 4000,
    height: 3000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new IOSCompressorAdapter();
  });

  it('compresses an image with max dimension 2560px', async () => {
    const candidate: CompressionCandidate = {
      originalId: 'asset-img-1',
      stagedPath: '/path/to/staging/comp_1.jpg',
      stagedSizeBytes: 1500000,
      originalSizeBytes: 5000000,
      estimatedSavingsBytes: 2000000,
      measuredSavingsBytes: 3500000,
      width: 2560,
      height: 1920,
      mimeType: 'image/jpeg',
      isSmaller: true,
      isValid: true,
    };

    mockCompressorModule.compressImage.mockResolvedValueOnce(candidate);

    const result = await adapter.compressImage(mockItem, {
      maxDimension: 2560,
      quality: 0.8,
    });

    expect(result.isSmaller).toBe(true);
    expect(result.measuredSavingsBytes).toBe(3500000);
    expect(result.width).toBe(2560);
    expect(mockCompressorModule.compressImage).toHaveBeenCalledWith(
      mockItem,
      expect.objectContaining({ maxDimension: 2560 })
    );
  });

  it('cancels an active compression candidate', async () => {
    mockCompressorModule.cancel.mockResolvedValueOnce(undefined);
    await adapter.cancel('candidate-123');
    expect(mockCompressorModule.cancel).toHaveBeenCalledWith('candidate-123');
  });

  it('cleans up staged output file', async () => {
    mockCompressorModule.cleanupStaged.mockResolvedValueOnce(undefined);
    await adapter.cleanupStaged('/staging/comp_123.jpg');
    expect(mockCompressorModule.cleanupStaged).toHaveBeenCalledWith('/staging/comp_123.jpg');
  });
});

describe('IOSCommitAdapter', () => {
  let adapter: IOSCommitAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new IOSCommitAdapter();
  });

  it('canTrash returns false on iOS (uses PhotoKit Recently Deleted, not MediaStore trash)', () => {
    expect(adapter.canTrash()).toBe(false);
  });

  it('provides recovery description referencing iOS Recently Deleted without promising 30 days', () => {
    const desc = adapter.getPlatformRecoveryDescription();
    expect(desc).toBe(
      "Deleted items are removed through iOS PhotoKit and placed in the system 'Recently Deleted' album, with recovery managed by iOS and your device settings."
    );
    expect(desc).toContain('Recently Deleted');
    expect(desc).not.toContain('30 days');
    expect(desc).toContain('iOS');
  });

  it('commits a batch of decisions', async () => {
    const batchRequests: CommitRequestItem[] = [
      { mediaId: 'asset-1', decision: 'KEEP' },
      { mediaId: 'asset-2', decision: 'DELETE' },
    ];

    mockCommitModule.commitBatch.mockResolvedValueOnce({
      totalRequested: 2,
      succeeded: 2,
      failed: 0,
      denied: 0,
      totalReclaimedBytes: 4000000,
      results: [
        {
          mediaId: 'asset-1',
          decision: 'KEEP',
          outcome: 'KEPT',
          reclaimedBytes: 0,
          isPlatformTrash: false,
        },
        {
          mediaId: 'asset-2',
          decision: 'DELETE',
          outcome: 'RECENTLY_DELETED',
          reclaimedBytes: 4000000,
          isPlatformTrash: false,
        },
      ],
    });

    const summary = await adapter.commitBatch(batchRequests);
    expect(summary.totalRequested).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.totalReclaimedBytes).toBe(4000000);
    expect(summary.results[1].isPlatformTrash).toBe(false);
    expect(mockCommitModule.commitBatch).toHaveBeenCalledWith(batchRequests);
  });

  it('handles safe replacement commit with REPLACED outcome', async () => {
    const batchRequests: CommitRequestItem[] = [
      {
        mediaId: 'asset-replace-1',
        decision: 'COMPRESS',
        candidate: {
          originalId: 'asset-replace-1',
          stagedPath: '/staging/comp_1.jpg',
          stagedSizeBytes: 1000000,
          originalSizeBytes: 4000000,
          estimatedSavingsBytes: 2500000,
          measuredSavingsBytes: 3000000,
          width: 2560,
          height: 1920,
          mimeType: 'image/jpeg',
          isSmaller: true,
          isValid: true,
        },
      },
    ];

    mockCommitModule.commitBatch.mockResolvedValueOnce({
      totalRequested: 1,
      succeeded: 1,
      failed: 0,
      denied: 0,
      totalReclaimedBytes: 3000000,
      results: [
        {
          mediaId: 'asset-replace-1',
          decision: 'COMPRESS',
          outcome: 'REPLACED',
          reclaimedBytes: 3000000,
          isPlatformTrash: false,
        },
      ],
    });

    const summary = await adapter.commitBatch(batchRequests);
    expect(summary.succeeded).toBe(1);
    expect(summary.results[0].outcome).toBe('REPLACED');
    expect(summary.results[0].reclaimedBytes).toBe(3000000);
    expect(summary.results[0].isPlatformTrash).toBe(false);
  });

  it('handles permission denial gracefully without false failure', async () => {
    const batchRequests: CommitRequestItem[] = [
      { mediaId: 'asset-denied', decision: 'DELETE' },
    ];

    mockCommitModule.commitBatch.mockResolvedValueOnce({
      totalRequested: 1,
      succeeded: 0,
      failed: 0,
      denied: 1,
      totalReclaimedBytes: 0,
      results: [
        {
          mediaId: 'asset-denied',
          decision: 'DELETE',
          outcome: 'DENIED',
          reclaimedBytes: 0,
          error: 'User denied deletion consent.',
          isPlatformTrash: false,
        },
      ],
    });

    const summary = await adapter.commitBatch(batchRequests);
    expect(summary.denied).toBe(1);
    expect(summary.results[0].outcome).toBe('DENIED');
    expect(summary.results[0].error).toContain('denied');
  });

  it('skips protected items during commit', async () => {
    const batchRequests: CommitRequestItem[] = [
      { mediaId: 'asset-protected', decision: 'DELETE', isProtected: true },
    ];

    mockCommitModule.commitBatch.mockResolvedValueOnce({
      totalRequested: 1,
      succeeded: 0,
      failed: 0,
      denied: 1,
      totalReclaimedBytes: 0,
      results: [
        {
          mediaId: 'asset-protected',
          decision: 'DELETE',
          outcome: 'SKIPPED',
          reclaimedBytes: 0,
          error: 'Item is marked as protected by Keepr local protection.',
          isPlatformTrash: false,
        },
      ],
    });

    const summary = await adapter.commitBatch(batchRequests);
    expect(summary.denied).toBe(1);
    expect(summary.results[0].outcome).toBe('SKIPPED');
    expect(summary.results[0].error).toContain('protected');
  });
});

describe('IOSBackgroundJobAdapter', () => {
  let adapter: IOSBackgroundJobAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new IOSBackgroundJobAdapter();
  });

  it('schedules a background job', async () => {
    mockBackgroundModule.scheduleJob.mockResolvedValueOnce(true);
    const scheduled = await adapter.scheduleJob('job-1', 'COMPRESSION_BATCH', { count: 5 });
    expect(scheduled).toBe(true);
    expect(mockBackgroundModule.scheduleJob).toHaveBeenCalledWith('job-1', 'COMPRESSION_BATCH', {
      count: 5,
    });
  });

  it('cancels a background job', async () => {
    mockBackgroundModule.cancelJob.mockResolvedValueOnce(undefined);
    await adapter.cancelJob('job-1');
    expect(mockBackgroundModule.cancelJob).toHaveBeenCalledWith('job-1');
  });

  it('retrieves status of a background job', async () => {
    mockBackgroundModule.getJobStatus.mockResolvedValueOnce('RUNNING');
    const status = await adapter.getJobStatus('job-1');
    expect(status).toBe('RUNNING');
    expect(mockBackgroundModule.getJobStatus).toHaveBeenCalledWith('job-1');
  });
});

describe('Platform factory resolution on iOS', () => {
  const originalPlatform = Platform.OS;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', {
      value: 'ios',
      writable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      writable: true,
    });
  });

  it('resolves iOS platform adapters correctly', () => {
    expect(getPlatformMediaLibrary()).toBeInstanceOf(IOSMediaLibraryAdapter);
    expect(getPlatformCompressor()).toBeInstanceOf(IOSCompressorAdapter);
    expect(getPlatformCommit()).toBeInstanceOf(IOSCommitAdapter);
    expect(getPlatformBackgroundJob()).toBeInstanceOf(IOSBackgroundJobAdapter);
  });
});

