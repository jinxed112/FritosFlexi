'use client';

import { useEffect } from 'react';

export function useServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Vérifier les mises à jour toutes les heures
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch((err) => console.error('[SW]', err));
  }, []);
}
