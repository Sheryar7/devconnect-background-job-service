"use client";

import React, { useState } from "react";
import { Navbar } from "../components/Navbar";
import { AuthModal } from "../components/AuthModal";
import { LatencyMeter } from "../components/LatencyMeter";
import { JobImportPanel } from "../components/JobImportPanel";
import { ActiveJobTracker } from "../components/ActiveJobTracker";
import { JobHistoryTable } from "../components/JobHistoryTable";
import { ImportJobResponse, Job } from "../lib/types";
import { useAuth } from "../context/auth-context";
import { Database, Cpu, Zap, Shield } from "lucide-react";

export default function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<(ImportJobResponse & { latencyMs: number }) | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState<number>(0);

  const handleJobSubmitted = (response: ImportJobResponse & { latencyMs: number }) => {
    setActiveJobId(response.jobId);
    setLastResponse(response);
    setHistoryRefreshKey((prev) => prev + 1);
  };

  const handleJobStatusChange = (job: Job) => {
    if (job.status === "COMPLETED" || job.status === "FAILED") {
      setHistoryRefreshKey((prev) => prev + 1);
    }
  };

  const handleReplayTriggered = (newJobId: string, latencyMs: number) => {
    setActiveJobId(newJobId);
    setLastResponse({
      jobId: newJobId,
      status: "pending",
      totalRows: 2,
      message: "Idempotency re-run submitted",
      createdAt: new Date().toISOString(),
      latencyMs,
    });
    setHistoryRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <AuthModal />

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Top Feature Highlights Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-400">
              <Zap className="h-4 w-4" />
              <span>Fast HTTP 202 Path</span>
            </div>
            <p className="text-xl font-bold font-mono text-white mt-1">&lt; 50 ms</p>
            <span className="text-[11px] text-slate-500">Asynchronous Decoupling</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <Shield className="h-4 w-4" />
              <span>Data Idempotency</span>
            </div>
            <p className="text-xl font-bold font-mono text-white mt-1">100% Safe</p>
            <span className="text-[11px] text-slate-500">Atomic ON CONFLICT Upserts</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
              <Cpu className="h-4 w-4" />
              <span>BullMQ Worker</span>
            </div>
            <p className="text-xl font-bold font-mono text-white mt-1">Self-Healing</p>
            <span className="text-[11px] text-slate-500">30s Locks &amp; Auto-Recovery</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400">
              <Database className="h-4 w-4" />
              <span>Row Isolation</span>
            </div>
            <p className="text-xl font-bold font-mono text-white mt-1">Variant A</p>
            <span className="text-[11px] text-slate-500">Strict JWT User Ownership</span>
          </div>
        </div>

        {/* Live Latency Meter Banner */}
        <LatencyMeter lastResponse={lastResponse} />

        {/* Primary Interactive Split: Import Panel + Live Tracker */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <JobImportPanel onJobSubmitted={handleJobSubmitted} />
          <ActiveJobTracker
            jobId={activeJobId}
            onJobStatusChange={handleJobStatusChange}
            onReplayTriggered={handleReplayTriggered}
          />
        </div>

        {/* User Job History Table */}
        <JobHistoryTable
          onSelectJob={(id) => setActiveJobId(id)}
          selectedJobId={activeJobId}
          refreshTrigger={historyRefreshKey}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-6 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">Background Job Service (Brief B)</span>
            <span>•</span>
            <span>NestJS + TypeScript + PostgreSQL 16 + Redis BullMQ</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <a href="http://localhost:3001/api/docs" target="_blank" rel="noreferrer" className="hover:text-cyan-400 transition-colors">
              OpenAPI Swagger
            </a>
            <span>•</span>
            <span>API Port: 3001</span>
          </div>
        </div>
      </footer>
    </div>
  );
}