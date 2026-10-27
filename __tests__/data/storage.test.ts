import {
  DurableStorageEngine,
  InMemoryStorageAdapter,
  ProtectionRegistry,
  CollectionsRepository,
  SessionRepository,
  PendingJobQueue,
} from '../../src/data';
import { TriageDecisionRecord } from '../../src/domain';

describe('DurableStorageEngine', () => {
  it('performs basic CRUD operations with key serialization', async () => {
    const engine = new DurableStorageEngine();

    expect(await engine.get('key1')).toBeNull();

    await engine.set('key1', { hello: 'world', count: 42 });
    const retrieved = await engine.get<{ hello: string; count: number }>('key1');
    expect(retrieved).toEqual({ hello: 'world', count: 42 });

    await engine.remove('key1');
    expect(await engine.get('key1')).toBeNull();
  });

  it('supports prefix queries and getAll', async () => {
    const engine = new DurableStorageEngine();

    await engine.set('user:1', { name: 'Alice' });
    await engine.set('user:2', { name: 'Bob' });
    await engine.set('settings:theme', 'dark');

    const userKeys = await engine.keys('user:');
    expect(userKeys.sort()).toEqual(['user:1', 'user:2']);

    const users = await engine.getAll<{ name: string }>('user:');
    expect(users.size).toBe(2);
    expect(users.get('user:1')).toEqual({ name: 'Alice' });

    await engine.clear();
    expect(await engine.keys()).toEqual([]);
  });

  it('handles invalid JSON gracefully without throwing', async () => {
    const adapter = new InMemoryStorageAdapter();
    await adapter.write('corrupt_key', '{not_valid_json');
    const engine = new DurableStorageEngine(adapter);

    const val = await engine.get('corrupt_key');
    expect(val).toBeNull();
  });
});

describe('ProtectionRegistry', () => {
  it('protects, checks, and unprotects items with cross-platform persistence', async () => {
    const adapter = new InMemoryStorageAdapter();
    const engine = new DurableStorageEngine(adapter);
    const registry = new ProtectionRegistry(engine);

    expect(await registry.isProtected('item-1')).toBe(false);

    await registry.protect('item-1');
    expect(await registry.isProtected('item-1')).toBe(true);

    const protectedIds = await registry.getProtectedIds();
    expect(protectedIds.has('item-1')).toBe(true);

    // Verify durability by creating a new instance on same storage
    const newRegistryInstance = new ProtectionRegistry(new DurableStorageEngine(adapter));
    expect(await newRegistryInstance.isProtected('item-1')).toBe(true);

    await registry.unprotect('item-1');
    expect(await registry.isProtected('item-1')).toBe(false);
  });

  it('handles batch protection updates', async () => {
    const engine = new DurableStorageEngine();
    const registry = new ProtectionRegistry(engine);

    await registry.batchSetProtection([
      { mediaId: 'item-a', isProtected: true },
      { mediaId: 'item-b', isProtected: true },
      { mediaId: 'item-c', isProtected: false },
    ]);

    expect(await registry.isProtected('item-a')).toBe(true);
    expect(await registry.isProtected('item-b')).toBe(true);
    expect(await registry.isProtected('item-c')).toBe(false);

    await registry.clear();
    expect((await registry.getProtectedIds()).size).toBe(0);
  });
});

