'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { api } from '../lib/api';
import { Job, JobStatus } from '../lib/types';
import { History, RefreshCw, Eye, Lock, CheckCircle, XCircle, Clock } from 'lucide-react';

interface JobHistoryTableProps {
  onSelectJob: (jobId: string) => void;
  selectedJobId: string | null;
  refreshTrigger?: number;
}

export function JobHistoryTable({ onSelectJob, selectedJobId, refreshTrigger }: JobHistoryTableProps) {
  const { user, isAuthenticated, setIsAuthModalOpen } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMyJobs();
      setJobs(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load job history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchJobs();
    } else {
      setJobs([]);
    }
  }, [isAuthenticated, refreshTrigger]);

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-8 backdrop-blur-md text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-950/50 text-cyan-400 border border-cyan-800/40 mb-3">
          <Lock className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-white">Authentication Required</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
          To enforce strict row-level user data isolation, jobs and records are protected by JWT Bearer authentication. Sign in to view and manage your pipeline.
        </p>
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 transition-all"
        >
          Sign In / Create Account
        </button>
      </div>
    );
  }

  const renderStatus = (status: JobStatus) => {
    switch (status) {
      case 'PENDING':
        return <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300 border border-amber-500/30">PENDING</span>;
      case 'PROCESSING':
        return <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-blue-300 border border-blue-500/30">PROCESSING</span>;
      case 'COMPLETED':
        return <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">COMPLETED</span>;
      case 'FAILED':
        return <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-semibold text-rose-300 border border-rose-500/30">FAILED</span>;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-md shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <History className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Job History</h2>
              <span className="rounded-full bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 text-[10px] font-mono text-cyan-400">
                User Row Isolation Active
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Showing strictly jobs belonging to <strong className="text-slate-200">{user?.email}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchJobs}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
            <span>Refresh Table</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800/80 text-slate-400 font-semibold uppercase tracking-wider">
              <th className="py-2.5 px-3">Job ID</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Records</th>
              <th className="py-2.5 px-3">Execution Time</th>
              <th className="py-2.5 px-3">Created At</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  {loading ? 'Fetching jobs...' : 'No jobs found for this account. Submit a job above to get started!'}
                </td>
              </tr>
            ) : (
              jobs.map((j) => {
                const isSelected = j.id === selectedJobId;
                const createdTime = new Date(j.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return (
                  <tr
                    key={j.id}
                    className={`transition-colors hover:bg-slate-800/40 ${
                      isSelected ? 'bg-cyan-950/20 border-l-2 border-cyan-500' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {j.id.slice(0, 13)}...
                    </td>
                    <td className="py-3 px-3">{renderStatus(j.status)}</td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {j.processedRows || 0} / {j.totalRows || 0}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-400">
                      {j.result?.executionTimeMs ? `${j.result.executionTimeMs}ms` : '�'}
                    </td>
                    <td className="py-3 px-3 text-slate-400">{createdTime}</td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onSelectJob(j.id)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-cyan-500 text-white shadow'
                            : 'border border-slate-700 bg-slate-800 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300'
                        }`}
                      >
                        <Eye className="h-3 w-3" />
                        <span>{isSelected ? 'Viewing' : 'Inspect'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
