'use client';

import { useEffect, useState } from 'react';
import { getIndependentConventions } from '@/lib/actions/convention';
import { FileText, CheckCircle, ChevronLeft, ChevronRight, Euro } from 'lucide-react';

interface Props {
  workerId: string;
}

export default function IndependentConventionsList({ workerId }: Props) {
  const [conventions, setConventions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    getIndependentConventions(workerId).then((result) => {
      if (result.error) {
        setError(result.error);
      }
      if (result.data) setConventions(result.data);
      setLoading(false);
    });
  }, [workerId]);

  if (loading) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-100 text-center text-gray-400 text-sm py-4">
        Chargement des conventions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="bg-red-50 rounded-2xl p-4 text-center text-red-500 text-sm">
          Erreur chargement conventions : {error}
        </div>
      </div>
    );
  }

  if (conventions.length === 0) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-400">
          <FileText size={24} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucune convention de prestation</p>
          <p className="text-xs mt-1 text-gray-300">Elles seront générées automatiquement à chaque pointage</p>
        </div>
      </div>
    );
  }

  // Grouper par mois
  const months = [...new Set(conventions.map(c => {
    const d = new Date(c.convention_date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))].sort().reverse();

  const showFilter = conventions.length > 5;

  const filtered = selectedMonth
    ? conventions.filter(c => {
        const d = new Date(c.convention_date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === selectedMonth;
      })
    : conventions;

  const currentIdx = selectedMonth ? months.indexOf(selectedMonth) : -1;

  const formatMonth = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
  };

  // Total HTVA du mois sélectionné
  const totalHtva = filtered.reduce((sum, c) => sum + (c.amount_htva || 0), 0);
  const totalTtc  = filtered.reduce((sum, c) => sum + (c.amount_ttc  || 0), 0);

  return (
    <div className="mt-6 pt-4 border-t border-gray-100">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <FileText size={18} className="text-amber-500" />
            Mes conventions de prestation ({conventions.length})
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Générées automatiquement à chaque pointage — à conserver pour vos déclarations</p>
        </div>

        {/* Filtre mois */}
        {showFilter && (
          <div className="px-4 py-2 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
            <button
              onClick={() => { if (currentIdx < months.length - 1) setSelectedMonth(months[currentIdx + 1]); }}
              disabled={selectedMonth !== null && currentIdx >= months.length - 1}
              className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={18} className="text-gray-500" />
            </button>
            <button
              onClick={() => setSelectedMonth(selectedMonth ? null : months[0])}
              className="text-sm font-medium text-gray-600 hover:text-amber-500 transition-colors px-3 py-1 rounded-lg hover:bg-amber-50"
            >
              {selectedMonth ? formatMonth(selectedMonth) : `Tous (${conventions.length})`}
            </button>
            <button
              onClick={() => { if (currentIdx > 0) setSelectedMonth(months[currentIdx - 1]); else if (currentIdx === 0) setSelectedMonth(null); }}
              disabled={selectedMonth === null || currentIdx <= 0}
              className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={18} className="text-gray-500" />
            </button>
          </div>
        )}

        {/* Liste */}
        <div className="divide-y divide-gray-50">
          {filtered.map((c: any) => {
            const date = new Date(c.convention_date).toLocaleDateString('fr-BE', {
              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
            });
            const signedAt = new Date(c.signed_at).toLocaleString('fr-BE', {
              hour: '2-digit', minute: '2-digit',
            });
            const hasVat = c.vat_rate > 0;

            return (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={16} className="text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{date}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {c.locations?.name} • {c.shifts?.start_time?.slice(0, 5)}–{c.shifts?.end_time?.slice(0, 5)} • Validé à {signedAt}
                    </p>
                    <p className="text-xs font-medium text-amber-700 mt-0.5">
                      {c.amount_htva?.toFixed(2)} € HTVA
                      {hasVat && ` → ${c.amount_ttc?.toFixed(2)} € TTC`}
                      {!hasVat && <span className="text-gray-400 font-normal"> (franchise TVA)</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {c.convention_pdf_url && (
                    <a
                      href={c.convention_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] px-2 py-1 bg-amber-50 text-amber-600 rounded-full hover:bg-amber-100 transition-colors font-medium"
                    >
                      PDF ↓
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Total période */}
        {filtered.length > 1 && (
          <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex justify-between items-center">
            <span className="text-xs font-medium text-amber-700">
              Total {selectedMonth ? formatMonth(selectedMonth) : '2026'}
            </span>
            <span className="text-sm font-bold text-amber-800">
              {totalHtva.toFixed(2)} € HTVA
              {totalTtc !== totalHtva && ` / ${totalTtc.toFixed(2)} € TTC`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
