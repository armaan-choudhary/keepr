import {
  MediaType,
  TriageDecision,
  MediaItem,
  MediaAvailability,
  CompressionCandidate,
  ItemCommitResult,
  BatchCommitSummary,
  CommitOutcome,
} from '../platform/contracts';

export type TriageState = 'UNTRIAGED' | 'KEEP' | 'COMPRESS' | 'DELETE';

export interface TriageDecisionRecord {
  mediaId: string;
  decision: TriageDecision;
  decidedAt: number;
  previousDecision?: TriageDecision;
  candidate?: CompressionCandidate;
  estimatedSavingsBytes?: number;
}

export type SessionStatus = 'ACTIVE' | 'PAUSED' | 'COMMITTED' | 'DISCARDED';

export interface TriageSession {
  id: string;
  mode: string;
  startedAt: number;
  updatedAt: number;
  status: SessionStatus;
  decisions: Record<string, TriageDecisionRecord>;
  committedAt?: number;
  totalItemsReviewed?: number;
  estimatedTotalSavingsBytes?: number;
  actualTotalSavingsBytes?: number;
}

export interface CollectionMember {
  assetRef: string;
  mediaId: string;
  addedAt: number;
  isAvailable: boolean;
  availability?: MediaAvailability;
}

export interface KeeprCollection {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  members: CollectionMember[];
  description?: string;
  coverAssetRef?: string;
  isKeeprManaged: true; // distinguishes from system-native albums
}

export type SharedStatus =
  | 'ready'
  | 'processing'
  | 'permissionRequired'
  | 'limitedAccess'
  | 'unavailableOffline'
  | 'needsUserConsent'
  | 'partialSuccess'
  | 'complete'
  | 'failed';

export interface SessionCommitReport {
  sessionId: string;
  totalRequested: number;
  succeeded: number;
  failed: number;
  denied: number;
  uncommitted: number;
  uncommittedCount: number;
  uncommittedMediaIds: string[];
  totalReclaimedBytes: number;
  estimatedSavingsBytes: number;
  varianceBytes: number;
  overallStatus: SharedStatus;
  itemOutcomes: ItemCommitResult[];
}

export type {
  MediaType,
  TriageDecision,
  MediaItem,
  MediaAvailability,
  CompressionCandidate,
  ItemCommitResult,
  BatchCommitSummary,
  CommitOutcome,
};
