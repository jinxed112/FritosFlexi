'use client';

import { useTransition, useState } from 'react';
import { updateDimonaStatus, getDimonaForCopy, apiDeclareDimona, apiCancelDimona, apiBatchDeclareDimona, syncDimonaWithONSS } from '@/lib/actions/dimona';
import { FileText, Copy, ExternalLink, Send, XCircle, UserX, Zap, Loader2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

const statusStyles: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  ok: { bg: 'bg-emerald-100', text: 'text-emerald-800', icon: '✓', label: 'OK' },
  ready: { bg: 'bg-amber-100', text: 'text-amber-800', icon: '⏳', label: 'Prêt' },
  pending: { bg: 'bg-gray-100', text: 'text-gray-600', icon: '○', label: 'En attente' },
  nok: { bg: 'bg-red-100', text: 'text-red-700', icon: '✕', label: 'NOK' },
  sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '→', label: 'Envoyé' },
  error: { bg: 'bg-red-100', text: 'text-red-700', icon: '!', label: 'Erreur' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', icon: '⊘', label: 'Annulée' },
};

interface Props { declarations: any[]; }

export default function DimonaTable({ declarations }: Props) {
  const [isPending, startTransition] = useTransition();
  const [copyData, setCopyData] = useState<any>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = {
    ok: declarations.filter((d) => d.status === 'ok').length,
    ready: declarations.filter((d) => d.status === 'ready' || d.status === 'pending').length,
    sent: declarations.filter((d) => d.status === 'sent').length,
    nok: declarations.filter((d) => d.status === 'nok' || d.status === 'error').length,
  };

  const showMsg = (type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 6000);
  };

  const handleCopy = async (id: string) => {
    const result = await getDimonaForCopy(id);
    if (result.data) {
      setCopyData(result.data);
      const text = Object.entries(result.data).map(([k, v]) => `${k}: ${v}`).join('\n');
      navigator.clipboard.writeText(text);
    }
  };

  const handleSetOk = (id: string) => { startTransition(() => updateDimonaStatus(id, 'ok')); };
  const handleSetNok = (id: string) => { startTransition(() => updateDimonaStatus(id, 'nok')); };

  const handleApiDeclare = async (id: string) => {
    setLoadingId(id);
    const result = await apiDeclareDimona(id);
    setLoadingId(null);
    if (result.success) {
      showMsg('success', `Dimona acceptée ! Période: ${result.periodId}`);
    } else {
      showMsg('error', result.error || 'Erreur lors de la déclaration');
    }
  };

  const handleApiCancel = async (id: string, reason: 'worker_cancelled' | 'no_show' | 'manager_cancelled') => {
    if (!confirm(reason === 'no_show' ? 'Le worker ne s\'est pas présenté. Annuler la Dimona ?' : 'Annuler cette déclaration Dimona ?')) return;
    setLoadingId(id);
    const result = await apiCancelDimona(id, reason);
    setLoadingId(null);
    if (result.success) {
      showMsg('success', 'Dimona annulée avec succès');
    } else {
      showMsg('error', result.error || 'Erreur lors de l\'annulation');
    }
  };

  const handleBatchDeclare = async () => {
    if (!confirm(`Déclarer ${counts.ready} Dimona en attente via l'API ONSS ?`)) return;
    setLoadingId('batch');
    const result = await apiBatchDeclareDimona();
    setLoadingId(null);
    if (result.count !== undefined) {
      showMsg(result.failed ? 'error' : 'success', `${result.count} déclarée(s)${result.failed ? `, ${result.failed} échouée(s)` : ''}`);
    }
  };

  const handleSyncONSS = async () => {
    if (!confirm('Vérifier les déclarations OK contre l\'API ONSS ? (quelques secondes)')) return;
    setLoadingId('sync');
    const result = await syncDimonaWithONSS();
    setLoadingId(null);
    if (result.updated > 0) {
      showMsg('success', `${result.checked} vérifiée(s) · ${result.updated} mise(s) à jour (annulées côté ONSS)`);
    } else {
      showMsg('success', `${result.checked} vérifiée(s) · tout est synchronisé`);
    }
  };

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id);

  const renderActions = (d: any, compact = false) => {
    const isLoading = loadingId === d.id;
    const sz = compact ? 'px-2 py-1 text-xs' : 'px-2.5 py-1 text-xs';
    const isNokOrError = d.status === 'nok' || d.status === 'error';

    return (
      <div className="flex gap-1 flex-wrap items-center">
        {/* Ready/Pending */}
        {(d.status === 'ready' || d.status === 'pending') && d.declaration_type === 'IN' && (
          <>
            <button onClick={() => handleApiDeclare(d.id)} disabled={isLoading || isPending}
              className={`bg-indigo-600 hover:bg-indigo-700 text-white ${sz} rounded-lg font-medium disabled:opacity-50 flex items-center gap-1`}>
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} API
            </button>
            <button onClick={() => handleCopy(d.id)}
              className={`bg-gray-100 hover:bg-gray-200 text-gray-600 ${sz} rounded-lg font-medium flex items-center gap-1`}>
              <Copy size={12} /> Copier
            </button>
            <button onClick={() => handleSetOk(d.id)} disabled={isPending}
              className={`bg-emerald-500 hover:bg-emerald-600 text-white ${sz} rounded-lg font-medium disabled:opacity-50`}>→ OK</button>
            <button onClick={() => handleSetNok(d.id)} disabled={isPending}
              className={`bg-red-100 hover:bg-red-200 text-red-600 ${sz} rounded-lg font-medium disabled:opacity-50`}>NOK</button>
          </>
        )}

        {/* OK: annuler / no-show */}
        {d.status === 'ok' && d.declaration_type === 'IN' && d.dimona_period_id && (
          <>
            <button onClick={() => handleApiCancel(d.id, 'manager_cancelled')} disabled={isLoading || isPending}
              className={`bg-red-500 hover:bg-red-600 text-white ${sz} rounded-lg font-medium disabled:opacity-50 flex items-center gap-1`}>
              {isLoading ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} Annuler
            </button>
            <button onClick={() => handleApiCancel(d.id, 'no_show')} disabled={isLoading || isPending}
              className={`bg-orange-500 hover:bg-orange-600 text-white ${sz} rounded-lg font-medium disabled:opacity-50 flex items-center gap-1`}>
              <UserX size={12} /> No-show
            </button>
          </>
        )}

        {/* NOK/Error: réessayer */}
        {isNokOrError && d.declaration_type === 'IN' && (
          <button onClick={() => handleApiDeclare(d.id)} disabled={isLoading || isPending}
            className={`bg-indigo-600 hover:bg-indigo-700 text-white ${sz} rounded-lg font-medium disabled:opacity-50 flex items-center gap-1`}>
            {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Réessayer
          </button>
        )}
      </div>
    );
  };

  const renderErrorDetail = (d: any) => {
    if (!['nok', 'error'].includes(d.status)) return null;
    const resp = d.onss_response;
    const anomalies = resp?.anomalies || [];
    const notes = d.notes;

    return (
      <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs space-y-1">
        {notes && <div className="text-red-700 font-medium">{notes}</div>}
        {anomalies.map((a: any, i: number) => (
          <div key={i} className="text-red-600">
            <span className="font-mono text-red-400 mr-1">{a.errorId || ''}</span>
            {a.label?.fr || a.descriptionFr || JSON.stringify(a)}
          </div>
        ))}
        <div className="text-gray-400 mt-1">
          worker_type déclaré : <span className="font-mono font-bold text-gray-600">{d.worker_type || '?'}</span>
          {d.worker_type === 'FLX' && d.flexi_workers?.status === 'student' && (
            <span className="ml-2 text-red-500 font-semibold">⚠️ Ce worker est STU — à corriger</span>
          )}
        </div>
        {resp?.declarationId && (
          <div className="text-gray-400">declarationId ONSS : <span className="font-mono">{resp.declarationId}</span></div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={24} className="text-gray-400" /> Déclarations Dimona
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">CP 302 · FLX/STU · ONSS · API v2</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSyncONSS} disabled={!!loadingId}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            title="Vérifier les périodes OK contre l'API ONSS">
            {loadingId === 'sync' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Sync ONSS
          </button>
          {counts.ready > 0 && (
            <button onClick={handleBatchDeclare} disabled={!!loadingId}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              {loadingId === 'batch' ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              Tout déclarer via API ({counts.ready})
            </button>
          )}
        </div>
      </div>

      {actionMsg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${actionMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {actionMsg.type === 'success' ? '✓ ' : '✕ '}{actionMsg.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Object.entries(counts).map(([status, count]) => {
          const key = status === 'ready' ? 'ready' : status;
          const s = statusStyles[key];
          const label = status === 'ready' ? 'À déclarer' : s?.label || status;
          return (
            <div key={status} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <div className={`text-2xl font-bold ${s?.text}`}>{count}</div>
              <div className="text-xs text-gray-400 mt-0.5">{label}</div>
            </div>
          );
        })}
      </div>

      {/* Mobile */}
      <div className="sm:hidden space-y-2 mb-4">
        {declarations.map((d: any) => {
          const s = statusStyles[d.status] || statusStyles.pending;
          const w = d.flexi_workers;
          const shift = d.shifts;
          const isExpanded = expandedId === d.id;
          const isNokOrError = d.status === 'nok' || d.status === 'error';

          return (
            <div key={d.id} className={`bg-white rounded-xl border shadow-sm p-3 ${d.status === 'cancelled' ? 'opacity-50' : ''} ${isNokOrError ? 'border-red-200' : 'border-gray-100'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>{s.icon} {s.label}</span>
                  <span className="text-[11px] font-mono text-gray-400">{d.declaration_type}</span>
                  <span className={`text-[11px] font-mono font-bold ${d.worker_type === 'STU' ? 'text-purple-600' : 'text-blue-600'}`}>{d.worker_type}</span>
                </div>
                {isNokOrError && (
                  <button onClick={() => toggleExpand(d.id)} className="text-gray-400 hover:text-gray-600">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-800">{w?.first_name} {w?.last_name}</span>
                <span className="text-xs text-gray-400">{d.locations?.name}</span>
              </div>
              <div className="text-xs text-gray-500 mb-2">
                {shift?.date ? new Date(shift.date).toLocaleDateString('fr-BE') : '—'} · {shift?.start_time?.slice(0, 5)}–{shift?.end_time?.slice(0, 5)}
              </div>
              {isExpanded && renderErrorDetail(d)}
              <div className="mt-2">{renderActions(d, true)}</div>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Statut</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Type</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Worker</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Date</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Horaire</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Location</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Période ONSS</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {declarations.map((d: any) => {
              const s = statusStyles[d.status] || statusStyles.pending;
              const w = d.flexi_workers;
              const shift = d.shifts;
              const isExpanded = expandedId === d.id;
              const isNokOrError = d.status === 'nok' || d.status === 'error';

              return (
                <>
                  <tr key={d.id}
                    className={`border-t border-gray-50 hover:bg-gray-50/50 ${d.status === 'cancelled' ? 'opacity-50' : ''} ${isNokOrError ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.icon} {s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                      {d.declaration_type}
                      <span className={`ml-1.5 font-bold ${d.worker_type === 'STU' ? 'text-purple-600' : 'text-blue-500'}`}>{d.worker_type}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{w?.first_name} {w?.last_name}</td>
                    <td className="px-4 py-3 text-gray-500">{shift?.date ? new Date(shift.date).toLocaleDateString('fr-BE') : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{shift?.start_time?.slice(0, 5)}–{shift?.end_time?.slice(0, 5)}</td>
                    <td className="px-4 py-3 text-gray-500">{d.locations?.name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-400">{d.dimona_period_id || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 items-center flex-wrap">
                        {renderActions(d)}
                        {isNokOrError && (
                          <button onClick={() => toggleExpand(d.id)}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100" title="Voir détail erreur">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && isNokOrError && (
                    <tr key={d.id + '-detail'} className="bg-red-50/50">
                      <td colSpan={8} className="px-4 pb-3">
                        {renderErrorDetail(d)}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
        <h4 className="text-sm font-bold text-indigo-800 mb-2">API ONSS intégrée (Phase 2)</h4>
        <div className="text-xs text-indigo-700 space-y-1">
          <p><strong>Bouton API</strong> : envoie la Dimona directement à l&apos;ONSS et récupère le résultat (~3 secondes)</p>
          <p><strong>NOK / Erreur</strong> : cliquez sur ▼ pour voir le détail de l&apos;erreur ONSS, puis <strong>Réessayer</strong> après correction</p>
          <p><strong>Annuler</strong> : annule une Dimona acceptée · <strong>No-show</strong> : worker absent</p>
          <p><strong>FLX</strong> = flexi-job · <strong>STU</strong> = étudiant (cotisation de solidarité)</p>
        </div>
        <div className="flex gap-3 mt-3">
          <a href="https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline font-medium">
            <ExternalLink size={12} /> Portail Dimona ONSS
          </a>
        </div>
      </div>

      {copyData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setCopyData(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Données copiées ✓</h3>
            <div className="bg-gray-50 rounded-xl p-4 text-xs font-mono space-y-1">
              {Object.entries(copyData).map(([k, v]) => (
                <div key={k}><span className="text-gray-400">{k}:</span> <span className="text-gray-800">{String(v)}</span></div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">Les données ont été copiées dans le presse-papier.</p>
            <button onClick={() => setCopyData(null)} className="w-full mt-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2 text-sm font-medium">Fermer</button>
          </div>
        </div>
      )}
    </>
  );
}
