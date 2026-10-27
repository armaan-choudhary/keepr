import { MediaItem, TriageDecision, CompressionCandidate } from '../platform/contracts';
import { TriageDecisionRecord } from './models';
import { ProtectedItemError, InvalidDecisionError } from './errors';
import { isItemProtected, validateMediaItem } from './rules';
import { BoundedUndoManager, UndoEntry } from './undoManager';

export interface DecisionCounts {
  keep: number;
  compress: number;
  delete: number;
  total: number;
}

export interface StateMachineOptions {
  undoCapacity?: number;
  protectionChecker?: (mediaId: string) => boolean;
}

export class TriageStateMachine {
  private readonly decisions: Map<string, TriageDecisionRecord> = new Map();
  private readonly undoManager: BoundedUndoManager;
  private readonly protectionChecker?: (mediaId: string) => boolean;

  constructor(options?: StateMachineOptions) {
    this.undoManager = new BoundedUndoManager(options?.undoCapacity ?? 10);
    this.protectionChecker = options?.protectionChecker;
  }

  public getUndoManager(): BoundedUndoManager {
    return this.undoManager;
  }

  public getDecision(mediaId: string): TriageDecisionRecord | undefined {
    return this.decisions.get(mediaId);
  }

  public getAllDecisions(): TriageDecisionRecord[] {
    return Array.from(this.decisions.values());
  }

  public getCounts(): DecisionCounts {
    let keep = 0;
    let compress = 0;
    let del = 0;

    for (const record of this.decisions.values()) {
      if (record.decision === 'KEEP') keep++;
      else if (record.decision === 'COMPRESS') compress++;
      else if (record.decision === 'DELETE') del++;
    }

    return {
      keep,
      compress,
      delete: del,
      total: this.decisions.size,
    };
  }

  public applyDecision(
    item: MediaItem,
    decision: TriageDecision,
    candidate?: CompressionCandidate
  ): TriageDecisionRecord {
    validateMediaItem(item);

    const isProtected =
      isItemProtected(item) ||
      (this.protectionChecker ? this.protectionChecker(item.id) : false);

    if (decision === 'DELETE' && isProtected) {
      throw new ProtectedItemError(item.id);
    }

    const previousRecord = this.decisions.get(item.id);
    const previousDecision = previousRecord?.decision;

    const now = Date.now();
    const newRecord: TriageDecisionRecord = {
      mediaId: item.id,
      decision,
      decidedAt: now,
      previousDecision,
      candidate,
      estimatedSavingsBytes: candidate?.estimatedSavingsBytes,
    };

    this.decisions.set(item.id, newRecord);

    const undoEntry: UndoEntry = {
      id: `${item.id}-${now}`,
      mediaId: item.id,
      previousDecision,
      newDecision: decision,
      timestamp: now,
      candidate,
      estimatedSavingsBytes: candidate?.estimatedSavingsBytes,
    };
    this.undoManager.push(undoEntry);

    return newRecord;
  }

  public undo(): UndoEntry | undefined {
    const entry = this.undoManager.pop();
    if (!entry) {
      return undefined;
    }

    if (entry.previousDecision) {
      // Revert to previous decision
      this.decisions.set(entry.mediaId, {
        mediaId: entry.mediaId,
        decision: entry.previousDecision,
        decidedAt: Date.now(),
      });
    } else {
      // Reverted to untriaged
      this.decisions.delete(entry.mediaId);
    }

    return entry;
  }

  public resetDecision(mediaId: string): void {
    const existing = this.decisions.get(mediaId);
    if (!existing) {
      return;
    }

    this.decisions.delete(mediaId);
    // Push a reset onto undo manager so the reset itself can be undone if desired
    this.undoManager.push({
      id: `reset-${mediaId}-${Date.now()}`,
      mediaId,
      previousDecision: existing.decision,
      newDecision: 'KEEP', // default fallback marker or could be represented
      timestamp: Date.now(),
    });
  }

  public clear(clearUndo = true): void {
    this.decisions.clear();
    if (clearUndo) {
      this.undoManager.clear();
    }
  }

  public loadDecisions(records: TriageDecisionRecord[]): void {
    this.decisions.clear();
    for (const record of records) {
      this.decisions.set(record.mediaId, record);
    }
  }
}
