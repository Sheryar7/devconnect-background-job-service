'use client';

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Job, JobStatus } from '../lib/types';
import { Activity, Clock, CheckCircle, XCircle, RefreshCw, Layers, ShieldCheck, Database, Zap } from 'lucide-react';

interface ActiveJobTrackerProps {
  jobId: string | null;
  onJobStatusChange?: (job: Job) => void;
  onReplayTriggered?: (newJobId: string, latencyMs: number) => void;
}

export function ActiveJobTracker({ jobId, onJobStatusChange, onReplayTriggered }: ActiveJobTrackerProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayMessage, setReplayMessage] = useState<string | null>(null);

  // Poll GET /jobs/:id every 1.5 seconds while job is active
  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }

    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const fetchJob = async () => {
      try {
        const response = await api.getJob(jobId);
        if (isMounted) {
          setJob(response.data);
          setError(null);
          onJobStatusChange?.(response.data);

          // Stop polling if completed or failed
          if (response.data.status === 'COMPLETED' || response.data.status === 'FAILED') {
            clearInterval(pollInterval);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to fetch job status');
        }
      }
    };

    fetchJob();
    pollInterval = setInterval(fetchJob, 1500);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [jobId]);

  // Idempotency Test Action: re-submits sample data to prove deduplication
  const handleTestDuplicateExecution = async () => {
    if (!job) return;
    setIsReplaying(true);
    setReplayMessage(null);

    try {
      // Re-submit identical batch
      const sample = [
        'externalId,name,price,category',
        'SKU-1001,Studio Headphones,199.99,Audio',
        'SKU-1002,Mechanical Keyboard,149.50,Accessories',
      ].join('\n');

      const response = await api.submitImportJob({ csvContent: sample });
      setReplayMessage(`Duplicate execution triggered in ${response.latencyMs}ms. Worker will safely update without inserting duplicate rows.`);
      onReplayTriggered?.(response.data.jobId, response.latencyMs);
    } catch (err: any) {
      setReplayMessage(`Replay failed: ${err.message}`);
    } finally {
      setIsReplaying(false);
    }
  };

  if (!jobId) {
    return (
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 backdrop-blur-md text-center flex flex-col items-center justify-center min-h-[300px]">
        <div className="h-12 w-12 rounded-2xl bg-slate-800/50 flex items-center justify-center text-slate-500 mb-3 border border-slate-800">
          <Activity className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-300">No Job Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Submit a new import job on the left or select an existing job from the history table to monitor real-time worker progress.
        </p>
      </div>
    );
  }

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300 border border-amber-500/30">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>PENDING (Queued in Redis)</span>
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-300 border border-blue-500/30">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-400" />
            <span>PROCESSING (Worker Active)</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            <span>COMPLETED (PostgreSQL Inserted)</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-300 border border-rose-500/30">
            <XCircle className="h-3.5 w-3.5 text-rose-400" />
            <span>FAILED (Retries Exhausted)</span>
          </span>
        );
    }
  };

  const progress = job ? Math.min(100, Math.max(0, job.progress || 0)) : 0;
  const isFinished = job?.status === 'COMPLETED' || job?.status === 'FAILED';

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col justify-between">
      <div>
        {/* Tracker Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Job Monitor</span>
              <span className="font-mono text-xs text-slate-500">#{jobId.slice(0, 8)}</span>
            </div>
            <h2 className="text-lg font-bold text-white mt-0.5">Real-Time Worker Progress</h2>
          </div>
          {job && getStatusBadge(job.status)}
        </div>

        {/* Progress Bar Component */}
        <div className="space-y-2 mb-6">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Batch Ingestion Progress</span>
            <span className="font-mono font-bold text-white">{progress}%</span>
          </div>

          <div className="h-3.5 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                job?.status === 'FAILED'
                  ? 'bg-rose-500'
                  : job?.status === 'COMPLETED'
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-400 animate-pulse'
              }`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>Processed: {job?.processedRows || 0} / {job?.totalRows || 0} rows</span>
            <span>Attempts: {job?.attempts || 1}/{job?.maxAttempts || 3}</span>
          </div>
        </div>

        {/* Result Metrics Grid */}
        {job?.result && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-2.5">
              <ShieldCheck className="h-4 w-4" />
              <span>Idempotent Worker Telemetry</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800/80">
                <span className="text-[10px] uppercase text-slate-400 block">Total Rows</span>
                <span className="text-sm font-bold font-mono text-white">{job.result.totalRows}</span>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800/80">
                <span className="text-[10px] uppercase text-slate-400 block">New Inserts</span>
                <span className="text-sm font-bold font-mono text-emerald-400">{job.result.insertedCount}</span>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800/80">
                <span className="text-[10px] uppercase text-slate-400 block">Deduplicated</span>
                <span className="text-sm font-bold font-mono text-cyan-400">{job.result.updatedCount}</span>
              </div>
              <div className="rounded-lg bg-slate-900/80 p-2 border border-slate-800/80">
                <span className="text-[10px] uppercase text-slate-400 block">Duration</span>
                <span className="text-sm font-bold font-mono text-amber-300">{job.result.executionTimeMs}ms</span>
              </div>
            </div>
            {job.result.idempotentSummary && (
              <p className="mt-2.5 text-xs text-slate-400 text-center font-mono">
                Outcome: <span className="text-cyan-300 font-semibold">{job.result.idempotentSummary}</span>
              </p>
            )}
          </div>
        )}

        {/* Failure Telemetry if FAILED */}
        {job?.status === 'FAILED' && job?.errorMessage && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-400 mb-1">
              <XCircle className="h-4 w-4" />
              <span>Critical Worker Failure Telemetry</span>
            </div>
            <p className="text-xs font-mono text-rose-200 break-words">{job.errorMessage}</p>
            <span className="text-[11px] text-slate-400 mt-2 block">
              Notice: The failure was captured by BullMQ retries and transitioned to PostgreSQL. The answer is never "nobody finds out".
            </span>
          </div>
        )}

        {replayMessage && (
          <div className="mb-4 rounded-lg border border-cyan-500/30 bg-cyan-950/40 p-2.5 text-xs text-cyan-300">
            {replayMessage}
          </div>
        )}
      </div>

      {/* Action: Test Duplicate Execution */}
      <div className="border-t border-slate-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs text-slate-400">
          Verify Idempotency: Re-submitting the same batch will update with <strong className="text-white">0 duplicates</strong>.
        </span>
        <button
          type="button"
          disabled={isReplaying || !isFinished}
          onClick={handleTestDuplicateExecution}
          className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-950/40 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400 transition-all disabled:opacity-40"
        >
          {isReplaying ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></span>
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span>Test Duplicate Execution</span>
        </button>
      </div>
    </div>
  );
}
