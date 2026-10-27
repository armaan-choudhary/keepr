import { NativeModules, Platform } from 'react-native';
import {
  AndroidMediaLibraryAdapter,
  AndroidCompressorAdapter,
  AndroidCommitAdapter,
  AndroidBackgroundJobAdapter,
} from '../index';
import {
  getPlatformMediaLibrary,
  getPlatformCompressor,
  getPlatformCommit,
  getPlatformBackgroundJob,
} from '../../index';
import { MediaItem, CompressionCandidate, CommitRequestItem } from '../../contracts';

// Mock NativeModules
const mockMediaStore = {
  getAuthorizationState: jest.fn(),
  requestAuthorization: jest.fn(),
  openSettings: jest.fn(),
  queryMedia: jest.fn(),
  getItemAvailability: jest.fn(),
  listAlbums: jest.fn(),
  presentLimitedLibraryPicker: jest.fn(),
};

const mockCompressor = {
  compressImage: jest.fn(),
  compressVideo: jest.fn(),
  cancel: jest.fn(),
  cleanupStaged: jest.fn(),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};

const mockCommit = {
  commitBatch: jest.fn(),
  canTrash: jest.fn(),
  getPlatformRecoveryDescription: jest.fn(),
};

const mockWorkManager = {
  scheduleJob: jest.fn(),
  cancelJob: jest.fn(),
  getJobStatus: jest.fn(),
};

NativeModules.KeeprMediaStore = mockMediaStore;
NativeModules.KeeprCompressor = mockCompressor;
NativeModules.KeeprCommit = mockCommit;
NativeModules.KeeprWorkManager = mockWorkManager;

describe('AndroidMediaLibraryAdapter', () => {
  let adapter: AndroidMediaLibraryAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AndroidMediaLibraryAdapter();
  });

  it('retrieves authorization state with scope and canSelectMore', async () => {
    mockMediaStore.getAuthorizationState.mockResolvedValueOnce({
      status: 'limited',
      scope: 'selected',
      canSelectMore: true,
      details: 'Selected photos and videos access (Android 14+)',
    });

    const state = await adapter.getAuthorizationState();
    expect(state).toEqual({
      status: 'limited',
      scope: 'selected',
      canSelectMore: true,
      details: 'Selected photos and videos access (Android 14+)',
    });
    expect(mockMediaStore.getAuthorizationState).toHaveBeenCalledTimes(1);
  });

  it('requests authorization for specific media types', async () => {
    mockMediaStore.requestAuthorization.mockResolvedValueOnce({
      status: 'authorized',
      scope: 'full',
      canSelectMore: false,
    });

    const state = await adapter.requestAuthorization(['IMAGE', 'VIDEO']);
    expect(state.status).toBe('authorized');
    expect(state.scope).toBe('full');
    expect(mockMediaStore.requestAuthorization).toHaveBeenCalledWith(['IMAGE', 'VIDEO']);
  });

  it('opens application details settings', async () => {
    mockMediaStore.openSettings.mockResolvedValueOnce(undefined);
    await adapter.openSettings();
    expect(mockMediaStore.openSettings).toHaveBeenCalledTimes(1);
  });

  it('queries paged media with filters', async () => {
    mockMediaStore.queryMedia.mockResolvedValueOnce({
      items: [
        {
          id: '123',
          mediaType: 'IMAGE',
          assetRef: 'content://media/external/images/media/123',
          sizeBytes: 2048000,
          capturedAt: 1700000000000,
          width: 2560,
          height: 1440,
          isFavorite: false,
        },
      ],
      nextPageToken: '50',
      totalCount: null,
      isLimitedScope: false,
    });

    const result = await adapter.queryMedia({
      pageSize: 50,
      sortBy: 'date',
      sortOrder: 'desc',
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe('123');
    expect(result.nextPageToken).toBe('50');
    expect(mockMediaStore.queryMedia).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50, sortBy: 'date' })
    );
  });

  it('checks item availability offline', async () => {
    mockMediaStore.getItemAvailability.mockResolvedValueOnce('availableOffline');
    const availability = await adapter.getItemAvailability('123');
    expect(availability).toBe('availableOffline');
    expect(mockMediaStore.getItemAvailability).toHaveBeenCalledWith('123');
  });

  it('lists device albums via MediaStore buckets', async () => {
    mockMediaStore.listAlbums.mockResolvedValueOnce([
      {
        id: 'bucket-dcim',
        name: 'Camera',
        type: 'NATIVE_SYSTEM',
        itemCount: 150,
        isReadOnly: true,
        coverAssetRef: 'content://media/external/images/media/1',
      },
    ]);

    const albums = await adapter.listAlbums();
    expect(albums.length).toBe(1);
    expect(albums[0].name).toBe('Camera');
    expect(albums[0].type).toBe('NATIVE_SYSTEM');
    expect(albums[0].isReadOnly).toBe(true);
  });

  it('presents limited library picker on Android 14+', async () => {
    mockMediaStore.presentLimitedLibraryPicker.mockResolvedValueOnce(undefined);
    await adapter.presentLimitedLibraryPicker();
    expect(mockMediaStore.presentLimitedLibraryPicker).toHaveBeenCalledTimes(1);
  });
});

