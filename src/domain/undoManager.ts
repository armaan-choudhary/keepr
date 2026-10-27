import { TriageDecision } from '../platform/contracts';
import { CompressionCandidate } from '../platform/contracts';

export interface UndoEntry {
  id: string;
  mediaId: string;
  previousDecision?: TriageDecision;
  newDecision: TriageDecision;
  timestamp: number;
  candidate?: CompressionCandidate;
  estimatedSavingsBytes?: number;
}

export class BoundedUndoManager {
  private readonly maxCapacity: number;
  private readonly stack: UndoEntry[] = [];

  constructor(maxCapacity = 10) {
    if (maxCapacity <= 0) {
      throw new Error('UndoManager capacity must be greater than zero');
    }
    this.maxCapacity = maxCapacity;
  }

  public push(entry: UndoEntry): void {
    if (this.stack.length >= this.maxCapacity) {
      // Evict oldest (bottom of stack)
      this.stack.shift();
    }
    this.stack.push(entry);
  }

  public pop(): UndoEntry | undefined {
    return this.stack.pop();
  }

  public peek(): UndoEntry | undefined {
    if (this.stack.length === 0) {
      return undefined;
    }
    return this.stack[this.stack.length - 1];
  }

  public canUndo(): boolean {
    return this.stack.length > 0;
  }

  public count(): number {
    return this.stack.length;
  }

  public getCapacity(): number {
    return this.maxCapacity;
  }

  public clear(): void {
    this.stack.length = 0;
  }

  public getHistory(): readonly UndoEntry[] {
    return [...this.stack];
  }
}
