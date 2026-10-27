import { ILocalStorageEngine } from './storageEngine';
import { JobStatus } from '../platform/contracts';

export interface PendingProcessingJob {
  id: string;
  type: string;
  mediaId?: string;
  stagedPath?: string;
  status: JobStatus;
  progress: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  payload?: Record<string, unknown>;
}

const JOB_KEY_PREFIX = 'jobs:';
const JOB_INDEX_KEY = 'jobs:_index';

export class PendingJobQueue {
  private readonly storage: ILocalStorageEngine;

  constructor(storage: ILocalStorageEngine) {
    this.storage = storage;
  }

  private async getIndex(): Promise<string[]> {
    const index = await this.storage.get<string[]>(JOB_INDEX_KEY);
    return index ?? [];
  }

  private async saveIndex(index: string[]): Promise<void> {
    await this.storage.set(JOB_INDEX_KEY, index);
  }

  async enqueueJob(
    params: Omit<PendingProcessingJob, 'status' | 'progress' | 'createdAt' | 'updatedAt'> & {
      status?: JobStatus;
      progress?: number;
    }
  ): Promise<PendingProcessingJob> {
    const now = Date.now();
    const job: PendingProcessingJob = {
      id: params.id,
      type: params.type,
      mediaId: params.mediaId,
      stagedPath: params.stagedPath,
      status: params.status ?? 'PENDING',
      progress: params.progress ?? 0,
      error: params.error,
      payload: params.payload,
      createdAt: now,
      updatedAt: now,
    };

    await this.storage.set(`${JOB_KEY_PREFIX}${job.id}`, job);

    const index = await this.getIndex();
    if (!index.includes(job.id)) {
      index.push(job.id);
      await this.saveIndex(index);
    }

    return job;
  }

  async getJob(id: string): Promise<PendingProcessingJob | null> {
    return this.storage.get<PendingProcessingJob>(`${JOB_KEY_PREFIX}${id}`);
  }

  async updateJobStatus(
    id: string,
    status: JobStatus,
    error?: string
  ): Promise<PendingProcessingJob> {
    const job = await this.getJob(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    const updated: PendingProcessingJob = {
      ...job,
      status,
      error: error ?? job.error,
      updatedAt: Date.now(),
      progress: status === 'COMPLETED' ? 100 : job.progress,
    };

    await this.storage.set(`${JOB_KEY_PREFIX}${id}`, updated);
    return updated;
  }

  async updateJobProgress(id: string, progress: number): Promise<PendingProcessingJob> {
    const job = await this.getJob(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
    const updated: PendingProcessingJob = {
      ...job,
      progress: clampedProgress,
      updatedAt: Date.now(),
    };

    await this.storage.set(`${JOB_KEY_PREFIX}${id}`, updated);
    return updated;
  }

  async listPendingJobs(): Promise<PendingProcessingJob[]> {
    const all = await this.listAllJobs();
    return all.filter((job) => job.status === 'PENDING' || job.status === 'RUNNING');
  }

  async listAllJobs(): Promise<PendingProcessingJob[]> {
    const index = await this.getIndex();
    const jobs: PendingProcessingJob[] = [];
    for (const id of index) {
      const job = await this.getJob(id);
      if (job) {
        jobs.push(job);
      }
    }
    return jobs;
  }

  async cancelJob(id: string): Promise<PendingProcessingJob> {
    return this.updateJobStatus(id, 'CANCELLED');
  }

  /**
   * Safely cleans up app-owned staging files for cancelled or failed jobs,
   * or jobs that have been completed.
   */
  async cleanupAbandonedStagedFiles(
    cleaner: (stagedPath: string) => Promise<void>
  ): Promise<string[]> {
    const allJobs = await this.listAllJobs();
    const cleanedPaths: string[] = [];

    for (const job of allJobs) {
      if (
        (job.status === 'CANCELLED' || job.status === 'FAILED') &&
        job.stagedPath
      ) {
        try {
          await cleaner(job.stagedPath);
          cleanedPaths.push(job.stagedPath);
          // Nullify stagedPath so we don't attempt to clean it again
          await this.storage.set(`${JOB_KEY_PREFIX}${job.id}`, {
            ...job,
            stagedPath: undefined,
            updatedAt: Date.now(),
          });
        } catch {
          // Do not swallow critical failure, but continue cleaning others
        }
      }
    }

    return cleanedPaths;
  }
}
