'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
  niss: string;
  status: string;
  hourly_rate: number;
  email: string;
  phone: string;
  iban: string;
  date_of_birth: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  lieu_de_naissance: string;
  sexe: string;
  langue: string;
  'niveau_d\'études': string;
  ss_person_id: string | null;
  smartsalary_person_id: string | null;
}

interface SyncResult {
  workerId: string;
  success: boolean;
  personId?: string;
  error?: string;
}

export default function SmartSalaryPage() {
  const [token, setToken] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selected, setSelected] = useState<Record<string, { dateIn: string; dateOut: string }>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, SyncResult>>({});
  const [loading, setLoading] = useState(true);
  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({});
  const [linkingWorker, setLinkingWorker] = useState<string | null>(null);
  const [linkResults, setLinkResults] = useState<Record<string, boolean>>({});

  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (t) {
      setToken(t);
      setTokenSaved(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    loadWorkers();
  }, []);

  async function loadWorkers() {
    setLoading(true);
    const { data } = await supabase
      .from('flexi_workers')
      .select('*')
      .eq('is_active', true)
      .eq('profile_complete', true)
      .order('last_name');
    setWorkers(data || []);
    setLoading(false);
  }

  function toggleWorker(id: string, dateIn: string, dateOut: string) {
    setSelected(prev => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { dateIn, dateOut } };
    });
  }

  async function linkWorker(worker: Worker) {
    const personId = linkInputs[worker.id]?.trim();
    if (!personId) return;

    setLinkingWorker(worker.id);
    try {
      const { error } = await supabase
        .from('flexi_workers')
        .update({ smartsalary_person_id: personId })
        .eq('id', worker.id);

      if (error) throw error;

      setLinkResults(prev => ({ ...prev, [worker.id]: true }));
      setWorkers(prev => prev.map(w =>
        w.id === worker.id ? { ...w, smartsalary_person_id: personId } : w
      ));
    } catch (e) {
      alert('Erreur lors de la liaison: ' + (e as any).message);
    } finally {
      setLinkingWorker(null);
    }
  }

  async function syncWorker(worker: Worker) {
    if (!token) return;
    const sel = selected[worker.id];
    if (!sel) return;

    setSyncing(prev => ({ ...prev, [worker.id]: true }));

    try {
      const res = await fetch('/api/smartsalary/employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          worker: {
            ...worker,
            dateInService: new Date(sel.dateIn).toISOString(),
            dateOutService: new Date(sel.dateOut).toISOString(),
          },
        }),
      });
      const data = await res.json();
      setResults(prev => ({
        ...prev,
        [worker.id]: {
          workerId: worker.id,
          success: data.success,
          personId: data.personId,
          error: data.error ? JSON.stringify(data.error) : undefined,
        },
      }));
    } catch (e: any) {
      setResults(prev => ({
        ...prev,
        [worker.id]: { workerId: worker.id, success: false, error: e.message },
      }));
    } finally {
      setSyncing(prev => ({ ...prev, [worker.id]: false }));
    }
  }

  async function syncAll() {
    for (const worker of workers) {
      if (selected[worker.id] && !results[worker.id]?.success) {
        await syncWorker(worker);
      }
    }
  }

  const today = new Date().toISOString().split('T')[0];
  const inOneWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const unlinkedWorkers = workers.filter(w => !w.smartsalary_person_id);
  const linkedWorkers = workers.filter(w => w.smartsalary_person_id);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Synchroniser vers SmartSalary</h1>
        <p className="text-gray-500 mt-1">Créer les travailleurs dans Partena SmartSalary</p>
      </div>

      {/* Token */}
      <div className={`rounded-xl p-5 mb-6 border-2 ${tokenSaved ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
        {tokenSaved ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <p className="font-semibold text-green-800">Token Bearer chargé</p>
                <p className="text-sm text-green-600">Valide ~30 minutes depuis la capture</p>
              </div>
            </div>
            <button
              onClick={() => { setToken(''); setTokenSaved(false); }}
              className="text-sm text-green-700 underline"
            >
              Changer
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🔑</span>
              <div>
                <p className="font-semibold text-orange-800">Token Bearer requis</p>
                <p className="text-sm text-orange-600">
                  Utilisez le bookmarklet depuis SmartSalary, ou collez le token manuellement
                </p>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 mb-4 border border-orange-200">
              <p className="text-sm font-medium text-gray-700 mb-2">📌 Instructions bookmarklet :</p>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>Connectez-vous sur <a href="https://my.partena-professional.be" target="_blank" className="text-blue-600 underline">SmartSalary</a></li>
                <li>Cliquez sur le bookmark <strong>"📤 FritOS Sync"</strong> dans votre barre Chrome</li>
                <li>Vous serez redirigé ici automatiquement avec le token chargé</li>
              </ol>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Ou collez le token Bearer ici..."
                className="flex-1 rounded-lg border border-orange-300 px-3 py-2 text-sm font-mono"
              />
              <button
                onClick={() => token && setTokenSaved(true)}
                disabled={!token}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Valider
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : (
        <>
          {/* ── Section : Lier un worker existant Partena ── */}
          {unlinkedWorkers.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-semibold text-gray-700">🔗 Lier à un worker Partena existant</h2>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                  {unlinkedWorkers.length} sans lien
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Ces workers n&apos;ont pas encore de lien avec Partena. S&apos;ils existent déjà dans SmartSalary, entrez leur ID Partena (format <code className="bg-gray-100 px-1 rounded">308091#15</code>).
              </p>
              <div className="space-y-3">
                {unlinkedWorkers.map(worker => (
                  <div key={worker.id} className="rounded-xl border-2 border-orange-200 bg-orange-50 p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-orange-200 flex items-center justify-center font-bold text-orange-700 text-sm shrink-0">
                        {worker.first_name[0]}{worker.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {worker.first_name} {worker.last_name}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            worker.status === 'student'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {worker.status === 'student' ? '🎓 Étudiant' : '⚡ Flexi'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{worker.niss}</p>
                      </div>

                      {linkResults[worker.id] ? (
                        <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                          <span>✅</span>
                          <span>{linkInputs[worker.id]}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="text"
                            placeholder="308091#15"
                            value={linkInputs[worker.id] || ''}
                            onChange={e => setLinkInputs(prev => ({ ...prev, [worker.id]: e.target.value }))}
                            className="text-sm border border-orange-300 rounded-lg px-3 py-1.5 w-32 font-mono bg-white"
                          />
                          <button
                            onClick={() => linkWorker(worker)}
                            disabled={!linkInputs[worker.id]?.trim() || linkingWorker === worker.id}
                            className="px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 disabled:opacity-50"
                          >
                            {linkingWorker === worker.id ? '⏳' : '🔗 Lier'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Section : Créer dans Partena ── */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">
                ➕ Créer dans SmartSalary ({workers.length} travailleur{workers.length > 1 ? 's' : ''})
              </h2>
              {Object.keys(selected).length > 0 && tokenSaved && (
                <button
                  onClick={syncAll}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  Tout synchroniser ({Object.keys(selected).length})
                </button>
              )}
            </div>

            <div className="space-y-3">
              {workers.map(worker => {
                const isSelected = !!selected[worker.id];
                const result = results[worker.id];
                const isSyncing = syncing[worker.id];
                const sel = selected[worker.id] || { dateIn: today, dateOut: inOneWeek };
                const isLinked = !!worker.smartsalary_person_id;

                return (
                  <div
                    key={worker.id}
                    className={`rounded-xl border-2 p-4 transition-all ${
                      result?.success
                        ? 'border-green-200 bg-green-50'
                        : result?.error
                        ? 'border-red-200 bg-red-50'
                        : isSelected
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleWorker(worker.id, sel.dateIn, sel.dateOut)}
                        disabled={result?.success}
                        className="w-5 h-5 rounded accent-blue-600"
                      />
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-sm shrink-0">
                        {worker.first_name[0]}{worker.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {worker.first_name} {worker.last_name}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            worker.status === 'student'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {worker.status === 'student' ? '🎓 Étudiant' : '⚡ Flexi'}
                          </span>
                          {isLinked && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                              🔗 {worker.smartsalary_person_id}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">{worker.niss} · {worker.hourly_rate}€/h</p>
                      </div>

                      {isSelected && !result?.success && (
                        <div className="flex items-center gap-2 shrink-0">
                          <div>
                            <label className="text-xs text-gray-500 block">Début</label>
                            <input
                              type="date"
                              value={sel.dateIn}
                              onChange={e => setSelected(prev => ({
                                ...prev,
                                [worker.id]: { ...prev[worker.id], dateIn: e.target.value }
                              }))}
                              className="text-xs border border-gray-300 rounded px-2 py-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block">Fin</label>
                            <input
                              type="date"
                              value={sel.dateOut}
                              onChange={e => setSelected(prev => ({
                                ...prev,
                                [worker.id]: { ...prev[worker.id], dateOut: e.target.value }
                              }))}
                              className="text-xs border border-gray-300 rounded px-2 py-1"
                            />
                          </div>
                        </div>
                      )}

                      <div className="shrink-0">
                        {result?.success ? (
                          <div className="text-center">
                            <span className="text-green-600 text-xl">✅</span>
                            <p className="text-xs text-green-600 font-medium">ID: {result.personId}</p>
                          </div>
                        ) : result?.error ? (
                          <span className="text-red-500 text-xl" title={result.error}>❌</span>
                        ) : isSelected && tokenSaved ? (
                          <button
                            onClick={() => syncWorker(worker)}
                            disabled={isSyncing}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isSyncing ? '⏳' : '↑ Sync'}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {result?.error && (
                      <p className="mt-2 text-xs text-red-600 font-mono bg-red-100 rounded p-2 truncate">
                        {result.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
