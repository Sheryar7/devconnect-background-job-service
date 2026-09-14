import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../context/auth-context';

export const metadata: Metadata = {
  title: 'Async Background Job Processing Dashboard',
  description:
    'Production-grade asynchronous job pipeline with fast HTTP 202 decoupling, BullMQ worker resilience, and PostgreSQL row isolation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#070b12] text-slate-100 antialiased selection:bg-cyan-500 selection:text-white min-h-screen flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
