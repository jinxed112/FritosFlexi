'use client';

// src/app/dashboard/flexis/smartsalary/bookmarklet/page.tsx

const FRITOS_BASE = 'https://fritos-flexi.vercel.app';
const API_KEY = 'fritos-sync-2026-mdjambo';

function buildBookmarklet(): string {
  const code = `(function(){` +
    `var k=${JSON.stringify(API_KEY)};` +
    `var s=document.createElement('script');` +
    `s.src='${FRITOS_BASE}/smartsalary-sync.js?k='+encodeURIComponent(k)+'&_='+Date.now();` +
    `document.head.appendChild(s);` +
    `})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export default function BookmarkletPage() {
  const bookmarkletHref = buildBookmarklet();

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📤</div>
          <h1 className="text-2xl font-bold text-white">FritOS Sync</h1>
          <p className="text-gray-400 mt-1 text-sm">Créez vos travailleurs dans SmartSalary en un clic</p>
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
            <a
              href={bookmarkletHref}
              className="inline-block bg-orange-500 hover:bg-orange-400 text-white font-bold px-5 py-3 rounded-lg cursor-grab active:cursor-grabbing select-none transition-colors"
              onClick={(e) => e.preventDefault()}
            >
              📤 FritOS Sync
            </a>
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
