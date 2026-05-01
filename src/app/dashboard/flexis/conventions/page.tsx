'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { signIndependentConvention } from '@/lib/actions/convention';
import { FileText, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

export default function DashboardConventionsPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      // Tous les shifts d'indépendants avec time_entry mais sans convention
      const { data } = await supabase
        .from('shifts')
        .select(`
          id, date, start_time, end_time, location_id, worker_id,
          flexi_workers!inner(id, first_name, last_name, status, hourly_rate, vat_applicable, vat_rate, vat_number, signature_url),
          locations(id, name)
        `)
        .eq('flexi_workers.status', 'independent')
        .in('status', ['accepted', 'completed'])
        .order('date', { ascending: false })
        .limit(50);

      if (!data) { setLoading(false); return; }

      // Filtrer ceux qui ont un time_entry mais pas de convention
      const shiftIds = data.map((s: any) => s.id);

      const { data: conventions } = await supabase
        .from('independent_conventions')
        .select('shift_id')
        .in('shift_id', shiftIds);

      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select('shift_id')
        .in('shift_id', shiftIds);

      const conventionShiftIds = new Set((conventions || []).map((c: any) => c.shift_id));
      const timeEntryShiftIds = new Set((timeEntries || []).map((t: any) => t.shift_id));

      // Garder uniquement ceux avec time_entry et sans convention
      const missing = data.filter((s: any) =>
        timeEntryShiftIds.has(s.id) && !conventionShiftIds.has(s.id)
      );

      setShifts(missing);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const handleGenerate = async (shift: any) => {
    const w = shift.flexi_workers;
    setGenerating(shift.id);

    const [sh, sm] = shift.start_time.split(':').map(Number);
    const [eh, em] = shift.end_time.split(':').map(Number);
    const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    const hourlyRate = w.hourly_rate || 18;
    const amountHtva = Math.round(hours * hourlyRate * 100) / 100;
    const vatRate = w.vat_applicable ? (w.vat_rate || 21) : 0;
    const vatAmount = Math.round(amountHtva * vatRate / 100 * 100) / 100;
    const amountTtc = Math.round((amountHtva + vatAmount) * 100) / 100;

    const result = await signIndependentConvention({
      shiftId: shift.id,
      workerId: w.id,
      locationId: shift.location_id,
      conventionDate: shift.date,
      startTime: shift.start_time.slice(0, 5),
      endTime: shift.end_time.slice(0, 5),
      hourlyRate,
      amountHtva,
      vatRate,
      vatAmount,
      amountTtc,
    });

    if (result.success || ('alreadySigned' in result && result.alreadySigned)) {
      setMessages((prev) => ({ ...prev, [shift.id]: 'ok' }));
      setShifts((prev) => prev.filter((s) => s.id !== shift.id));
    } else {
      setMessages((prev) => ({ ...prev, [shift.id]: 'error: ' + ('error' in result ? result.error : 'inconnu') }));
    }
    setGenerating(null);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conventions indépendants</h1>
          <p className="text-sm text-gray-400 mt-0.5">Shifts pointés sans convention générée</p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
          <Loader2 size={24} className="animate-spin mx-auto mb-2" />
          Chargement...
        </div>
      ) : shifts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
          <CheckCircle size={32} className="text-emerald-400 mx-auto mb-3" />
          <p className="font-medium text-gray-700">Tout est à jour</p>
          <p className="text-sm text-gray-400 mt-1">Tous les shifts indépendants ont leur convention</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Worker</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Date</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Lieu</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Horaire</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium">Montant</th>
                <th className="px-4 py-3 text-xs text-gray-500 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s: any) => {
                const w = s.flexi_workers;
                const [sh, sm] = s.start_time.split(':').map(Number);
                const [eh, em] = s.end_time.split(':').map(Number);
                const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
                const amountHtva = Math.round(hours * (w.hourly_rate || 18) * 100) / 100;
                const msg = messages[s.id];

                return (
                  <tr key={s.id} className="border-t border-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {w.first_name} {w.last_name}
                      <div className="text-xs text-amber-600 font-normal">{w.vat_number || 'N° TVA manquant'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(s.date).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.locations?.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                      <div className="text-xs text-gray-400">{hours.toFixed(1)}h</div>
                    </td>
                    <td className="px-4 py-3 text-gray-800 font-medium">{amountHtva.toFixed(2)} € HTVA</td>
                    <td className="px-4 py-3">
                      {msg === 'ok' ? (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <CheckCircle size={14} /> Généré
                        </span>
                      ) : msg?.startsWith('error') ? (
                        <span className="text-xs text-red-500 flex items-center gap-1">
                          <AlertTriangle size={14} /> {msg}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleGenerate(s)}
                          disabled={generating === s.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          {generating === s.id ? (
                            <><Loader2 size={12} className="animate-spin" /> Génération...</>
                          ) : (
                            <><FileText size={12} /> Générer</>
                          )}
                        </button>
                      )}
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
