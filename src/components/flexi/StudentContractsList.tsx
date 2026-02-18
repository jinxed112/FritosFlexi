'use client';

import { useEffect, useState } from 'react';
import { getStudentContracts } from '@/lib/actions/contract';
import { FileText, CheckCircle } from 'lucide-react';

interface Props {
  workerId: string;
}

export default function StudentContractsList({ workerId }: Props) {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStudentContracts(workerId).then((result) => {
      if (result.error) {
        console.error('StudentContractsList error:', result.error);
        setError(result.error);
      }
      if (result.data) setContracts(result.data);
      setLoading(false);
    });
  }, [workerId]);

  if (loading) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-100 text-center text-gray-400 text-sm py-4">
        Chargement des contrats...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="bg-red-50 rounded-2xl p-4 text-center text-red-500 text-sm">
          Erreur chargement contrats : {error}
        </div>
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-400">
          <FileText size={24} className="mx-auto mb-2 opacity-50" />
          <p>Aucun contrat étudiant signé</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-4 border-t border-gray-100">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <FileText size={18} className="text-gray-400" />
            Mes contrats étudiants ({contracts.length})
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">Conservés 5 ans – présentez-les en cas de contrôle</p>
        </div>

        <div className="divide-y divide-gray-50">
          {contracts.map((c: any) => {
            const date = new Date(c.contract_date).toLocaleDateString('fr-BE', {
              weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
            });
            const signedAt = new Date(c.signed_at).toLocaleString('fr-BE', {
              hour: '2-digit', minute: '2-digit'
            });

            return (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                    <CheckCircle size={16} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{date}</p>
                    <p className="text-xs text-gray-400">
                      {c.locations?.name} • {c.shifts?.start_time?.slice(0, 5)}–{c.shifts?.end_time?.slice(0, 5)} • Validé à {signedAt}
                    </p>
                  </div>
                </div>
                {c.contract_pdf_url && (
                  <a
                    href={c.contract_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                  >
                    PDF ↓
                  </a>
                )}
                <div className="text-xs text-gray-400 font-mono">
                  {c.hourly_rate?.toFixed(2)}€/h
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}