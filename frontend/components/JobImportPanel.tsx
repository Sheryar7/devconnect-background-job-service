'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { api } from '../lib/api';
import { UploadCloud, FileText, Database, Sparkles, Send, AlertTriangle } from 'lucide-react';
import { ImportJobResponse } from '../lib/types';

interface JobImportPanelProps {
  onJobSubmitted: (jobResponse: ImportJobResponse & { latencyMs: number; submittedRecords: any[] }) => void;
}

export function JobImportPanel({ onJobSubmitted }: JobImportPanelProps) {
  const { isAuthenticated, setIsAuthModalOpen } = useAuth();
  const [csvContent, setCsvContent] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate 1,000 realistic sample records in CSV format
  const loadSample1000 = () => {
    const categories = ['Electronics', 'Furniture', 'Audio', 'Office', 'Accessories', 'Displays'];
    const products = ['Pro Keyboard', 'Ergo Chair', '4K Monitor', 'Noise Cancelling Headset', 'USB-C Dock', 'Desk Lamp', 'Webcam Ultra', 'Bluetooth Mouse'];

    const lines = ['externalId,name,price,category,stock'];
    for (let i = 1; i <= 1000; i++) {
      const sku = `SKU-${1000 + i}`;
      const prod = products[i % products.length];
      const cat = categories[i % categories.length];
      const price = (19.99 + (i % 50) * 8.5).toFixed(2);
      const stock = 10 + (i % 200);
      lines.push(`${sku},${prod} v${(i % 5) + 1},${price},${cat},${stock}`);
    }
    setCsvContent(lines.join('\n'));
    setError(null);
  };

  const loadSampleSmall = () => {
    const sample = [
      'externalId,name,price,category',
      'SKU-1001,Studio Headphones,199.99,Audio',
      'SKU-1002,Mechanical Keyboard,149.50,Accessories',
      'SKU-1003,Ultra-Wide Monitor,499.00,Displays',
      'SKU-1004,Ergonomic Chair,289.00,Furniture',
      'SKU-1005,Wireless Mouse,49.99,Accessories',
    ].join('\n');
    setCsvContent(sample);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }

    if (!csvContent.trim()) {
      setError('Please provide CSV data or click one of the sample dataset generators.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await api.submitImportJob({ csvContent });
      onJobSubmitted({
        ...response.data,
        latencyMs: response.latencyMs,
        submittedRecords: [], // cached if needed
      });
    } catch (err: any) {
      setError(err.message || 'Failed to submit import job.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const lineCount = csvContent ? csvContent.trim().split('\n').length - 1 : 0;
  const estimatedRows = Math.max(0, lineCount);

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Import Pipeline</h2>
              <p className="text-xs text-slate-400">Asynchronous CSV / Structured Ingestion</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
              {estimatedRows.toLocaleString()} rows detected
            </span>
          </div>
        </div>

        {/* Quick Fill Buttons */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium">Quick Fill:</span>
          <button
            type="button"
            onClick={loadSample1000}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/50 hover:border-cyan-400 transition-colors shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span>Load Sample Dataset (1,000 records)</span>
          </button>
          <button
            type="button"
            onClick={loadSampleSmall}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition-colors"
          >
            <span>Load Small Batch (5 records)</span>
          </button>
          {csvContent && (
            <button
              type="button"
              onClick={() => setCsvContent('')}
              className="ml-auto text-xs text-slate-500 hover:text-rose-400 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Text Area */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <textarea
              rows={8}
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder="Paste raw CSV format here (e.g. externalId,name,price,category) or use the buttons above to load 1,000 sample records..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 leading-relaxed resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-400">
              Expected SLA: <span className="text-emerald-400 font-semibold">&lt; 50ms HTTP 202 response</span>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  <span>Enqueuing to BullMQ...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Submit Async Job</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
