export interface User {
  id: string;
  email: string;
}

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface JobResult {
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  executionTimeMs: number;
  idempotentSummary: string;
}

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  progress: number;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  result?: JobResult | null;
  errorMessage?: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string;
}

export interface ImportJobResponse {
  jobId: string;
  status: string;
  totalRows: number;
  message: string;
  createdAt: string;
  latencyMs?: number;
}

export interface ImportedRecord {
  id: string;
  userId: string;
  jobId: string;
  externalId: string;
  recordHash: string;
  data: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
