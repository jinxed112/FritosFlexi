'use client';

import { useTransition } from 'react';
import { validateTimeEntry } from '@/lib/actions/clock';
import { calculateCost, formatEuro } from '@/utils';
import { CheckSquare } from 'lucide-react';

interface Props {
  entries: any[];
}

export default function ValidationTable({ entries }: Props) {
  const [isPending, startTransition] = useTransition();

  const handleValidate = (id: string) => {
    startTransition(() => validateTimeEntry(id));
  };

  const handleValidateAll = () => {
    startTransition(async () => {
      for (const e of entries) {
        await validateTimeEntry(e.id);
      }
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Validation</h1>
          <p className="text-sm text-gray-400 mt-0.5">{entries.length} entrée(s) à valider</p>
        </div>
        {entries.length > 0 && (
          <button onClick={handleValidateAll} disabled={isPending}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1">
            <CheckSquare size={16} /> Tout valider
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
          <div className="text-4xl mb-2">✓</div>
          <p className="font-medium">Toutes les heures sont validées</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Worker</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Date</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Location</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Pointage</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Heures</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Géoloc</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Coût</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any) => {
                const w = e.flexi_workers;
                const s = e.shifts;
                const cost = e.actual_hours ? calculateCost(e.actual_hours, w?.hourly_rate || 12.53) : null;
                const clockIn = e.clock_in ? new Date(e.clock_in).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '—';
                const clockOut = e.clock_out ? new Date(e.clock_out).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '—';

                return (
                  <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-800">{w?.first_name} {w?.last_name}</td>
                    <td className="px-4 py-3 text-gray-500">{s?.date ? new Date(s.date).toLocaleDateString('fr-BE') : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{s?.locations?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{clockIn} → {clockOut}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{e.actual_hours ? `${e.actual_hours.toFixed(1)}h` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={e.geo_valid_in ? 'text-emerald-500' : 'text-red-500'}>{e.geo_valid_in ? '✓' : '✕'}</span>
                      {' / '}
                      <span className={e.geo_valid_out ? 'text-emerald-500' : 'text-red-500'}>{e.geo_valid_out ? '✓' : '✕'}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{cost ? formatEuro(cost.total_cost) : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleValidate(e.id)} disabled={isPending}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                        Valider
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
