'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/auth-context';
import { X, Lock, Mail, UserPlus, LogIn, AlertCircle } from 'lucide-react';

export function AuthModal() {
  const { isAuthModalOpen, setIsAuthModalOpen, login, register } = useAuth();
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isLoginTab) {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fillDemoUser = (userType: 'UserA' | 'UserB') => {
    if (userType === 'UserA') {
      setEmail('userA@example.com');
      setPassword('Password123!');
    } else {
      setEmail('userB@example.com');
      setPassword('Password123!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">
            {isLoginTab ? 'Sign In to JobStream' : 'Create Account'}
          </h3>
          <button
            onClick={() => setIsAuthModalOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 border-b border-slate-800 bg-slate-950/50 p-1">
          <button
            type="button"
            onClick={() => { setIsLoginTab(true); setError(null); }}
            className={`py-2 text-sm font-medium rounded-lg transition-colors ${
              isLoginTab ? 'bg-slate-800 text-cyan-400 font-semibold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsLoginTab(false); setError(null); }}
            className={`py-2 text-sm font-medium rounded-lg transition-colors ${
              !isLoginTab ? 'bg-slate-800 text-cyan-400 font-semibold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-sm text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="engineer@example.com"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="������������"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          {/* Demo User Helper Quick-Fills */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3">
            <p className="text-xs font-medium text-slate-400 mb-2">
              ?? Quick-Fill Demo Users (Test User Isolation):
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fillDemoUser('UserA')}
                className="flex-1 rounded-lg border border-slate-800 bg-slate-900 py-1 text-xs font-mono text-cyan-400 hover:border-cyan-500/50 hover:bg-cyan-950/30 transition-colors"
              >
                User A
              </button>
              <button
                type="button"
                onClick={() => fillDemoUser('UserB')}
                className="flex-1 rounded-lg border border-slate-800 bg-slate-900 py-1 text-xs font-mono text-purple-400 hover:border-purple-500/50 hover:bg-purple-950/30 transition-colors"
              >
                User B
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            ) : isLoginTab ? (
              <>
                <LogIn className="h-4 w-4" />
                <span>Sign In</span>
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                <span>Create Account</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
