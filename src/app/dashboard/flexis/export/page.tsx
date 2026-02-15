'use client';

import { useState, useTransition, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { generateExport, generateCSV } from '@/lib/actions/export';
import { formatEuro } from '@/utils';
import { FLEXI_CONSTANTS } from '@/types';
import { Download, FileSpreadsheet } from 'lucide-react';

export default function DashboardExportPage() {
  const [period, setPeriod] = useState<'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState<any>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  useEffect(() => {
    const now = new Date();
    const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const me = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setStartDate(ms);
    setEndDate(me);
  }, []);

  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateExport(startDate, endDate);
      if (result.data) setData(result.data);
    });
  };

  const handleDownloadCSV = () => {
    startTransition(async () => {
      const result = await generateCSV(startDate, endDate);
      if ('csv' in result && result.csv) {
        const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export-partena-${startDate}-${endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Export Partena</h1>
          <p className="text-sm text-gray-400 mt-0.5">Génération fichier CSV pour Partena Professional</p>
        </div>
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date début</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date fin</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm" />
          </div>
          <button onClick={handleGenerate} disabled={isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1">
            <FileSpreadsheet size={16} /> Générer
          </button>
          {data && (
            <button onClick={handleDownloadCSV} disabled={isPending}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1">
              <Download size={16} /> Télécharger CSV
            </button>
          )}
        </div>
      </div>

      {data && (
        <>
          {/* Summary table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">Worker</th>
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">NISS</th>
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">Shifts</th>
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">Heures</th>
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">Salaire brut</th>
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">Primes dim.</th>
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">Cot. 28%</th>
                  <th className="px-4 py-3 text-xs text-gray-500 font-medium">Coût total</th>
                </tr>
              </thead>
              <tbody>
                {data.workers.map((w: any) => (
                  <tr key={w.worker_id} className="border-t border-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{w.first_name} {w.last_name}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{w.niss || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{w.shifts}</td>
                    <td className="px-4 py-3 text-gray-600">{w.total_hours.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-gray-800">{formatEuro(w.base_salary)}</td>
                    <td className="px-4 py-3 text-gray-600">{w.sunday_premium > 0 ? formatEuro(w.sunday_premium) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{formatEuro(w.employer_contribution)}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{formatEuro(w.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-gray-900 border-t-2 border-gray-200">
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3">{data.totals.shifts}</td>
                  <td className="px-4 py-3">{data.totals.hours.toFixed(1)}h</td>
                  <td className="px-4 py-3">{formatEuro(data.totals.salary)}</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3">{formatEuro(data.totals.contributions)}</td>
                  <td className="px-4 py-3 text-orange-600">{formatEuro(data.totals.cost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Cost comparison */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center bg-emerald-50 border-emerald-200">
              <p className="text-xs text-emerald-600 font-medium">Coût direct</p>
              <p className="text-xl font-bold text-emerald-700">{formatEuro(data.totals.cost)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-xs text-gray-500 font-medium">Via NowJobs</p>
              <p className="text-xl font-bold text-gray-600">{formatEuro(data.totals.hours * FLEXI_CONSTANTS.NOWJOBS_HOURLY_COST)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center bg-orange-50 border-orange-200">
              <p className="text-xs text-orange-600 font-medium">Économie</p>
              <p className="text-xl font-bold text-orange-600">
                {formatEuro((data.totals.hours * FLEXI_CONSTANTS.NOWJOBS_HOURLY_COST) - data.totals.cost)}
              </p>
            </div>
          </div>
        </>
      )}

      {!data && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
          <FileSpreadsheet size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Sélectionnez une période et cliquez Générer</p>
        </div>
      )}
    </>
  );
}
