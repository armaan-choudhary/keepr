import {
  MediaItem,
  CompressionCandidate,
  ICompressorAdapter,
} from '../../src/platform/contracts';
import {
  CompressionCoordinator,
  DuplicateBurstGrouping,
  SmartFilters,
  StorageForecastCalculator,
  CloudSyncService,
} from '../../src/processing';
import { DurableStorageEngine } from '../../src/data';

describe('CompressionCoordinator', () => {
  const sampleImage: MediaItem = {
    id: 'img-1',
    assetRef: 'ph://img-1',
    mediaType: 'IMAGE',
    sizeBytes: 5000000, // 5MB
    width: 3000,
    height: 2000,
  };

  it('validates and accepts a smaller, valid compressed candidate', async () => {
    const mockCandidate: CompressionCandidate = {
      originalId: 'img-1',
      stagedPath: '/staging/img-1.webp',
      stagedSizeBytes: 1500000, // 1.5MB (< 5MB)
      originalSizeBytes: 5000000,
      estimatedSavingsBytes: 3000000,
      measuredSavingsBytes: 3500000,
      width: 2560,
      height: 1706,
      mimeType: 'image/webp',
      isSmaller: true,
      isValid: true,
    };

    const cleanedPaths: string[] = [];
    const mockAdapter: ICompressorAdapter = {
      compressImage: jest.fn().mockResolvedValue(mockCandidate),
      compressVideo: jest.fn(),
      cancel: jest.fn(),
      cleanupStaged: jest.fn(async (path) => {
        cleanedPaths.push(path);
      }),
    };

    const coordinator = new CompressionCoordinator(mockAdapter);
    const result = await coordinator.processItem(sampleImage);

    expect(result.isValid).toBe(true);
    expect(result.measuredSavingsBytes).toBe(3500000);
    expect(result.candidate.isSmaller).toBe(true);
    expect(cleanedPaths).toEqual([]); // no cleanup needed on valid output
  });

  it('rejects candidate if output is not smaller, cleans up staging, and keeps original untouched', async () => {
    const largerCandidate: CompressionCandidate = {
      originalId: 'img-1',
      stagedPath: '/staging/img-1-larger.webp',
      stagedSizeBytes: 5200000, // 5.2MB (> 5MB original!)
      originalSizeBytes: 5000000,
      estimatedSavingsBytes: 1000000,
      measuredSavingsBytes: -200000,
      width: 2560,
      height: 1706,
      mimeType: 'image/webp',
      isSmaller: false,
      isValid: true,
    };

    const cleanedPaths: string[] = [];
    const mockAdapter: ICompressorAdapter = {
      compressImage: jest.fn().mockResolvedValue(largerCandidate),
      compressVideo: jest.fn(),
      cancel: jest.fn(),
      cleanupStaged: jest.fn(async (path) => {
        cleanedPaths.push(path);
      }),
    };

    const coordinator = new CompressionCoordinator(mockAdapter);
    const result = await coordinator.processItem(sampleImage);

    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toContain('not smaller than original');
    expect(cleanedPaths).toEqual(['/staging/img-1-larger.webp']);
  });

  it('rejects candidate if staged size is zero and triggers cleanup', async () => {
    const zeroByteCandidate: CompressionCandidate = {
      originalId: 'img-1',
      stagedPath: '/staging/zero.webp',
      stagedSizeBytes: 0,
      originalSizeBytes: 5000000,
      estimatedSavingsBytes: 3000000,
      measuredSavingsBytes: 0,
      width: 0,
      height: 0,
      mimeType: 'image/webp',
      isSmaller: true,
      isValid: true,
    };

    const cleanedPaths: string[] = [];
    const mockAdapter: ICompressorAdapter = {
      compressImage: jest.fn().mockResolvedValue(zeroByteCandidate),
      compressVideo: jest.fn(),
      cancel: jest.fn(),
      cleanupStaged: jest.fn(async (path) => {
        cleanedPaths.push(path);
      }),
    };

    const coordinator = new CompressionCoordinator(mockAdapter);
    const result = await coordinator.processItem(sampleImage);

    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toContain('zero size');
    expect(cleanedPaths).toEqual(['/staging/zero.webp']);
  });
});

