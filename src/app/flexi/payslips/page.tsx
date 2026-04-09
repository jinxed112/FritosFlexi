'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FileText, Download, Loader2, Eye } from 'lucide-react';

interface Payslip {
  id: string;
  period_start: string;
  period_end: string;
  net_salary: number | null;
  gross_salary: number | null;
  hours_worked: string | null;
  establishment: string | null;
  viewed_at: string | null;
  created_at: string;
}

export default function WorkerPayslipsPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayslips = async () => {
      const { getMyPayslips } = await import('@/lib/actions/payslips');
      const result = await getMyPayslips();
      if (result.data) setPayslips(result.data as Payslip[]);
      setLoading(false);
    };
    fetchPayslips();
  }, []);

  const handleDownload = async (payslip: Payslip) => {
    setDownloading(payslip.id);
    try {
      const res = await fetch(`/api/payslips/download?id=${payslip.id}`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
        // Mark as viewed locally
        setPayslips(prev =>
          prev.map(p =>
            p.id === payslip.id && !p.viewed_at
              ? { ...p, viewed_at: new Date().toISOString() }
              : p
          )
        );
      } else {
        alert(data.error || 'Erreur téléchargement');
      }
    } catch {
      alert('Erreur réseau');
    }
    setDownloading(null);
  };

  const formatPeriod = (start: string) => {
    const d = new Date(start + 'T00:00:00');
    const label = d.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const formatMoney = (n: number | null) =>
    n !== null ? `${n.toFixed(2).replace('.', ',')} €` : '—';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-orange-500" />
      </div>
    );
  }

  if (payslips.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <FileText size={28} className="text-gray-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Pas encore de fiche de paie
        </h2>
        <p className="text-sm text-gray-500">
          Vos fiches de paie apparaîtront ici dès qu'elles seront disponibles.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Mes fiches de paie
      </h2>

      <div className="space-y-3">
        {payslips.map((payslip) => {
          const isNew = !payslip.viewed_at;
          return (
            <div
              key={payslip.id}
              className={`relative bg-white rounded-2xl border transition-colors ${
                isNew
                  ? 'border-orange-200 shadow-sm'
                  : 'border-gray-200'
              }`}
            >
              {/* New badge */}
              {isNew && (
                <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  NOUVEAU
                </div>
              )}

              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isNew ? 'bg-orange-100' : 'bg-gray-100'
                    }`}>
                      <FileText size={20} className={isNew ? 'text-orange-600' : 'text-gray-500'} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {formatPeriod(payslip.period_start)}
                      </p>
                      {payslip.establishment && (
                        <p className="text-xs text-gray-500">{payslip.establishment}</p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownload(payslip)}
                    disabled={downloading === payslip.id}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isNew
                        ? 'bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
                    }`}
                  >
                    {downloading === payslip.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Download size={16} />
                    )}
                    {isNew ? 'Consulter' : 'Télécharger'}
                  </button>
                </div>

                {/* Details */}
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                  {payslip.net_salary !== null && (
                    <div>
                      <p className="text-xs text-gray-500">Net</p>
                      <p className="text-sm font-bold text-gray-900">
                        {formatMoney(payslip.net_salary)}
                      </p>
                    </div>
                  )}
                  {payslip.gross_salary !== null && (
                    <div>
                      <p className="text-xs text-gray-500">Brut</p>
                      <p className="text-sm font-medium text-gray-600">
                        {formatMoney(payslip.gross_salary)}
                      </p>
                    </div>
                  )}
                  {payslip.hours_worked && (
                    <div>
                      <p className="text-xs text-gray-500">Heures</p>
                      <p className="text-sm font-medium text-gray-600">
                        {payslip.hours_worked}
                      </p>
                    </div>
                  )}
                  <div className="flex-1" />
                  {payslip.viewed_at && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Eye size={12} />
                      Consulté
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
