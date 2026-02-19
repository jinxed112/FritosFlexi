'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">📡</div>
        <h1 className="text-xl font-bold text-brand-500 mb-2">Pas de connexion</h1>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          Vérifie ta connexion internet et réessaie.
          Ton pointage sera synchronisé dès que tu seras reconnecté.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white font-semibold px-8 py-3 rounded-xl text-sm transition-colors"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
