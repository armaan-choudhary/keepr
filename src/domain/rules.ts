import { MediaItem, TriageDecision, MediaAvailability } from '../platform/contracts';
import { ValidationFailedError, ProtectedItemError } from './errors';

export function validateMediaItem(item: unknown): asserts item is MediaItem {
  if (!item || typeof item !== 'object') {
    throw new ValidationFailedError('Media item must be a non-null object');
  }

  const candidate = item as Record<string, unknown>;

  if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
    throw new ValidationFailedError('Media item id must be a non-empty string');
  }

  if (typeof candidate.assetRef !== 'string' || candidate.assetRef.trim() === '') {
    throw new ValidationFailedError('Media item assetRef must be a non-empty string');
  }

  if (candidate.mediaType !== 'IMAGE' && candidate.mediaType !== 'VIDEO') {
    throw new ValidationFailedError('Media item mediaType must be IMAGE or VIDEO');
  }

  if (typeof candidate.sizeBytes !== 'number' || isNaN(candidate.sizeBytes) || candidate.sizeBytes < 0) {
    throw new ValidationFailedError('Media item sizeBytes must be a non-negative number');
  }

  if (candidate.capturedAt !== undefined) {
    if (typeof candidate.capturedAt !== 'number' || candidate.capturedAt <= 0) {
      throw new ValidationFailedError('Media item capturedAt must be a positive timestamp');
    }
  }

  if (candidate.durationSeconds !== undefined) {
    if (typeof candidate.durationSeconds !== 'number' || candidate.durationSeconds < 0) {
      throw new ValidationFailedError('Media item durationSeconds must be a non-negative number');
    }
  }
}

export function isItemProtected(item: MediaItem, isExternallyProtected = false): boolean {
  return Boolean(item.isProtected || isExternallyProtected);
}

export function canDeleteItem(item: MediaItem, isExternallyProtected = false): boolean {
  return !isItemProtected(item, isExternallyProtected);
}

export function assertCanDeleteItem(item: MediaItem, isExternallyProtected = false): void {
  if (!canDeleteItem(item, isExternallyProtected)) {
    throw new ProtectedItemError(item.id);
  }
}

export function isAvailableOffline(availability?: MediaAvailability): boolean {
  if (!availability) {
    // Default assumption if not specified is available offline
    return true;
  }
  return availability === 'availableOffline';
}

export interface DecisionLegality {
  allowed: boolean;
  reason?: string;
}

export function checkDecisionLegality(
  decision: TriageDecision,
  item: MediaItem,
  isExternallyProtected = false
): DecisionLegality {
  validateMediaItem(item);

  if (decision === 'DELETE') {
    if (isItemProtected(item, isExternallyProtected)) {
      return {
        allowed: false,
        reason: `Item [${item.id}] is protected and cannot be deleted.`,
      };
    }
  }

  return { allowed: true };
}
