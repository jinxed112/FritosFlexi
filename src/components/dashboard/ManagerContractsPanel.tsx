'use client';

import { useEffect, useState } from 'react';
import { getWorkerContractsAsManager } from '@/lib/actions/contract';
import { FileText, CheckCircle, ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react';

interface Props {
  workerId: string;
  workerName: string;
}

export default function ManagerContractsPanel({ workerId, workerName }: Props) {
  const [contracts, setContracts] = useState<any[]>([]);
  const [frameworkContract, setFrameworkContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedMonth(null);
    getWorkerContractsAsManager(workerId).then((result) => {
      if (result.error) setError(result.error);
      if (result.studentContracts) setContracts(result.studentContracts);
      if (result.frameworkContract) setFrameworkContract(result.frameworkContract);
      setLoading(false);
    });
  }, [workerId]);

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm py-12">
        <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        Chargement des contrats...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 rounded-xl p-4 text-center text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  // Month grouping
  const months = [...new Set(contracts.map(c => {
    const d = new Date(c.contract_date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }))].sort().reverse();

  const showFilter = contracts.length > 5;

  const filtered = selectedMonth
    ? contracts.filter(c => {
        const d = new Date(c.contract_date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === selectedMonth;
      })
    : contracts;

  const currentIdx = selectedMonth ? months.indexOf(selectedMonth) : -1;

  const formatMonth = (m: string) => {
    const [y, mo] = m.split('-');
    return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
  };

  // Total hours from contracts
  const totalHours = contracts.reduce((sum, c) => {
    const [sh, sm] = (c.start_time || '0:0').split(':').map(Number);
    const [eh, em] = (c.end_time || '0:0').split(':').map(Number);
    return sum + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  }, 0);

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{contracts.length}</div>
          <div className="text-[11px] text-gray-400 font-medium">Contrats étudiants</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{totalHours.toFixed(1)}h</div>
          <div className="text-[11px] text-gray-400 font-medium">Heures contractuées</div>
        </div>
      </div>

      {/* Framework contract */}
      <div className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider mb-2">Contrat-cadre</div>
        {frameworkContract?.framework_contract_date ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-500" />
              <span className="text-sm font-medium text-gray-800">
                Signé le {new Date(frameworkContract.framework_contract_date).toLocaleDateString('fr-BE')}
              </span>
            </div>
            {frameworkContract.framework_contract_url && (
              <a href={frameworkContract.framework_contract_url} target="_blank" rel="noopener noreferrer"
                className="text-xs px-2.5 py-1 bg-orange-50 text-orange-600 rounded-full hover:bg-orange-100 transition-colors font-medium flex items-center gap-1">
                <ExternalLink size={12} /> PDF
              </a>
            )}
          </div>
        ) : (
          <div className="text-sm text-red-400 italic">Non signé</div>
        )}
      </div>

      {/* Student contracts */}
      {contracts.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400">
          <FileText size={24} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucun contrat étudiant signé</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100">
            <div className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">
              Contrats étudiants ({contracts.length})
            </div>
          </div>

          {/* Month filter */}
          {showFilter && (
            <div className="px-3 py-2 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
              <button
                onClick={() => { if (currentIdx < months.length - 1) setSelectedMonth(months[currentIdx + 1]); }}
                disabled={selectedMonth !== null && currentIdx >= months.length - 1}
                className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} className="text-gray-500" />
              </button>
              <button
                onClick={() => setSelectedMonth(selectedMonth ? null : months[0])}
                className="text-xs font-medium text-gray-600 hover:text-orange-500 transition-colors px-2 py-0.5 rounded hover:bg-orange-50"
              >
                {selectedMonth ? formatMonth(selectedMonth) : `Tous (${contracts.length})`}
              </button>
              <button
                onClick={() => { if (currentIdx > 0) setSelectedMonth(months[currentIdx - 1]); else if (currentIdx === 0) setSelectedMonth(null); }}
                disabled={selectedMonth === null || currentIdx <= 0}
                className="p-1 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>
          )}

          {/* Contract rows */}
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
            {filtered.map((c: any) => {
              const date = new Date(c.contract_date).toLocaleDateString('fr-BE', {
                weekday: 'short', day: 'numeric', month: 'short'
              });
              const signedAt = new Date(c.signed_at).toLocaleString('fr-BE', {
                hour: '2-digit', minute: '2-digit'
              });

              return (
                <div key={c.id} className="px-3 py-2.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={14} className="text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">{date}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {c.locations?.name} • {c.shifts?.start_time?.slice(0, 5)}–{c.shifts?.end_time?.slice(0, 5)} • {signedAt}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.contract_pdf_url ? (
                      <a href={c.contract_pdf_url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] px-2 py-1 bg-orange-50 text-orange-600 rounded-full hover:bg-orange-100 transition-colors font-medium flex items-center gap-1">
                        <Download size={10} /> PDF
                      </a>
                    ) : (
                      <span className="text-[10px] text-gray-300">Pas de PDF</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