describe('CollectionsRepository', () => {
  it('creates, lists, updates, and deletes Keepr collections', async () => {
    const engine = new DurableStorageEngine();
    const repo = new CollectionsRepository(engine);

    const coll = await repo.createCollection('Summer Trip', 'Holiday photos');
    expect(coll.name).toBe('Summer Trip');
    expect(coll.isKeeprManaged).toBe(true);
    expect(coll.members).toEqual([]);

    const retrieved = await repo.getCollection(coll.id);
    expect(retrieved?.id).toBe(coll.id);

    const updated = await repo.updateCollection(coll.id, { name: 'Summer Trip 2026' });
    expect(updated.name).toBe('Summer Trip 2026');

    const list = await repo.listCollections();
    expect(list.length).toBe(1);

    const deleted = await repo.deleteCollection(coll.id);
    expect(deleted).toBe(true);
    expect(await repo.getCollection(coll.id)).toBeNull();
  });

  it('adds and removes items with opaque asset references', async () => {
    const engine = new DurableStorageEngine();
    const repo = new CollectionsRepository(engine);

    const coll = await repo.createCollection('Favorites');
    const withItems = await repo.addItems(coll.id, [
      { mediaId: 'med-1', assetRef: 'ph://med-1' },
      { mediaId: 'med-2', assetRef: 'content://media/external/images/media/2' },
    ]);

    expect(withItems.members.length).toBe(2);
    expect(withItems.members[0].mediaId).toBe('med-1');
    expect(withItems.members[0].isAvailable).toBe(true);

    const afterRemove = await repo.removeItems(coll.id, ['med-1']);
    expect(afterRemove.members.length).toBe(1);
    expect(afterRemove.members[0].mediaId).toBe('med-2');
  });

  it('CRITICAL: preserves unavailable items without silently deleting them', async () => {
    const engine = new DurableStorageEngine();
    const repo = new CollectionsRepository(engine);

    const coll1 = await repo.createCollection('Trip 1');
    const coll2 = await repo.createCollection('Trip 2');

    await repo.addItems(coll1.id, [
      { mediaId: 'item-missing', assetRef: 'ph://missing' },
      { mediaId: 'item-staying', assetRef: 'ph://staying' },
    ]);

    await repo.addItems(coll2.id, [
      { mediaId: 'item-missing', assetRef: 'ph://missing' },
    ]);

    // An asset becomes missing or unavailable offline
    await repo.preserveUnavailableItem('item-missing', 'assetMissing');

    // Verify coll1 still has both items, and the missing one is preserved with isAvailable: false
    const updatedColl1 = await repo.getCollection(coll1.id);
    expect(updatedColl1?.members.length).toBe(2);
    const preservedItem1 = updatedColl1?.members.find((m) => m.mediaId === 'item-missing');
    expect(preservedItem1).toBeDefined();
    expect(preservedItem1?.isAvailable).toBe(false);
    expect(preservedItem1?.availability).toBe('assetMissing');

    // Verify coll2 still has the item preserved
    const updatedColl2 = await repo.getCollection(coll2.id);
    expect(updatedColl2?.members.length).toBe(1);
    expect(updatedColl2?.members[0].isAvailable).toBe(false);
    expect(updatedColl2?.members[0].availability).toBe('assetMissing');
  });
});

