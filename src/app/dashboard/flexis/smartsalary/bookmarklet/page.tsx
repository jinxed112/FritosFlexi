'use client';

// src/app/dashboard/flexis/smartsalary/bookmarklet/page.tsx

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const FRITOS_BASE = 'https://fritos-flexi.vercel.app';

function buildBookmarklet(fritosToken: string): string {
  // Tiny loader — charge le script hébergé sur Vercel avec le token en paramètre
  const code = `(function(){` +
    `var t=${JSON.stringify(fritosToken)};` +
    `var s=document.createElement('script');` +
    `s.src='${FRITOS_BASE}/smartsalary-sync.js?t='+encodeURIComponent(t)+'&_='+Date.now();` +
    `document.head.appendChild(s);` +
    `})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export default function BookmarkletPage() {
  const [bookmarkletHref, setBookmarkletHref] = useState('#');
  const [tokenStatus, setTokenStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        setBookmarkletHref(buildBookmarklet(session.access_token));
        setTokenStatus('ok');
      } else {
        setTokenStatus('error');
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📤</div>
          <h1 className="text-2xl font-bold text-white">FritOS Sync</h1>
          <p className="text-gray-400 mt-1 text-sm">Créez vos travailleurs dans SmartSalary en un clic</p>
        </div>

        {/* Token status */}
        <div className={`rounded-lg p-3 mb-6 text-sm flex items-center gap-2 ${
          tokenStatus === 'ok'
            ? 'bg-green-950 border border-green-800 text-green-400'
            : tokenStatus === 'error'
            ? 'bg-red-950 border border-red-800 text-red-400'
            : 'bg-gray-800 border border-gray-700 text-gray-400'
        }`}>
          {tokenStatus === 'ok' && <><span>✅</span> Session intégrée dans le bookmarklet</>}
          {tokenStatus === 'error' && <><span>❌</span> Session non trouvée — reconnectez-vous d&apos;abord</>}
          {tokenStatus === 'loading' && <><span>⏳</span> Lecture de la session...</>}
        </div>

        {/* Steps */}
        <div className="space-y-4">

          {/* Step 1 */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">1</div>
              <p className="font-semibold text-white">Installez le bookmarklet</p>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Glissez ce bouton vers votre barre de favoris Chrome{' '}
              <span className="text-gray-500">(Ctrl+Shift+B pour l&apos;afficher)</span>
            </p>
            {tokenStatus === 'ok' ? (
              <a
                href={bookmarkletHref}
                className="inline-block bg-orange-500 hover:bg-orange-400 text-white font-bold px-5 py-3 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                📤 FritOS Sync
              </a>
            ) : (
              <div className="inline-block bg-gray-700 text-gray-500 font-bold px-5 py-3 rounded-lg cursor-not-allowed">
                📤 FritOS Sync
              </div>
            )}
            <p className="text-gray-600 text-xs mt-3">
              ⚠️ Le token expire avec votre session. Revenez ici pour réinstaller si le bookmarklet ne fonctionne plus.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">2</div>
              <p className="font-semibold text-white">Ouvrez SmartSalary</p>
            </div>
            <p className="text-gray-400 text-sm">
              Rendez-vous sur{' '}
              <a
                href="https://my.partena-professional.be"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline"
              >
                my.partena-professional.be
              </a>
              {' '}→ <strong className="text-gray-300">Gestion des salaires SmartSalary</strong> → <strong className="text-gray-300">Travailleurs</strong>
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">3</div>
              <p className="font-semibold text-white">Cliquez sur 📤 FritOS Sync dans vos favoris</p>
            </div>
            <p className="text-gray-400 text-sm">
              Un panneau apparaît avec vos travailleurs FritOS. Sélectionnez-les, définissez les dates de contrat, et cliquez Synchroniser. Le token Partena est capturé automatiquement.
            </p>
          </div>
        </div>

        {/* Why this approach */}
        <div className="mt-6 bg-blue-950 border border-blue-800 rounded-xl p-4">
          <p className="text-blue-300 text-xs font-semibold mb-1">POURQUOI CETTE APPROCHE ?</p>
          <p className="text-blue-200 text-xs leading-relaxed">
            L&apos;API Partena valide les tokens JWT par session navigateur. Les appels depuis Vercel (IP différente) sont rejetés avec 401. Ce bookmarklet effectue les requêtes directement depuis votre navigateur sur le domaine Partena — là où le token est valide.
          </p>
        </div>

      </div>
    </div>
  );
}
