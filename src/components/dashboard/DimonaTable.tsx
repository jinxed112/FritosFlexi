'use client';

import { useTransition, useState } from 'react';
import { updateDimonaStatus, getDimonaForCopy } from '@/lib/actions/dimona';
import { FileText, Copy, ExternalLink } from 'lucide-react';

const statusStyles: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  ok: { bg: 'bg-emerald-100', text: 'text-emerald-800', icon: '✓', label: 'OK' },
  ready: { bg: 'bg-amber-100', text: 'text-amber-800', icon: '⏳', label: 'Prêt' },
  pending: { bg: 'bg-gray-100', text: 'text-gray-600', icon: '○', label: 'En attente' },
  nok: { bg: 'bg-red-100', text: 'text-red-700', icon: '✕', label: 'NOK' },
  sent: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '→', label: 'Envoyé' },
  error: { bg: 'bg-red-100', text: 'text-red-700', icon: '!', label: 'Erreur' },
};

interface Props {
  declarations: any[];
}

export default function DimonaTable({ declarations }: Props) {
  const [isPending, startTransition] = useTransition();
  const [copyData, setCopyData] = useState<any>(null);

  const counts = {
    ok: declarations.filter((d) => d.status === 'ok').length,
    ready: declarations.filter((d) => d.status === 'ready').length,
    sent: declarations.filter((d) => d.status === 'sent').length,
    nok: declarations.filter((d) => d.status === 'nok').length,
  };

  const handleCopy = async (id: string) => {
    const result = await getDimonaForCopy(id);
    if (result.data) {
      setCopyData(result.data);
      const text = Object.entries(result.data).map(([k, v]) => `${k}: ${v}`).join('\n');
      navigator.clipboard.writeText(text);
    }
  };

  const handleSetOk = (id: string) => {
    startTransition(() => updateDimonaStatus(id, 'ok'));
  };

  const handleSetNok = (id: string) => {
    startTransition(() => updateDimonaStatus(id, 'nok'));
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText size={24} className="text-gray-400" /> Déclarations Dimona
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">CP 302 · Type FLX · ONSS</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {Object.entries(counts).map(([status, count]) => {
          const s = statusStyles[status];
          return (
            <div key={status} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <div className={`text-2xl font-bold ${s.text}`}>{count}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Statut</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Worker</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Date</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Horaire</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Location</th>
              <th className="px-4 py-3 text-xs text-gray-500 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {declarations.map((d: any) => {
              const s = statusStyles[d.status] || statusStyles.pending;
              const w = d.flexi_workers;
              const shift = d.shifts;

              return (
                <tr key={d.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
                      {s.icon} {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{w?.first_name} {w?.last_name}</td>
                  <td className="px-4 py-3 text-gray-500">{shift?.date ? new Date(shift.date).toLocaleDateString('fr-BE') : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{shift?.start_time?.slice(0, 5)}–{shift?.end_time?.slice(0, 5)}</td>
                  <td className="px-4 py-3 text-gray-500">{d.locations?.name}</td>
                  <td className="px-4 py-3">
                    {d.status === 'ready' && (
                      <div className="flex gap-1">
                        <button onClick={() => handleCopy(d.id)}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1">
                          <Copy size={12} /> Copier
                        </button>
                        <button onClick={() => handleSetOk(d.id)} disabled={isPending}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                          → OK
                        </button>
                        <button onClick={() => handleSetNok(d.id)} disabled={isPending}
                          className="bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                          NOK
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <h4 className="text-sm font-bold text-blue-800 mb-2">Workflow semi-automatique (Phase 1)</h4>
        <div className="text-xs text-blue-700 space-y-1">
          <p>1. Le flexi accepte un shift → Dimona pré-remplie en statut &quot;Prêt&quot;</p>
          <p>2. Cliquez &quot;Copier&quot; → copiez les données dans le portail ONSS</p>
          <p>3. Déclarez sur le portail → revenez mettre le statut à OK ou NOK</p>
        </div>
        <a href="https://www.socialsecurity.be/site_fr/employer/applics/dimona/index.htm"
          target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-3 font-medium">
          <ExternalLink size={12} /> Ouvrir le portail Dimona ONSS
        </a>
      </div>

      {/* Copy data modal */}
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