describe('AndroidCompressorAdapter', () => {
  let adapter: AndroidCompressorAdapter;

  const mockItem: MediaItem = {
    id: 'img-1',
    mediaType: 'IMAGE',
    assetRef: 'content://media/external/images/media/1',
    sizeBytes: 6000000,
    width: 4000,
    height: 3000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AndroidCompressorAdapter();
  });

  it('compresses an image with max dimension 2560px', async () => {
    const candidate: CompressionCandidate = {
      originalId: 'img-1',
      stagedPath: '/data/user/0/com.keepr/files/keepr_staging/img_1.jpg',
      stagedSizeBytes: 1800000,
      originalSizeBytes: 6000000,
      estimatedSavingsBytes: 4200000,
      measuredSavingsBytes: 4200000,
      width: 2560,
      height: 1920,
      mimeType: 'image/jpeg',
      isSmaller: true,
      isValid: true,
    };

    mockCompressor.compressImage.mockResolvedValueOnce(candidate);

    const result = await adapter.compressImage(mockItem, {
      maxDimension: 2560,
      quality: 85,
    });

    expect(result.isSmaller).toBe(true);
    expect(result.measuredSavingsBytes).toBe(4200000);
    expect(result.width).toBe(2560);
    expect(mockCompressor.compressImage).toHaveBeenCalledWith(
      mockItem,
      expect.objectContaining({ maxDimension: 2560 })
    );
  });

  it('cancels active compression candidate', async () => {
    mockCompressor.cancel.mockResolvedValueOnce(undefined);
    await adapter.cancel('img-1');
    expect(mockCompressor.cancel).toHaveBeenCalledWith('img-1');
  });

  it('cleans up staged file', async () => {
    mockCompressor.cleanupStaged.mockResolvedValueOnce(undefined);
    await adapter.cleanupStaged('/data/user/0/com.keepr/files/keepr_staging/img_1.jpg');
    expect(mockCompressor.cleanupStaged).toHaveBeenCalledWith('/data/user/0/com.keepr/files/keepr_staging/img_1.jpg');
  });
});

describe('AndroidCommitAdapter', () => {
  let adapter: AndroidCommitAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AndroidCommitAdapter();
  });

  it('canTrash returns true on Android 11+ (API 30+)', () => {
    const origVersion = Platform.Version;
    try {
      Object.defineProperty(Platform, 'Version', { value: 30, configurable: true });
      expect(adapter.canTrash()).toBe(true);

      Object.defineProperty(Platform, 'Version', { value: 29, configurable: true });
      expect(adapter.canTrash()).toBe(false);
    } finally {
      Object.defineProperty(Platform, 'Version', { value: origVersion, configurable: true });
    }
  });

  it('provides platform recovery description explaining trash retention', () => {
    const origVersion = Platform.Version;
    try {
      Object.defineProperty(Platform, 'Version', { value: 33, configurable: true });
      const desc33 = adapter.getPlatformRecoveryDescription();
      expect(desc33).not.toContain('30 days');
      expect(desc33).toContain('system trash');
      expect(desc33).toContain('managed by Android');

      Object.defineProperty(Platform, 'Version', { value: 29, configurable: true });
      const desc29 = adapter.getPlatformRecoveryDescription();
      expect(desc29).toContain('Android 10 does not support system trash');
    } finally {
      Object.defineProperty(Platform, 'Version', { value: origVersion, configurable: true });
    }
  });

  it('commits a batch of triage decisions and returns summary', async () => {
    const batchRequests: CommitRequestItem[] = [
      { mediaId: '1', decision: 'KEEP' },
      { mediaId: '2', decision: 'DELETE' },
    ];

    mockCommit.commitBatch.mockResolvedValueOnce({
      totalRequested: 2,
      succeeded: 2,
      failed: 0,
      denied: 0,
      totalReclaimedBytes: 3000000,
      results: [
        {
          mediaId: '1',
          decision: 'KEEP',
          outcome: 'KEPT',
          reclaimedBytes: 0,
        },
        {
          mediaId: '2',
          decision: 'DELETE',
          outcome: 'TRASHED',
          reclaimedBytes: 3000000,
          isPlatformTrash: true,
        },
      ],
    });

    const summary = await adapter.commitBatch(batchRequests);
    expect(summary.totalRequested).toBe(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.totalReclaimedBytes).toBe(3000000);
    expect(mockCommit.commitBatch).toHaveBeenCalledWith(batchRequests);
  });
});

describe('AndroidBackgroundJobAdapter', () => {
  let adapter: AndroidBackgroundJobAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AndroidBackgroundJobAdapter();
  });

  it('schedules a background job via WorkManager', async () => {
    mockWorkManager.scheduleJob.mockResolvedValueOnce(true);
    const scheduled = await adapter.scheduleJob('job-android-1', 'cleanup', { maxAgeHours: 24 });
    expect(scheduled).toBe(true);
    expect(mockWorkManager.scheduleJob).toHaveBeenCalledWith('job-android-1', 'cleanup', {
      maxAgeHours: 24,
    });
  });

  it('cancels a background job', async () => {
    mockWorkManager.cancelJob.mockResolvedValueOnce(undefined);
    await adapter.cancelJob('job-android-1');
    expect(mockWorkManager.cancelJob).toHaveBeenCalledWith('job-android-1');
  });

  it('retrieves status of a background job', async () => {
    mockWorkManager.getJobStatus.mockResolvedValueOnce('COMPLETED');
    const status = await adapter.getJobStatus('job-android-1');
    expect(status).toBe('COMPLETED');
    expect(mockWorkManager.getJobStatus).toHaveBeenCalledWith('job-android-1');
  });
});

describe('Platform factory resolution on Android', () => {
  const originalPlatform = Platform.OS;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', {
      value: 'android',
      writable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      writable: true,
    });
  });

  it('resolves Android platform adapters correctly', () => {
    expect(getPlatformMediaLibrary()).toBeInstanceOf(AndroidMediaLibraryAdapter);
    expect(getPlatformCompressor()).toBeInstanceOf(AndroidCompressorAdapter);
    expect(getPlatformCommit()).toBeInstanceOf(AndroidCommitAdapter);
    expect(getPlatformBackgroundJob()).toBeInstanceOf(AndroidBackgroundJobAdapter);
  });
});
