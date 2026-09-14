import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Job, JobStatus, JobType } from './entities/job.entity';
import { ImportedRecord } from './entities/imported-record.entity';
import { CreateImportJobDto } from './dto/create-import-job.dto';
import { parseCsvContent } from './utils/csv-parser.util';

export const IMPORT_QUEUE_NAME = 'data-import-queue';

export interface ImportJobPayload {
  jobId: string;
  userId: string;
  records: Array<{ externalId: string; [key: string]: any }>;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(ImportedRecord)
    private readonly importedRecordRepository: Repository<ImportedRecord>,
    @InjectQueue(IMPORT_QUEUE_NAME)
    private readonly jobsQueue: Queue,
  ) {}

  async createImportJob(userId: string, dto: CreateImportJobDto) {
    let records: Array<{ externalId: string; [key: string]: any }> = [];

    if (dto.records && Array.isArray(dto.records) && dto.records.length > 0) {
      records = dto.records.map((rec, idx) => ({
        ...rec,
        externalId: String(rec.externalId || rec.id || `REC-${idx + 1}`),
      }));
    } else if (dto.csvContent && dto.csvContent.trim().length > 0) {
      records = parseCsvContent(dto.csvContent);
    } else {
      // Default sample batch if body is empty to make quick testing effortless
      records = [
        { externalId: 'SKU-1001', name: 'Premium Noise Cancelling Headphones', price: 299.99, category: 'Electronics' },
        { externalId: 'SKU-1002', name: 'Ergonomic Mechanical Keyboard', price: 149.00, category: 'Accessories' },
        { externalId: 'SKU-1003', name: 'Ultra-Wide 4K IPS Monitor', price: 499.50, category: 'Monitors' },
      ];
    }

    const totalRows = records.length;

    // 1. Synchronously persist Job record in PostgreSQL with PENDING status
    const jobEntity = this.jobRepository.create({
      userId,
      type: JobType.CSV_IMPORT,
      status: JobStatus.PENDING,
      progress: 0,
      totalRows,
      processedRows: 0,
      failedRows: 0,
      payload: { recordCount: totalRows },
      attempts: 0,
      maxAttempts: 3,
    });

    const savedJob = await this.jobRepository.save(jobEntity);

    // 2. Push job to BullMQ queue with exponential backoff & retry configuration
    await this.jobsQueue.add(
      'process-import',
      {
        jobId: savedJob.id,
        userId,
        records,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
      },
    );

    this.logger.log(`Job created and queued: ${savedJob.id} for user ${userId} (${totalRows} records)`);

    // 3. Return immediately with HTTP 202 Accepted payload (< 50ms)
    return {
      jobId: savedJob.id,
      status: savedJob.status.toLowerCase(),
      totalRows: savedJob.totalRows,
      message: 'Job accepted and queued for background processing',
      createdAt: savedJob.createdAt,
    };
  }

  async getJobById(jobId: string, userId: string) {
    const job = await this.jobRepository.findOne({
      where: { id: jobId },
    });

    // Strict user row isolation: return 404 if not found or belongs to another user
    if (!job || job.userId !== userId) {
      throw new NotFoundException('Job not found');
    }

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      failedRows: job.failedRows,
      result: job.result,
      errorMessage: job.errorMessage,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async getUserJobs(userId: string) {
    return this.jobRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: [
        'id',
        'type',
        'status',
        'progress',
        'totalRows',
        'processedRows',
        'failedRows',
        'result',
        'errorMessage',
        'startedAt',
        'completedAt',
        'createdAt',
      ],
    });
  }

  async getJobRecords(jobId: string, userId: string) {
    // Ensure ownership verification first
    await this.getJobById(jobId, userId);

    return this.importedRecordRepository.find({
      where: { jobId, userId },
      order: { createdAt: 'ASC' },
    });
  }

  // Helper method used in idempotency testing to simulate re-running the exact same job
  async replayJob(jobId: string, userId: string, records: Array<{ externalId: string; [key: string]: any }>) {
    await this.getJobById(jobId, userId);
    return this.jobsQueue.add(
      'process-import',
      {
        jobId,
        userId,
        records,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }
}
