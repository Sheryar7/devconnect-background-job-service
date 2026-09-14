'use client';

import React, { useState } from 'react';
import { Zap, CheckCircle2, Clock, Copy, Check } from 'lucide-react';
import { ImportJobResponse } from '../lib/types';

interface LatencyMeterProps {
  lastResponse: (ImportJobResponse & { latencyMs: number }) | null;
}

export function LatencyMeter({ lastResponse }: LatencyMeterProps) {
  const [copied, setCopied] = useState(false);

  if (!lastResponse) return null;

  const copyJobId = () => {
    navigator.clipboard.writeText(lastResponse.jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUltraFast = lastResponse.latencyMs < 100;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-950 p-4 sm:p-5 shadow-xl shadow-emerald-950/30 animate-in fade-in slide-in-from-top-3 duration-300">
      {/* Background glow */}
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Metric display */}
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-inner">
            <Zap className="h-6 w-6 fill-emerald-400/30 animate-pulse" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base sm:text-lg font-bold text-white tracking-tight">
                ? API responded in <span className="font-mono text-emerald-400 text-xl underline decoration-emerald-500/50 underline-offset-4">{lastResponse.latencyMs} ms</span>
              </span>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                HTTP 202 Accepted
              </span>
              {isUltraFast && (
                <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[11px] font-medium text-cyan-300 border border-cyan-500/30">
                  Sub-100ms Fast Path
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Asynchronous Decoupling Verified: Request was persisted in PostgreSQL as <span className="font-semibold text-amber-300">PENDING</span> and dispatched to BullMQ Redis in under {lastResponse.latencyMs}ms. Worker is executing in background.
            </p>
          </div>
        </div>

        {/* Job ID reference */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-slate-800 pt-3 sm:pt-0">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Active Job ID</span>
          <button
            onClick={copyJobId}
            className="group flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-xs font-mono text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
            title="Copy Job UUID"
          >
            <span>{lastResponse.jobId.slice(0, 13)}...</span>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-300" />}
          </button>
        </div>
      </div>
    </div>
  );
}
