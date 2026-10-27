import { ILocalStorageEngine } from './storageEngine';
import { TriageSession, TriageDecisionRecord, SessionStatus } from '../domain/models';

const SESSION_KEY_PREFIX = 'sessions:';
const ACTIVE_SESSION_KEY = 'sessions:_active';
const SESSION_INDEX_KEY = 'sessions:_index';

export class SessionRepository {
  private readonly storage: ILocalStorageEngine;

  constructor(storage: ILocalStorageEngine) {
    this.storage = storage;
  }

  private async getIndex(): Promise<string[]> {
    const index = await this.storage.get<string[]>(SESSION_INDEX_KEY);
    return index ?? [];
  }

  private async saveIndex(index: string[]): Promise<void> {
    await this.storage.set(SESSION_INDEX_KEY, index);
  }

  async createSession(mode = 'standard'): Promise<TriageSession> {
    const id = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const session: TriageSession = {
      id,
      mode,
      startedAt: now,
      updatedAt: now,
      status: 'ACTIVE',
      decisions: {},
      totalItemsReviewed: 0,
      estimatedTotalSavingsBytes: 0,
    };

    await this.storage.set(`${SESSION_KEY_PREFIX}${id}`, session);
    await this.storage.set(ACTIVE_SESSION_KEY, id);

    const index = await this.getIndex();
    if (!index.includes(id)) {
      index.push(id);
      await this.saveIndex(index);
    }

    return session;
  }

  async saveSession(session: TriageSession): Promise<void> {
    const updated = {
      ...session,
      updatedAt: Date.now(),
    };
    await this.storage.set(`${SESSION_KEY_PREFIX}${session.id}`, updated);
  }

  async getSession(sessionId: string): Promise<TriageSession | null> {
    return this.storage.get<TriageSession>(`${SESSION_KEY_PREFIX}${sessionId}`);
  }

  async getActiveSession(): Promise<TriageSession | null> {
    const activeId = await this.storage.get<string>(ACTIVE_SESSION_KEY);
    if (!activeId) {
      return null;
    }
    const session = await this.getSession(activeId);
    if (!session || session.status === 'COMMITTED' || session.status === 'DISCARDED') {
      return null;
    }
    return session;
  }

  async recordDecision(
    sessionId: string,
    record: TriageDecisionRecord
  ): Promise<TriageSession> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status === 'COMMITTED' || session.status === 'DISCARDED') {
      throw new Error(`Cannot modify a ${session.status} session`);
    }

    const updatedDecisions = {
      ...session.decisions,
      [record.mediaId]: record,
    };

    let estimatedTotal = 0;
    for (const d of Object.values(updatedDecisions)) {
      if (d.estimatedSavingsBytes) {
        estimatedTotal += d.estimatedSavingsBytes;
      }
    }

    const updated: TriageSession = {
      ...session,
      decisions: updatedDecisions,
      totalItemsReviewed: Object.keys(updatedDecisions).length,
      estimatedTotalSavingsBytes: estimatedTotal,
      updatedAt: Date.now(),
    };

    await this.storage.set(`${SESSION_KEY_PREFIX}${sessionId}`, updated);
    return updated;
  }

  async removeDecision(sessionId: string, mediaId: string): Promise<TriageSession> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const updatedDecisions = { ...session.decisions };
    delete updatedDecisions[mediaId];

    let estimatedTotal = 0;
    for (const d of Object.values(updatedDecisions)) {
      if (d.estimatedSavingsBytes) {
        estimatedTotal += d.estimatedSavingsBytes;
      }
    }

    const updated: TriageSession = {
      ...session,
      decisions: updatedDecisions,
      totalItemsReviewed: Object.keys(updatedDecisions).length,
      estimatedTotalSavingsBytes: estimatedTotal,
      updatedAt: Date.now(),
    };

    await this.storage.set(`${SESSION_KEY_PREFIX}${sessionId}`, updated);
    return updated;
  }

  async discardSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      const updated: TriageSession = {
        ...session,
        status: 'DISCARDED',
        updatedAt: Date.now(),
      };
      await this.storage.set(`${SESSION_KEY_PREFIX}${sessionId}`, updated);
    }

    const activeId = await this.storage.get<string>(ACTIVE_SESSION_KEY);
    if (activeId === sessionId) {
      await this.storage.remove(ACTIVE_SESSION_KEY);
    }
  }

  async completeSession(
    sessionId: string,
    actualSavingsBytes?: number
  ): Promise<TriageSession> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const now = Date.now();
    const updated: TriageSession = {
      ...session,
      status: 'COMMITTED',
      committedAt: now,
      updatedAt: now,
      actualTotalSavingsBytes: actualSavingsBytes ?? session.estimatedTotalSavingsBytes,
    };

    await this.storage.set(`${SESSION_KEY_PREFIX}${sessionId}`, updated);

    const activeId = await this.storage.get<string>(ACTIVE_SESSION_KEY);
    if (activeId === sessionId) {
      await this.storage.remove(ACTIVE_SESSION_KEY);
    }

    return updated;
  }

  async getUncommittedDecisions(sessionId: string): Promise<TriageDecisionRecord[]> {
    const session = await this.getSession(sessionId);
    if (!session || session.status === 'COMMITTED' || session.status === 'DISCARDED') {
      return [];
    }
    return Object.values(session.decisions);
  }

  async listSessions(): Promise<TriageSession[]> {
    const index = await this.getIndex();
    const sessions: TriageSession[] = [];
    for (const id of index) {
      const sess = await this.getSession(id);
      if (sess) {
        sessions.push(sess);
      }
    }
    return sessions;
  }
}
