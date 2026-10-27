import {
  MediaItem,
  TriageDecision,
  BoundedUndoManager,
  TriageStateMachine,
  validateMediaItem,
  canDeleteItem,
  assertCanDeleteItem,
  checkDecisionLegality,
  isAvailableOffline,
  ProtectedItemError,
  ValidationFailedError,
  mapCommitOutcomeToSharedStatus,
  mapBatchSummaryToSharedStatus,
  calculateSavingsDifference,
  summarizeSessionCommit,
  getUncommittedDecisions,
  TriageSession,
  BatchCommitSummary,
} from '../../src/domain';

describe('Domain Rules & Validation', () => {
  const validItem: MediaItem = {
    id: 'item-1',
    assetRef: 'ph://asset-1',
    mediaType: 'IMAGE',
    sizeBytes: 1024000,
    capturedAt: 1700000000000,
    width: 1920,
    height: 1080,
  };

  it('validates a correct media item without error', () => {
    expect(() => validateMediaItem(validItem)).not.toThrow();
  });

  it('throws ValidationFailedError on missing or invalid fields', () => {
    expect(() => validateMediaItem(null)).toThrow(ValidationFailedError);
    expect(() => validateMediaItem({})).toThrow(ValidationFailedError);
    expect(() => validateMediaItem({ ...validItem, id: '' })).toThrow(ValidationFailedError);
    expect(() => validateMediaItem({ ...validItem, assetRef: '   ' })).toThrow(ValidationFailedError);
    expect(() => validateMediaItem({ ...validItem, mediaType: 'AUDIO' as any })).toThrow(
      ValidationFailedError
    );
    expect(() => validateMediaItem({ ...validItem, sizeBytes: -50 })).toThrow(
      ValidationFailedError
    );
    expect(() => validateMediaItem({ ...validItem, capturedAt: -100 })).toThrow(
      ValidationFailedError
    );
    expect(() => validateMediaItem({ ...validItem, durationSeconds: -1 })).toThrow(
      ValidationFailedError
    );
  });

  it('prohibits deletion for protected items', () => {
    const protectedItem: MediaItem = { ...validItem, isProtected: true };
    expect(canDeleteItem(protectedItem)).toBe(false);
    expect(() => assertCanDeleteItem(protectedItem)).toThrow(ProtectedItemError);

    // Can delete normal item
    expect(canDeleteItem(validItem)).toBe(true);
    expect(() => assertCanDeleteItem(validItem)).not.toThrow();

    // Check with external protection flag
    expect(canDeleteItem(validItem, true)).toBe(false);
  });

  it('checks decision legality correctly', () => {
    const protectedItem: MediaItem = { ...validItem, isProtected: true };

    const deleteProtected = checkDecisionLegality('DELETE', protectedItem);
    expect(deleteProtected.allowed).toBe(false);
    expect(deleteProtected.reason).toContain('is protected');

    const keepProtected = checkDecisionLegality('KEEP', protectedItem);
    expect(keepProtected.allowed).toBe(true);

    const deleteNormal = checkDecisionLegality('DELETE', validItem);
    expect(deleteNormal.allowed).toBe(true);
  });

  it('identifies offline availability correctly', () => {
    expect(isAvailableOffline('availableOffline')).toBe(true);
    expect(isAvailableOffline(undefined)).toBe(true);
    expect(isAvailableOffline('requiresNetwork')).toBe(false);
    expect(isAvailableOffline('assetMissing')).toBe(false);
    expect(isAvailableOffline('permissionRevoked')).toBe(false);
  });
});