describe('SessionRepository', () => {
  it('creates sessions, records decisions, and recovers active sessions after interruption', async () => {
    const engine = new DurableStorageEngine();
    const repo = new SessionRepository(engine);

    const session = await repo.createSession('burst_mode');
    expect(session.status).toBe('ACTIVE');

    const dec1: TriageDecisionRecord = {
      mediaId: 'm-1',
      decision: 'KEEP',
      decidedAt: Date.now(),
    };
    const dec2: TriageDecisionRecord = {
      mediaId: 'm-2',
      decision: 'DELETE',
      decidedAt: Date.now(),
      estimatedSavingsBytes: 5000000,
    };

    await repo.recordDecision(session.id, dec1);
    const updatedSession = await repo.recordDecision(session.id, dec2);

    expect(updatedSession.totalItemsReviewed).toBe(2);
    expect(updatedSession.estimatedTotalSavingsBytes).toBe(5000000);

    // Simulate app restart / interruption: recovering the active session
    const active = await repo.getActiveSession();
    expect(active).not.toBeNull();
    expect(active?.id).toBe(session.id);
    expect(active?.status).toBe('ACTIVE');
    expect(active?.decisions['m-2'].decision).toBe('DELETE');

    // Verify uncommitted decisions retrieval
    const uncommitted = await repo.getUncommittedDecisions(session.id);
    expect(uncommitted.length).toBe(2);
  });

  it('safely discards interrupted sessions', async () => {
    const engine = new DurableStorageEngine();
    const repo = new SessionRepository(engine);

    const session = await repo.createSession();
    await repo.discardSession(session.id);

    const retrieved = await repo.getSession(session.id);
    expect(retrieved?.status).toBe('DISCARDED');

    // Active session pointer should be cleared
    const active = await repo.getActiveSession();
    expect(active).toBeNull();
  });

  it('completes sessions and prevents subsequent mutations', async () => {
    const engine = new DurableStorageEngine();
    const repo = new SessionRepository(engine);

    const session = await repo.createSession();
    const completed = await repo.completeSession(session.id, 4500000);

    expect(completed.status).toBe('COMMITTED');
    expect(completed.actualTotalSavingsBytes).toBe(4500000);
    expect(await repo.getActiveSession()).toBeNull();

    // Modifying committed session should throw
    await expect(
      repo.recordDecision(session.id, {
        mediaId: 'm-x',
        decision: 'KEEP',
        decidedAt: Date.now(),
      })
    ).rejects.toThrow();
  });
});

describe('PendingJobQueue & Staged File Cleanup', () => {
  it('enqueues, updates status and progress for jobs', async () => {
    const engine = new DurableStorageEngine();
    const queue = new PendingJobQueue(engine);

    const job = await queue.enqueueJob({
      id: 'job-1',
      type: 'COMPRESSION',
      mediaId: 'item-100',
      stagedPath: '/data/app/staged/item-100.webp',
    });

    expect(job.status).toBe('PENDING');
    expect(job.progress).toBe(0);

    await queue.updateJobProgress('job-1', 55);
    const inProgress = await queue.getJob('job-1');
    expect(inProgress?.progress).toBe(55);

    await queue.updateJobStatus('job-1', 'COMPLETED');
    const completed = await queue.getJob('job-1');
    expect(completed?.status).toBe('COMPLETED');
    expect(completed?.progress).toBe(100);
  });

  it('safely cleans up app-owned staged output files on failed or cancelled jobs', async () => {
    const engine = new DurableStorageEngine();
    const queue = new PendingJobQueue(engine);

    // Job 1: Cancelled with staged path
    await queue.enqueueJob({
      id: 'job-cancel',
      type: 'COMPRESSION',
      mediaId: 'item-cancel',
      stagedPath: '/staging/cancelled_file.webp',
      status: 'CANCELLED',
    });

    // Job 2: Failed with staged path
    await queue.enqueueJob({
      id: 'job-fail',
      type: 'COMPRESSION',
      mediaId: 'item-fail',
      stagedPath: '/staging/failed_file.webp',
      status: 'FAILED',
    });

    // Job 3: Completed with staged path (not cleaned up automatically)
    await queue.enqueueJob({
      id: 'job-ok',
      type: 'COMPRESSION',
      mediaId: 'item-ok',
      stagedPath: '/staging/kept_file.webp',
      status: 'COMPLETED',
    });

    const deletedPaths: string[] = [];
    const mockCleaner = async (path: string) => {
      deletedPaths.push(path);
    };

    const cleaned = await queue.cleanupAbandonedStagedFiles(mockCleaner);
    expect(cleaned.sort()).toEqual([
      '/staging/cancelled_file.webp',
      '/staging/failed_file.webp',
    ]);
    expect(deletedPaths.sort()).toEqual([
      '/staging/cancelled_file.webp',
      '/staging/failed_file.webp',
    ]);

    // Running cleanup again should do nothing because stagedPath was cleared
    const secondClean = await queue.cleanupAbandonedStagedFiles(mockCleaner);
    expect(secondClean).toEqual([]);
  });
});
