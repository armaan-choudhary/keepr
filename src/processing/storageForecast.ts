import {
  MediaItem,
  ItemCommitResult,
  BatchCommitSummary,
  TriageDecision,
} from '../platform/contracts';

export interface ItemSavingsForecast {
  mediaId: string;
  originalSizeBytes: number;
  estimatedSavingsBytes: number;
  estimatedOutputSizeBytes: number;
  estimatedSavingsRatio: number;
  basis: string;
}

export interface QueueSavingsForecast {
  totalOriginalSizeBytes: number;
  totalEstimatedSavingsBytes: number;
  estimatedAverageSavingsRatio: number;
  itemCount: number;
  breakdown: ItemSavingsForecast[];
}

export interface MeasuredSavingsSummary {
  totalRequested: number;
  succeeded: number;
  failed: number;
  totalReclaimedBytes: number;
  estimatedSavingsBytes: number;
  varianceBytes: number; // positive = saved more than expected, negative = saved less
  accuracyRatio: number;
}

export class StorageForecastCalculator {
  /**
   * Forecast potential compression savings for a single item based on its size, type, and resolution.
   */
  static estimateCompressionSavings(item: MediaItem): ItemSavingsForecast {
    const size = item.sizeBytes;
    if (size <= 0) {
      return {
        mediaId: item.id,
        originalSizeBytes: 0,
        estimatedSavingsBytes: 0,
        estimatedOutputSizeBytes: 0,
        estimatedSavingsRatio: 0,
        basis: 'Zero-byte item',
      };
    }

    let ratio = 0.35; // baseline conservative 35%
    let basis = 'Standard recompression';

    if (item.mediaType === 'IMAGE') {
      const maxDim = Math.max(item.width ?? 0, item.height ?? 0);

      if (maxDim > 2560) {
        // High resolution downscale + compress
        ratio = 0.65;
        basis = 'Downscaling >2560px with modern codec';
      } else if (size > 5 * 1024 * 1024) {
        // Large image under 2560px
        ratio = 0.5;
        basis = 'Aggressive compression on heavy image';
      } else if (size < 500 * 1024) {
        // Small image
        ratio = 0.15;
        basis = 'Minimal compression on already-small image';
      }
    } else if (item.mediaType === 'VIDEO') {
      const maxDim = Math.max(item.width ?? 0, item.height ?? 0);

      if (maxDim > 1920) {
        // 4K video transcoding to 1080p
        ratio = 0.65;
        basis = 'Downscaling >1080p video to 1080p';
      } else if (size > 50 * 1024 * 1024) {
        ratio = 0.5;
        basis = 'Re-encoding heavy video with efficient bitrate';
      } else if (size < 2 * 1024 * 1024) {
        ratio = 0.1;
        basis = 'Minimal compression on low-size video';
      }
    }

    // Clamp ratio between 0.05 and 0.85
    ratio = Math.max(0.05, Math.min(0.85, ratio));

    const estimatedSavings = Math.round(size * ratio);
    const estimatedOutputSize = size - estimatedSavings;

    return {
      mediaId: item.id,
      originalSizeBytes: size,
      estimatedSavingsBytes: estimatedSavings,
      estimatedOutputSizeBytes: estimatedOutputSize,
      estimatedSavingsRatio: ratio,
      basis,
    };
  }

  /**
   * Forecast potential savings for a queue of items with decisions.
   */
  static forecastQueue(
    itemsWithDecisions: Array<{ item: MediaItem; decision: TriageDecision }>
  ): QueueSavingsForecast {
    let totalOriginal = 0;
    let totalSavings = 0;
    const breakdown: ItemSavingsForecast[] = [];

    for (const { item, decision } of itemsWithDecisions) {
      if (decision === 'KEEP') {
        continue;
      }

      totalOriginal += item.sizeBytes;

      if (decision === 'DELETE') {
        // 100% savings for deletion
        totalSavings += item.sizeBytes;
        breakdown.push({
          mediaId: item.id,
          originalSizeBytes: item.sizeBytes,
          estimatedSavingsBytes: item.sizeBytes,
          estimatedOutputSizeBytes: 0,
          estimatedSavingsRatio: 1.0,
          basis: 'Full deletion',
        });
      } else if (decision === 'COMPRESS') {
        const estimate = this.estimateCompressionSavings(item);
        totalSavings += estimate.estimatedSavingsBytes;
        breakdown.push(estimate);
      }
    }

    const averageRatio =
      totalOriginal > 0 ? Math.round((totalSavings / totalOriginal) * 100) / 100 : 0;

    return {
      totalOriginalSizeBytes: totalOriginal,
      totalEstimatedSavingsBytes: totalSavings,
      estimatedAverageSavingsRatio: averageRatio,
      itemCount: breakdown.length,
      breakdown,
    };
  }

  /**
   * Summarizes measured savings after a batch commit and contrasts with forecast.
   */
  static summarizeMeasuredSavings(
    batchSummary: BatchCommitSummary,
    estimatedSavingsBytes: number
  ): MeasuredSavingsSummary {
    const totalReclaimed = batchSummary.totalReclaimedBytes;
    const variance = totalReclaimed - estimatedSavingsBytes;

    const accuracy =
      estimatedSavingsBytes > 0
        ? Math.round((totalReclaimed / estimatedSavingsBytes) * 100) / 100
        : 1.0;

    return {
      totalRequested: batchSummary.totalRequested,
      succeeded: batchSummary.succeeded,
      failed: batchSummary.failed,
      totalReclaimedBytes: totalReclaimed,
      estimatedSavingsBytes,
      varianceBytes: variance,
      accuracyRatio: accuracy,
    };
  }
}
