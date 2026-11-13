'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import TopNav from '@/components/layout/TopNav';
import NrsStatusBar from '@/components/NrsStatusBar';

export default function AppShell({ children }) {
  const { loading, profile, user, selectedStore, setSelectedStore, effectiveStoreId } = useAuth();
  const router = useRouter();

  // If auth resolved but we have no user, bounce to login immediately.
  useEffect(() => {
    if (!loading && !user) {
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
  }, [loading, user]);

  // Employees have a limited whitelist of pages. If they land outside it, bounce to /sales.
  useEffect(() => {
    if (!loading && profile && profile.role === 'employee') {
      if (typeof window === 'undefined') return;
      // Inventory + Restock temporarily disabled for employees. Add them
      // back to this list (and to the Sidebar nav) once those flows are
      // ready for the employee role.
      const allowed = ['/sales', '/stock-count'];
      const path = window.location.pathname;
      if (!allowed.some(p => path === p || path.startsWith(p + '/'))) {
        router.replace('/sales');
      }
    }
  }, [loading, profile, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sw-bg p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-sw-border border-t-sw-blue animate-spin" aria-hidden="true" />
          <div className="text-sw-sub text-sm font-medium">Loading 7s Vape Love…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sw-bg p-6">
        <div className="text-center">
          <div className="text-sw-sub text-sm mb-3">Redirecting to login...</div>
          <a href="/login" className="text-sw-blue text-sm underline">Click here if not redirected</a>
        </div>
      </div>
    );
  }

  const showProfileWarning = !profile || profile.__fallback;

  return (
    <div className="bg-sw-bg min-h-screen">
      <TopNav selectedStore={effectiveStoreId} onStoreChange={setSelectedStore} />
      <main className="max-w-[1360px] mx-auto px-4 md:px-7 app-main-pad">
        {showProfileWarning && (
          <div className="mb-3 rounded-lg border border-sw-amber/30 bg-sw-amberD text-sw-amber px-3 py-2 text-[13px]">
            Profile data unavailable — some permissions may be incorrect. Try signing out and back in, or contact an owner.
          </div>
        )}
        <NrsStatusBar />
        {typeof children === 'function' ? children({ selectedStore: effectiveStoreId, setSelectedStore }) : children}
      </main>
    </div>
  );
}