describe('Bounded 10-Item Undo Manager', () => {
  it('enforces LIFO popping and tracks canUndo', () => {
    const undoManager = new BoundedUndoManager(10);
    expect(undoManager.canUndo()).toBe(false);
    expect(undoManager.count()).toBe(0);

    undoManager.push({
      id: 'e1',
      mediaId: 'item-1',
      newDecision: 'KEEP',
      timestamp: 100,
    });
    undoManager.push({
      id: 'e2',
      mediaId: 'item-2',
      newDecision: 'DELETE',
      timestamp: 200,
    });

    expect(undoManager.canUndo()).toBe(true);
    expect(undoManager.count()).toBe(2);
    expect(undoManager.peek()?.mediaId).toBe('item-2');

    const popped = undoManager.pop();
    expect(popped?.mediaId).toBe('item-2');
    expect(undoManager.count()).toBe(1);

    const popped2 = undoManager.pop();
    expect(popped2?.mediaId).toBe('item-1');
    expect(undoManager.count()).toBe(0);
    expect(undoManager.canUndo()).toBe(false);
  });

  it('bounds capacity strictly to 10 items, evicting oldest item when 11th is pushed', () => {
    const undoManager = new BoundedUndoManager(10);

    // Push 10 items
    for (let i = 1; i <= 10; i++) {
      undoManager.push({
        id: `e${i}`,
        mediaId: `item-${i}`,
        newDecision: 'KEEP',
        timestamp: i * 100,
      });
    }

    expect(undoManager.count()).toBe(10);
    expect(undoManager.getHistory()[0].mediaId).toBe('item-1');
    expect(undoManager.getHistory()[9].mediaId).toBe('item-10');

    // Push 11th item
    undoManager.push({
      id: 'e11',
      mediaId: 'item-11',
      newDecision: 'DELETE',
      timestamp: 1100,
    });

    // Count is still bounded at 10
    expect(undoManager.count()).toBe(10);
    // Oldest item-1 was evicted
    expect(undoManager.getHistory()[0].mediaId).toBe('item-2');
    expect(undoManager.peek()?.mediaId).toBe('item-11');

    // Push 4 more items (total 15 pushed)
    for (let i = 12; i <= 15; i++) {
      undoManager.push({
        id: `e${i}`,
        mediaId: `item-${i}`,
        newDecision: 'COMPRESS',
        timestamp: i * 100,
      });
    }

    expect(undoManager.count()).toBe(10);
    // History should contain item-6 through item-15
    const history = undoManager.getHistory();
    expect(history[0].mediaId).toBe('item-6');
    expect(history[9].mediaId).toBe('item-15');
  });

  it('clears all history on clear()', () => {
    const undoManager = new BoundedUndoManager(10);
    undoManager.push({
      id: 'e1',
      mediaId: 'item-1',
      newDecision: 'KEEP',
      timestamp: 100,
    });
    undoManager.clear();
    expect(undoManager.count()).toBe(0);
    expect(undoManager.canUndo()).toBe(false);
  });
});

describe('Decision State Machine', () => {
  const item1: MediaItem = {
    id: 'm-1',
    assetRef: 'ph://m-1',
    mediaType: 'IMAGE',
    sizeBytes: 2000,
  };
  const item2: MediaItem = {
    id: 'm-2',
    assetRef: 'ph://m-2',
    mediaType: 'IMAGE',
    sizeBytes: 5000,
  };
  const protectedItem: MediaItem = {
    id: 'm-p',
    assetRef: 'ph://m-p',
    mediaType: 'IMAGE',
    sizeBytes: 3000,
    isProtected: true,
  };

  it('initializes empty and correctly applies decisions', () => {
    const sm = new TriageStateMachine();
    expect(sm.getCounts()).toEqual({ keep: 0, compress: 0, delete: 0, total: 0 });

    sm.applyDecision(item1, 'KEEP');
    sm.applyDecision(item2, 'DELETE');

    expect(sm.getDecision('m-1')?.decision).toBe('KEEP');
    expect(sm.getDecision('m-2')?.decision).toBe('DELETE');
    expect(sm.getCounts()).toEqual({ keep: 1, compress: 0, delete: 1, total: 2 });
  });

  it('prevents DELETE on protected items', () => {
    const sm = new TriageStateMachine();
    expect(() => sm.applyDecision(protectedItem, 'DELETE')).toThrow(ProtectedItemError);
    // KEEP is allowed
    expect(() => sm.applyDecision(protectedItem, 'KEEP')).not.toThrow();
  });

  it('respects external protection checker', () => {
    const protectedIds = new Set(['m-1']);
    const sm = new TriageStateMachine({
      protectionChecker: (id) => protectedIds.has(id),
    });

    expect(() => sm.applyDecision(item1, 'DELETE')).toThrow(ProtectedItemError);
    expect(() => sm.applyDecision(item2, 'DELETE')).not.toThrow();
  });

  it('undo reverts to untriaged or previous decision', () => {
    const sm = new TriageStateMachine();

    // Decision 1: KEEP m-1
    sm.applyDecision(item1, 'KEEP');
    expect(sm.getDecision('m-1')?.decision).toBe('KEEP');

    // Undo decision 1 -> becomes untriaged
    sm.undo();
    expect(sm.getDecision('m-1')).toBeUndefined();
    expect(sm.getCounts().total).toBe(0);

    // Decision 2: KEEP m-1, then change to COMPRESS m-1
    sm.applyDecision(item1, 'KEEP');
    sm.applyDecision(item1, 'COMPRESS');
    expect(sm.getDecision('m-1')?.decision).toBe('COMPRESS');

    // Undo -> reverts to KEEP
    sm.undo();
    expect(sm.getDecision('m-1')?.decision).toBe('KEEP');
  });

  it('resets decision and allows loading batch decisions', () => {
    const sm = new TriageStateMachine();
    sm.applyDecision(item1, 'KEEP');
    sm.resetDecision('m-1');
    expect(sm.getDecision('m-1')).toBeUndefined();

    sm.loadDecisions([
      { mediaId: 'm-1', decision: 'DELETE', decidedAt: Date.now() },
      { mediaId: 'm-2', decision: 'COMPRESS', decidedAt: Date.now() },
    ]);
    expect(sm.getCounts()).toEqual({ keep: 0, compress: 1, delete: 1, total: 2 });
  });
});

