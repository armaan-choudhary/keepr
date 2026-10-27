import {
  CommitOutcome,
  BatchCommitSummary,
  ItemCommitResult,
} from '../platform/contracts';
import {
  SharedStatus,
  SessionCommitReport,
  TriageSession,
  TriageDecisionRecord,
} from './models';

export function mapCommitOutcomeToSharedStatus(outcome: CommitOutcome): SharedStatus {
  switch (outcome) {
    case 'KEPT':
    case 'TRASHED':
    case 'PERMANENTLY_DELETED':
    case 'REPLACED':
    case 'RECENTLY_DELETED':
      return 'complete';
    case 'DENIED':
      return 'needsUserConsent';
    case 'FAILED':
      return 'failed';
    case 'SKIPPED':
      return 'ready';
    default:
      return 'complete';
  }
}

export function mapBatchSummaryToSharedStatus(summary: BatchCommitSummary): SharedStatus {
  if (summary.totalRequested === 0) {
    return 'complete';
  }

  if (summary.failed > 0 && summary.succeeded === 0) {
    return 'failed';
  }

  if (summary.denied > 0 && summary.succeeded === 0) {
    return 'needsUserConsent';
  }

  if (summary.succeeded === summary.totalRequested) {
    return 'complete';
  }

  if (summary.succeeded > 0 && (summary.failed > 0 || summary.denied > 0)) {
    return 'partialSuccess';
  }

  return 'complete';
}

export function calculateSavingsDifference(
  estimatedBytes: number,
  measuredBytes: number
): {
  varianceBytes: number;
  percentageDifference: number;
} {
  const varianceBytes = measuredBytes - estimatedBytes;
  const percentageDifference =
    estimatedBytes > 0
      ? Math.round(((measuredBytes - estimatedBytes) / estimatedBytes) * 100)
      : 0;

  return {
    varianceBytes,
    percentageDifference,
  };
}

export function summarizeSessionCommit(
  session: TriageSession,
  summary: BatchCommitSummary
): SessionCommitReport {
  let estimatedTotal = 0;
  for (const record of Object.values(session.decisions)) {
    if (record.decision === 'COMPRESS') {
      estimatedTotal += record.candidate?.estimatedSavingsBytes ?? 0;
    } else if (record.decision === 'DELETE') {
      // In delete, the estimated savings is the original size if available
      estimatedTotal += record.estimatedSavingsBytes ?? 0;
    }
  }

  const { varianceBytes } = calculateSavingsDifference(
    estimatedTotal,
    summary.totalReclaimedBytes
  );

  const deniedMediaIds = (summary.results || [])
    .filter((r) => r.outcome === 'DENIED')
    .map((r) => r.mediaId);

  const deniedCount = Math.max(summary.denied ?? 0, deniedMediaIds.length);

  return {
    sessionId: session.id,
    totalRequested: summary.totalRequested,
    succeeded: summary.succeeded,
    failed: summary.failed,
    denied: deniedCount,
    uncommitted: deniedCount,
    uncommittedCount: deniedCount,
    uncommittedMediaIds: deniedMediaIds,
    totalReclaimedBytes: summary.totalReclaimedBytes,
    estimatedSavingsBytes: estimatedTotal,
    varianceBytes,
    overallStatus: mapBatchSummaryToSharedStatus(summary),
    itemOutcomes: summary.results,
  };
}

/**
 * Extracts decision records for items that were denied/uncommitted during checkout,
 * allowing the user to retry or adjust their decisions.
 */
export function getUncommittedDecisions(
  session: TriageSession,
  report: SessionCommitReport
): TriageDecisionRecord[] {
  const deniedIds = new Set(
    report.uncommittedMediaIds && report.uncommittedMediaIds.length > 0
      ? report.uncommittedMediaIds
      : (report.itemOutcomes || [])
          .filter((item) => item.outcome === 'DENIED')
          .map((item) => item.mediaId)
  );

  return Object.values(session.decisions).filter((decision) =>
    deniedIds.has(decision.mediaId)
  );
}