describe('Duplicate & Burst Grouping', () => {
  it('groups consecutive items within 2-second timestamp proximity into a burst', () => {
    const baseTime = 1700000000000;
    const items: MediaItem[] = [
      { id: 'b1', assetRef: 'ph://b1', mediaType: 'IMAGE', sizeBytes: 2000, capturedAt: baseTime, width: 1000, height: 1000 },
      { id: 'b2', assetRef: 'ph://b2', mediaType: 'IMAGE', sizeBytes: 2100, capturedAt: baseTime + 800, width: 1000, height: 1000 },
      { id: 'b3', assetRef: 'ph://b3', mediaType: 'IMAGE', sizeBytes: 1900, capturedAt: baseTime + 1600, width: 1000, height: 1000 },
      // Separate item captured 10 seconds later
      { id: 'sep', assetRef: 'ph://sep', mediaType: 'IMAGE', sizeBytes: 2000, capturedAt: baseTime + 10000, width: 1000, height: 1000 },
    ];

    const grouper = new DuplicateBurstGrouping();
    const bursts = grouper.groupBursts(items);

    expect(bursts.length).toBe(1);
    expect(bursts[0].type).toBe('BURST');
    expect(bursts[0].members.length).toBe(3);
    expect(bursts[0].members.map((m) => m.item.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('groups exact duplicates based on size and dimensions/duration', () => {
    const items: MediaItem[] = [
      { id: 'dup-1', assetRef: 'ph://dup1', mediaType: 'IMAGE', sizeBytes: 345678, width: 1920, height: 1080 },
      { id: 'dup-2', assetRef: 'ph://dup2', mediaType: 'IMAGE', sizeBytes: 345678, width: 1920, height: 1080 },
      { id: 'diff', assetRef: 'ph://diff', mediaType: 'IMAGE', sizeBytes: 999999, width: 1920, height: 1080 },
    ];

    const grouper = new DuplicateBurstGrouping();
    const dupes = grouper.groupExactDuplicates(items);

    expect(dupes.length).toBe(1);
    expect(dupes[0].type).toBe('EXACT_DUPLICATE');
    expect(dupes[0].members.length).toBe(2);
  });

  it('selects highest quality / priority item as representative and recommends KEEP', () => {
    const items: MediaItem[] = [
      { id: 'low-res', assetRef: 'ph://low', mediaType: 'IMAGE', sizeBytes: 50000, width: 640, height: 480, capturedAt: 1000 },
      { id: 'high-res', assetRef: 'ph://high', mediaType: 'IMAGE', sizeBytes: 500000, width: 3840, height: 2160, capturedAt: 1500 },
      { id: 'mid-res', assetRef: 'ph://mid', mediaType: 'IMAGE', sizeBytes: 200000, width: 1920, height: 1080, capturedAt: 1200 },
    ];

    const grouper = new DuplicateBurstGrouping();
    const bursts = grouper.groupBursts(items);

    expect(bursts.length).toBe(1);
    const rep = bursts[0].representativeItem;
    expect(rep.id).toBe('high-res');

    const highResMember = bursts[0].members.find((m) => m.item.id === 'high-res');
    expect(highResMember?.isRepresentative).toBe(true);
    expect(highResMember?.recommendedDecision).toBe('KEEP');

    const lowResMember = bursts[0].members.find((m) => m.item.id === 'low-res');
    expect(lowResMember?.isRepresentative).toBe(false);
    expect(lowResMember?.recommendedDecision).toBe('DELETE');
  });

  it('supports user manual override of representative and individual decisions', () => {
    const items: MediaItem[] = [
      { id: 'item-1', assetRef: 'ph://1', mediaType: 'IMAGE', sizeBytes: 1000, width: 1000, height: 1000, capturedAt: 1000 },
      { id: 'item-2', assetRef: 'ph://2', mediaType: 'IMAGE', sizeBytes: 1000, width: 1000, height: 1000, capturedAt: 1500 },
    ];

    const grouper = new DuplicateBurstGrouping();
    const [group] = grouper.groupBursts(items);

    // Override representative
    const updated = grouper.setRepresentativeItem(group.id, 'item-2');
    expect(updated.representativeItem.id).toBe('item-2');
    const member2 = updated.members.find((m) => m.item.id === 'item-2');
    expect(member2?.recommendedDecision).toBe('KEEP');

    // Override individual decision
    const withDecisionOverride = grouper.overrideDecision(group.id, 'item-1', 'COMPRESS');
    const member1 = withDecisionOverride.members.find((m) => m.item.id === 'item-1');
    expect(member1?.userOverride).toBe('COMPRESS');

    // Remove item from group
    grouper.removeFromGroup(group.id, 'item-1');
    // Group should now be dissolved because < 2 items remain
    expect(grouper.getGroup(group.id)).toBeUndefined();
  });
});

describe('Smart Triage Queue Filters', () => {
  const now = 1700000000000;
  const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000;
  const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

  const library: MediaItem[] = [
    {
      id: 'old-shot',
      assetRef: 'ph://old-shot',
      mediaType: 'IMAGE',
      sizeBytes: 1000000,
      filename: 'Screenshot_2023.png',
      capturedAt: fortyDaysAgo,
    },
    {
      id: 'new-shot',
      assetRef: 'ph://new-shot',
      mediaType: 'IMAGE',
      sizeBytes: 1000000,
      filename: 'Screenshot_recent.png',
      capturedAt: tenDaysAgo,
    },
    {
      id: 'heavy-video',
      assetRef: 'ph://heavy-video',
      mediaType: 'VIDEO',
      sizeBytes: 50 * 1024 * 1024, // 50MB
      durationSeconds: 30,
      capturedAt: tenDaysAgo,
    },
    {
      id: 'whatsapp-photo',
      assetRef: 'ph://wa',
      mediaType: 'IMAGE',
      sizeBytes: 500000,
      filename: 'IMG-20231015-WA0004.jpg',
      capturedAt: tenDaysAgo,
    },
  ];

  it('filters old screenshots (>30 days old)', () => {
    const oldShots = SmartFilters.filterOldScreenshots(library, now);
    expect(oldShots.length).toBe(1);
    expect(oldShots[0].id).toBe('old-shot');
  });

  it('filters heavy hitters (>15MB) sorted by size descending', () => {
    const heavy = SmartFilters.filterHeavyHitters(library);
    expect(heavy.length).toBe(1);
    expect(heavy[0].id).toBe('heavy-video');
  });

  it('filters messaging media by filename or sourceAlbumId', () => {
    const messaging = SmartFilters.filterMessagingMedia(library);
    expect(messaging.length).toBe(1);
    expect(messaging[0].id).toBe('whatsapp-photo');
  });

  it('filters On This Day accurately across years', () => {
    // Nov 14, 2026
    const refDate = new Date(2026, 10, 14, 12, 0, 0);

    const pastYearItem: MediaItem = {
      id: 'otd-item',
      assetRef: 'ph://otd',
      mediaType: 'IMAGE',
      sizeBytes: 2000,
      // Nov 14, 2024
      capturedAt: new Date(2024, 10, 14, 9, 30, 0).getTime(),
    };

    const sameYearItem: MediaItem = {
      id: 'same-year-item',
      assetRef: 'ph://same',
      mediaType: 'IMAGE',
      sizeBytes: 2000,
      // Nov 14, 2026 (today)
      capturedAt: new Date(2026, 10, 14, 8, 0, 0).getTime(),
    };

    const res = SmartFilters.filterOnThisDay([pastYearItem, sameYearItem], refDate);
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('otd-item');
  });

  it('groups items month by month safely handling missing metadata', () => {
    const date1 = new Date(2025, 4, 10).getTime(); // May 2025
    const date2 = new Date(2025, 4, 20).getTime(); // May 2025
    const date3 = new Date(2025, 5, 1).getTime();  // June 2025

    const items: MediaItem[] = [
      { id: '1', assetRef: '1', mediaType: 'IMAGE', sizeBytes: 100, capturedAt: date1 },
      { id: '2', assetRef: '2', mediaType: 'IMAGE', sizeBytes: 100, capturedAt: date2 },
      { id: '3', assetRef: '3', mediaType: 'IMAGE', sizeBytes: 100, capturedAt: date3 },
      { id: 'no-date', assetRef: '4', mediaType: 'IMAGE', sizeBytes: 100 },
    ];

    const grouped = SmartFilters.groupByMonth(items);
    expect(grouped.get('2025-05')?.length).toBe(2);
    expect(grouped.get('2025-06')?.length).toBe(1);
    expect(grouped.get('Unknown')?.length).toBe(1);

    const mayItems = SmartFilters.filterByMonth(items, 2025, 5);
    expect(mayItems.length).toBe(2);
  });
});

describe('StorageForecastCalculator', () => {
  it('estimates potential savings for images and videos based on resolution and size', () => {
    const highResImage: MediaItem = {
      id: 'high-img',
      assetRef: 'ph://high',
      mediaType: 'IMAGE',
      sizeBytes: 10000000, // 10MB
      width: 4000,
      height: 3000,
    };

    const forecast = StorageForecastCalculator.estimateCompressionSavings(highResImage);
    expect(forecast.estimatedSavingsRatio).toBe(0.65);
    expect(forecast.estimatedSavingsBytes).toBe(6500000);
    expect(forecast.basis).toContain('>2560px');
  });

  it('calculates queue forecast for mixed triage decisions', () => {
    const items = [
      {
        item: {
          id: 'del-item',
          assetRef: 'ph://1',
          mediaType: 'IMAGE' as const,
          sizeBytes: 10000000,
        },
        decision: 'DELETE' as const,
      },
      {
        item: {
          id: 'comp-item',
          assetRef: 'ph://2',
          mediaType: 'IMAGE' as const,
          sizeBytes: 10000000,
          width: 4000,
          height: 3000,
        },
        decision: 'COMPRESS' as const,
      },
      {
        item: {
          id: 'keep-item',
          assetRef: 'ph://3',
          mediaType: 'IMAGE' as const,
          sizeBytes: 5000000,
        },
        decision: 'KEEP' as const,
      },
    ];

    const queueForecast = StorageForecastCalculator.forecastQueue(items);
    expect(queueForecast.itemCount).toBe(2); // del-item + comp-item
    expect(queueForecast.totalOriginalSizeBytes).toBe(20000000);
    // Deletion: 10MB (100%), Compression: 6.5MB (65%) -> Total = 16.5MB
    expect(queueForecast.totalEstimatedSavingsBytes).toBe(16500000);
  });

  it('aggregates measured savings after commit against estimate', () => {
    const summary = StorageForecastCalculator.summarizeMeasuredSavings(
      {
        totalRequested: 2,
        succeeded: 2,
        failed: 0,
        denied: 0,
        totalReclaimedBytes: 15000000,
        results: [],
      },
      16500000
    );

    expect(summary.totalReclaimedBytes).toBe(15000000);
    expect(summary.varianceBytes).toBe(-1500000); // 1.5MB less than forecast
    expect(summary.accuracyRatio).toBe(0.91);
  });
});

describe('CloudSyncService (Isolated, Opt-in, Offline-safe)', () => {
  it('is disabled by default and media sync is strictly false', async () => {
    const engine = new DurableStorageEngine();
    const syncService = new CloudSyncService(engine);

    expect(await syncService.isEnabled()).toBe(false);
    const config = await syncService.getConfig();
    expect(config.enabled).toBe(false);
    expect(config.syncMediaFiles).toBe(false);
  });

  it('gracefully declines sync when disabled without error', async () => {
    const engine = new DurableStorageEngine();
    const syncService = new CloudSyncService(engine);

    const result = await syncService.syncSessionMetadata({
      id: 'sess-1',
      mode: 'test',
      startedAt: 1,
      updatedAt: 1,
      status: 'ACTIVE',
      decisions: {},
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('DISABLED');
    }
  });

  it('provides offline fallback when enabled: queues metadata locally', async () => {
    const engine = new DurableStorageEngine();
    const syncService = new CloudSyncService(engine);

    await syncService.enable('GOOGLE_DRIVE');
    expect(await syncService.isEnabled()).toBe(true);

    // Currently offline
    syncService.setOnlineStatus(false);

    const result = await syncService.syncSessionMetadata({
      id: 'sess-offline',
      mode: 'test',
      startedAt: 1,
      updatedAt: 1,
      status: 'ACTIVE',
      decisions: { 'item-1': { mediaId: 'item-1', decision: 'KEEP', decidedAt: 1 } },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('OFFLINE');
    }

    const pending = await syncService.getPendingQueue();
    expect(pending).toContain('sess-offline');
  });

  it('syncs metadata when online and disconnects cleanly', async () => {
    const engine = new DurableStorageEngine();
    const syncService = new CloudSyncService(engine);

    await syncService.enable('GOOGLE_DRIVE', 'user@example.com');
    syncService.setOnlineStatus(true);

    const result = await syncService.syncSessionMetadata({
      id: 'sess-online',
      mode: 'test',
      startedAt: 1,
      updatedAt: 1,
      status: 'ACTIVE',
      decisions: {
        'i1': { mediaId: 'i1', decision: 'DELETE', decidedAt: 1 },
        'i2': { mediaId: 'i2', decision: 'KEEP', decidedAt: 1 },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.itemsSynced).toBe(2);
    }

    // Disconnect removes credentials and pending metadata
    await syncService.disconnect();
    expect(await syncService.isEnabled()).toBe(false);
  });
});
