'use client';

import { useEffect, useState } from 'react';
import { getStudentContracts } from '@/lib/actions/contract';
import { FileText, Download, CheckCircle } from 'lucide-react';

interface Props {
  workerId: string;
}

export default function StudentContractsList({ workerId }: Props) {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentContracts(workerId).then((result) => {
      if (result.data) setContracts(result.data);
      setLoading(false);
    });
  }, [workerId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-400">
        Chargement des contrats...
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center text-gray-400">
        <FileText size={24} className="mx-auto mb-2 opacity-50" />
        <p>Aucun contrat \u00e9tudiant sign\u00e9</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <FileText size={18} className="text-gray-400" />
          Mes contrats \u00e9tudiants ({contracts.length})
        </h3>
        <p className="text-xs text-gray-400 mt-0.5">Conserv\u00e9s 5 ans \u2013 pr\u00e9sentez-les en cas de contr\u00f4le</p>
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
                    {c.locations?.name} \u2022 {c.shifts?.start_time?.slice(0, 5)}\u2013{c.shifts?.end_time?.slice(0, 5)} \u2022 Valid\u00e9 \u00e0 {signedAt}
                  </p>
                </div>
              </div>
              <div className="text-xs text-gray-400 font-mono">
                {c.hourly_rate?.toFixed(2)}\u20ac/h
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
