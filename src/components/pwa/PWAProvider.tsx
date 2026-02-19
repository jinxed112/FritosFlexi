'use client';

import { useServiceWorker } from '@/hooks/useServiceWorker';
import { PWAInstallPrompt } from '@/components/pwa/PWAInstallPrompt';

export function PWAProvider({ children }: { children: React.ReactNode }) {
  useServiceWorker();

  return (
    <>
      {children}
      <PWAInstallPrompt />
    </>
  );
}
