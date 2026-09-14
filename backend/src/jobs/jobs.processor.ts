import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
} from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Job, JobStatus } from './entities/job.entity';
import { ImportedRecord } from './entities/imported-record.entity';
import { IMPORT_QUEUE_NAME, ImportJobPayload } from './jobs.service';

@Processor(IMPORT_QUEUE_NAME, {
  concurrency: 5,
  lockDuration: 30000,      // 30 seconds lock duration
  stalledInterval: 15000,   // Check for stalled/crashed workers every 15s
  maxStalledCount: 3,       // Allow up to 3 stalled retries
})
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(ImportedRecord)
    private readonly importedRecordRepository: Repository<ImportedRecord>,
  ) {
    super();
  }

  async process(bullJob: BullJob<ImportJobPayload>): Promise<any> {
    const { jobId, userId, records } = bullJob.data;
    const startTime = Date.now();
    this.logger.log(`Starting processing for Job ${jobId} (Attempt: ${bullJob.attemptsMade + 1}/${bullJob.opts.attempts || 3})`);

    // 1. Fetch Job from PostgreSQL
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`Job ${jobId} not found in database. Aborting worker execution.`);
      return;
    }

    // 2. Transition state to 'PROCESSING'
    job.status = JobStatus.PROCESSING;
    job.startedAt = job.startedAt || new Date();
    job.attempts = bullJob.attemptsMade + 1;
    await this.jobRepository.save(job);

    try {
      const total = records.length;
      let insertedCount = 0;
      let updatedCount = 0;

      // 3. Process records in transactional batches with atomic upsert for Idempotency
      const batchSize = 50;
      for (let i = 0; i < total; i += batchSize) {
        const chunk = records.slice(i, i + batchSize);

        await this.dataSource.transaction(async (manager) => {
          for (const row of chunk) {
            // Support simulated failure for resilience testing
            if (row.triggerFailure) {
              throw new Error('Simulated worker process crash / corrupt data payload');
            }

            const externalId = String(row.externalId);
            // Deterministic hash: sha256(userId + ":" + externalId)
            const recordHash = crypto
              .createHash('sha256')
              .update(`${userId}:${externalId}`)
              .digest('hex');

            const rowData = { ...row };
            delete rowData.externalId;

            // Atomic ON CONFLICT DO UPDATE:
            // If the record exists for this user and external ID, update the payload and job pointer.
            // If it does not exist, insert a new row.
            // Guarantees exact same dataset on duplicate/replay runs.
            const query = `
              INSERT INTO imported_records (id, user_id, job_id, external_id, record_hash, data, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
              ON CONFLICT (user_id, external_id)
              DO UPDATE SET
                record_hash = EXCLUDED.record_hash,
                data = EXCLUDED.data,
                job_id = EXCLUDED.job_id,
                updated_at = NOW()
              RETURNING (xmax = 0) AS is_inserted;
            `;

            const result = await manager.query(query, [
              uuidv4(),
              userId,
              jobId,
              externalId,
              recordHash,
              JSON.stringify(rowData),
            ]);

            if (result && result[0] && result[0].is_inserted) {
              insertedCount++;
            } else {
              updatedCount++;
            }
          }
        });

        const processedSoFar = Math.min(i + batchSize, total);
        const progressPercent = total > 0 ? Math.round((processedSoFar / total) * 100) : 100;

        // Update BullMQ progress and PostgreSQL progress telemetry
        await bullJob.updateProgress(progressPercent);
        await this.jobRepository.update(jobId, {
          progress: progressPercent,
          processedRows: processedSoFar,
        });
      }

      // 4. Mark Job as COMPLETED upon successful finish
      const executionTimeMs = Date.now() - startTime;
      const jobResult = {
        totalRows: total,
        insertedCount,
        updatedCount,
        executionTimeMs,
        idempotentSummary: updatedCount > 0 ? `${updatedCount} records safely deduplicated/upserted` : 'All records newly imported',
      };

      job.status = JobStatus.COMPLETED;
      job.progress = 100;
      job.processedRows = total;
      job.result = jobResult;
      job.errorMessage = null;
      job.completedAt = new Date();
      await this.jobRepository.save(job);

      this.logger.log(`Job ${jobId} successfully completed in ${executionTimeMs}ms (${insertedCount} inserted, ${updatedCount} updated)`);
      return jobResult;

    } catch (error: any) {
      this.logger.error(`Error processing Job ${jobId} on attempt ${bullJob.attemptsMade + 1}: ${error.message}`);

      const isFinalAttempt = bullJob.attemptsMade + 1 >= (bullJob.opts.attempts || 3);

      if (isFinalAttempt) {
        // Retries permanently exhausted: transition to FAILED with telemetry
        job.status = JobStatus.FAILED;
        job.errorMessage = `Permanent failure after ${bullJob.attemptsMade + 1} attempts: ${error.message}`;
        job.completedAt = new Date();
        await this.jobRepository.save(job);

        // Critical alert telemetry so nobody is left in the dark
        this.logger.error(
          `[CRITICAL ALERT] Job ${jobId} (User: ${userId}) permanently FAILED after ${bullJob.attemptsMade + 1} attempts! Telemetry: ${error.stack || error.message}`
        );
      } else {
        // Intermediate failure: record retry attempt telemetry
        job.errorMessage = `Attempt ${bullJob.attemptsMade + 1} failed: ${error.message}. Queued for retry with exponential backoff.`;
        await this.jobRepository.save(job);
      }

      throw error; // Re-throw to inform BullMQ of the failure
    }
  }

  @OnWorkerEvent('stalled')
  async onStalled(jobId: string) {
    this.logger.warn(`[WORKER HEARTBEAT ALERT] Job ${jobId} has stalled! Worker may have crashed or timed out. BullMQ is triggering recovery.`);
  }

  @OnWorkerEvent('failed')
  async onFailed(bullJob: BullJob, error: Error) {
    this.logger.error(`[JOB RETRY EVENT] Job ${bullJob?.id} failed: ${error.message}. Attempts: ${bullJob.attemptsMade}/${bullJob.opts.attempts || 3}`);
    if (bullJob?.data?.jobId && bullJob.attemptsMade >= (bullJob.opts.attempts || 3)) {
      try {
        await this.jobRepository.update(bullJob.data.jobId, {
          status: JobStatus.FAILED,
          errorMessage: `Permanent failure after ${bullJob.attemptsMade} attempts: ${error.message}`,
          completedAt: new Date(),
        });
      } catch (e: any) {
        this.logger.error(`Failed to record failure status for job ${bullJob.data.jobId}: ${e.message}`);
      }
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(bullJob: BullJob) {
    this.logger.log(`[JOB COMPLETED EVENT] Job ${bullJob?.id} completed successfully.`);
  }
}
