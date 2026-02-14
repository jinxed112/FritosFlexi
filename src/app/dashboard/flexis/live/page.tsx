'use client';

import { useRealtimeTimeEntries } from '@/hooks';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Radio } from 'lucide-react';

export default function DashboardLivePage() {
  const today = new Date().toISOString().split('T')[0];
  const { entries, loading } = useRealtimeTimeEntries(today);
  const [shifts, setShifts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: locs } = await supabase.from('locations').select('*').eq('is_active', true);
      setLocations(locs || []);

      const { data: s } = await supabase
        .from('shifts')
        .select('*, flexi_workers(id, first_name, last_name), locations(name)')
        .eq('date', today)
        .in('status', ['accepted', 'completed']);
      setShifts(s || []);
    }
    load();
  }, [today, supabase]);

  if (loading) return <div className="py-10 text-center text-gray-400">Chargement...</div>;

  const now = new Date();

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Radio size={24} className="text-emerald-500" /> Live
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Temps réel — {now.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {locations.map((loc: any) => {
          const locShifts = shifts.filter((s: any) => s.location_id === loc.id);
          const locEntries = entries.filter((e: any) => locShifts.some((s: any) => s.id === e.shift_id));
          const activeEntries = locEntries.filter((e: any) => e.clock_in && !e.clock_out);

          return (
            <div key={loc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                {activeEntries.length > 0 && <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />}
                <h3 className="font-bold text-gray-900">{loc.name}</h3>
                <span className="ml-auto text-xs text-gray-400">{activeEntries.length} sur site</span>
              </div>

              {locShifts.length > 0 ? (
                <div className="space-y-2">
                  {locShifts.map((s: any) => {
                    const w = s.flexi_workers;
                    const entry = locEntries.find((e: any) => e.shift_id === s.id);
                    const isActive = entry?.clock_in && !entry?.clock_out;
                    const isDone = entry?.clock_in && entry?.clock_out;

                    return (
                      <div key={s.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs ${isActive ? 'bg-gradient-to-br from-orange-400 to-red-500' : isDone ? 'bg-blue-400' : 'bg-gray-300'}`}>
                          {w?.first_name?.[0] || '?'}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-800">{w?.first_name} {w?.last_name}</div>
                          <div className="text-xs text-gray-400">
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                            {entry?.clock_in && ` · IN ${new Date(entry.clock_in).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`}
                            {entry?.clock_out && ` → OUT ${new Date(entry.clock_out).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isActive ? 'bg-emerald-100 text-emerald-700' :
                          isDone ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-400'
                        }`}>
                          {isActive ? '● En cours' : isDone ? `${entry.actual_hours?.toFixed(1)}h` : 'Pas pointé'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucun shift aujourd&apos;hui</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