describe('Result Mapping & Diagnostics', () => {
  it('maps individual commit outcomes to SharedStatus', () => {
    expect(mapCommitOutcomeToSharedStatus('KEPT')).toBe('complete');
    expect(mapCommitOutcomeToSharedStatus('TRASHED')).toBe('complete');
    expect(mapCommitOutcomeToSharedStatus('PERMANENTLY_DELETED')).toBe('complete');
    expect(mapCommitOutcomeToSharedStatus('REPLACED')).toBe('complete');
    expect(mapCommitOutcomeToSharedStatus('RECENTLY_DELETED')).toBe('complete');
    expect(mapCommitOutcomeToSharedStatus('DENIED')).toBe('needsUserConsent');
    expect(mapCommitOutcomeToSharedStatus('FAILED')).toBe('failed');
    expect(mapCommitOutcomeToSharedStatus('SKIPPED')).toBe('ready');
  });

  it('maps batch commit summaries to SharedStatus accurately', () => {
    const completeSummary: BatchCommitSummary = {
      totalRequested: 5,
      succeeded: 5,
      failed: 0,
      denied: 0,
      totalReclaimedBytes: 10000,
      results: [],
    };
    expect(mapBatchSummaryToSharedStatus(completeSummary)).toBe('complete');

    const partialSummary: BatchCommitSummary = {
      totalRequested: 5,
      succeeded: 3,
      failed: 2,
      denied: 0,
      totalReclaimedBytes: 6000,
      results: [],
    };
    expect(mapBatchSummaryToSharedStatus(partialSummary)).toBe('partialSuccess');

    const failedSummary: BatchCommitSummary = {
      totalRequested: 3,
      succeeded: 0,
      failed: 3,
      denied: 0,
      totalReclaimedBytes: 0,
      results: [],
    };
    expect(mapBatchSummaryToSharedStatus(failedSummary)).toBe('failed');

    const deniedSummary: BatchCommitSummary = {
      totalRequested: 2,
      succeeded: 0,
      failed: 0,
      denied: 2,
      totalReclaimedBytes: 0,
      results: [],
    };
    expect(mapBatchSummaryToSharedStatus(deniedSummary)).toBe('needsUserConsent');
  });

  it('calculates savings variance and percentage difference', () => {
    const res1 = calculateSavingsDifference(1000, 1200);
    expect(res1.varianceBytes).toBe(200);
    expect(res1.percentageDifference).toBe(20);

    const res2 = calculateSavingsDifference(1000, 800);
    expect(res2.varianceBytes).toBe(-200);
    expect(res2.percentageDifference).toBe(-20);
  });

  it('summarizes session commits with estimates and outcomes', () => {
    const session: TriageSession = {
      id: 'sess-test',
      mode: 'standard',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'ACTIVE',
      decisions: {
        'item-1': {
          mediaId: 'item-1',
          decision: 'DELETE',
          decidedAt: Date.now(),
          estimatedSavingsBytes: 5000,
        },
        'item-2': {
          mediaId: 'item-2',
          decision: 'COMPRESS',
          decidedAt: Date.now(),
          candidate: {
            originalId: 'item-2',
            stagedPath: '/path/staged',
            stagedSizeBytes: 1000,
            originalSizeBytes: 4000,
            estimatedSavingsBytes: 3000,
            measuredSavingsBytes: 3000,
            width: 1000,
            height: 1000,
            mimeType: 'image/jpeg',
            isSmaller: true,
            isValid: true,
          },
        },
      },
    };

    const batchSummary: BatchCommitSummary = {
      totalRequested: 2,
      succeeded: 2,
      failed: 0,
      denied: 0,
      totalReclaimedBytes: 7800,
      results: [
        {
          mediaId: 'item-1',
          decision: 'DELETE',
          outcome: 'TRASHED',
          reclaimedBytes: 4900,
        },
        {
          mediaId: 'item-2',
          decision: 'COMPRESS',
          outcome: 'REPLACED',
          reclaimedBytes: 2900,
        },
      ],
    };

    const report = summarizeSessionCommit(session, batchSummary);
    expect(report.sessionId).toBe('sess-test');
    expect(report.estimatedSavingsBytes).toBe(8000);
    expect(report.totalReclaimedBytes).toBe(7800);
    expect(report.varianceBytes).toBe(-200);
    expect(report.overallStatus).toBe('complete');
    expect(report.uncommitted).toBe(0);
    expect(report.uncommittedCount).toBe(0);
    expect(report.uncommittedMediaIds).toEqual([]);
  });

  it('accurately counts denied items as uncommitted and supports retrying decisions', () => {
    const session: TriageSession = {
      id: 'sess-denied',
      mode: 'standard',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'ACTIVE',
      decisions: {
        'item-del': {
          mediaId: 'item-del',
          decision: 'DELETE',
          decidedAt: Date.now(),
          estimatedSavingsBytes: 50000,
        },
        'item-cmp': {
          mediaId: 'item-cmp',
          decision: 'COMPRESS',
          decidedAt: Date.now(),
          estimatedSavingsBytes: 20000,
        },
        'item-ok': {
          mediaId: 'item-ok',
          decision: 'KEEP',
          decidedAt: Date.now(),
        },
      },
    };

    const batchSummary: BatchCommitSummary = {
      totalRequested: 3,
      succeeded: 1,
      failed: 0,
      denied: 2,
      totalReclaimedBytes: 0,
      results: [
        {
          mediaId: 'item-del',
          decision: 'DELETE',
          outcome: 'DENIED',
          reclaimedBytes: 0,
          error: 'User denied OS permission dialog',
        },
        {
          mediaId: 'item-cmp',
          decision: 'COMPRESS',
          outcome: 'DENIED',
          reclaimedBytes: 0,
          error: 'User denied OS permission dialog',
        },
        {
          mediaId: 'item-ok',
          decision: 'KEEP',
          outcome: 'KEPT',
          reclaimedBytes: 0,
        },
      ],
    };

    const report = summarizeSessionCommit(session, batchSummary);
    expect(report.sessionId).toBe('sess-denied');
    expect(report.totalRequested).toBe(3);
    expect(report.succeeded).toBe(1);
    expect(report.denied).toBe(2);
    // Accurately counts denied items as uncommitted
    expect(report.uncommitted).toBe(2);
    expect(report.uncommittedCount).toBe(2);
    expect(report.uncommittedMediaIds).toEqual(['item-del', 'item-cmp']);
    expect(report.overallStatus).toBe('partialSuccess');

    // Extract uncommitted decisions for retry / adjustment
    const uncommittedDecisions = getUncommittedDecisions(session, report);
    expect(uncommittedDecisions).toHaveLength(2);
    expect(uncommittedDecisions.map((d) => d.mediaId).sort()).toEqual(['item-cmp', 'item-del']);
  });

  it('sanitizes domain error diagnostics without leaking private info', () => {
    const err = new ProtectedItemError('item-xyz', 'op-456');
    const diag = err.toSafeDiagnostic();
    expect(diag.code).toBe('PROTECTED_ITEM');
    expect(diag.operationId).toBe('op-456');
    expect(diag.message).toContain('item-xyz');
  });
});
