'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Déjà installée en mode standalone
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // Fermée récemment (3 jours)
    const dismissed = localStorage.getItem('pwa-dismissed');
    if (dismissed && Date.now() - new Date(dismissed).getTime() < 3 * 86400000) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setDeferredPrompt(null);
    setShow(false);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('pwa-dismissed', new Date().toISOString());
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-4 pb-safe">
      <div className="mx-auto max-w-md rounded-2xl bg-gray-800 border border-gray-700 p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-base">
            🍟
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white text-sm">Installer MDjambo</p>
            <p className="text-gray-400 text-xs mt-0.5">
              Accède à tes missions et pointe en un tap
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-gray-500 hover:text-gray-300 p-1"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <button
          onClick={handleInstall}
          className="mt-3 w-full rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold py-2.5 text-sm transition-colors"
        >
          Installer l&apos;application
        </button>
      </div>
    </div>
  );
}
