import {
  MediaItem,
  CompressionCandidate,
  CompressionOptions,
  ICompressorAdapter,
} from '../platform/contracts';
import { StagedOutputInvalidError } from '../domain/errors';

export interface CompressionValidationResult {
  candidate: CompressionCandidate;
  isValid: boolean;
  rejectionReason?: string;
  measuredSavingsBytes: number;
}

export class CompressionCoordinator {
  private readonly adapter: ICompressorAdapter;

  constructor(adapter: ICompressorAdapter) {
    this.adapter = adapter;
  }

  async processItem(
    item: MediaItem,
    options?: CompressionOptions,
    onProgress?: (progress: number) => void
  ): Promise<CompressionValidationResult> {
    let candidate: CompressionCandidate;

    if (item.mediaType === 'IMAGE') {
      candidate = await this.adapter.compressImage(item, options);
    } else {
      candidate = await this.adapter.compressVideo(item, options, onProgress);
    }

    // Validation 1: Candidate flagged as valid by encoder and nonzero size
    if (!candidate.isValid) {
      await this.safeCleanup(candidate.stagedPath);
      return {
        candidate,
        isValid: false,
        rejectionReason: candidate.error ?? 'Compression candidate failed platform validation',
        measuredSavingsBytes: 0,
      };
    }

    if (candidate.stagedSizeBytes <= 0) {
      await this.safeCleanup(candidate.stagedPath);
      return {
        candidate: {
          ...candidate,
          isValid: false,
          error: 'Staged output has zero size',
        },
        isValid: false,
        rejectionReason: 'Staged output has zero size',
        measuredSavingsBytes: 0,
      };
    }

    // Validation 2: Measured size must be strictly smaller than original
    const measuredSavings = item.sizeBytes - candidate.stagedSizeBytes;
    const isSmaller = measuredSavings > 0;

    if (!isSmaller) {
      // Never replace if output is not smaller!
      await this.safeCleanup(candidate.stagedPath);
      return {
        candidate: {
          ...candidate,
          isSmaller: false,
          measuredSavingsBytes: 0,
          isValid: false,
          error: 'Compressed output is not smaller than original',
        },
        isValid: false,
        rejectionReason: 'Compressed output is not smaller than original',
        measuredSavingsBytes: 0,
      };
    }

    // Valid candidate
    const validatedCandidate: CompressionCandidate = {
      ...candidate,
      isValid: true,
      isSmaller: true,
      measuredSavingsBytes: measuredSavings,
    };

    return {
      candidate: validatedCandidate,
      isValid: true,
      measuredSavingsBytes: measuredSavings,
    };
  }

  async cancel(candidateId: string): Promise<void> {
    await this.adapter.cancel(candidateId);
  }

  async safeCleanup(stagedPath?: string): Promise<void> {
    if (!stagedPath) return;
    try {
      await this.adapter.cleanupStaged(stagedPath);
    } catch {
      // App-owned staging cleanup error - do not crash application
    }
  }
}
