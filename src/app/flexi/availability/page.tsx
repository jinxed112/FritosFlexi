'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setAvailability } from '@/lib/actions/availability';
import type { AvailabilityType } from '@/types';

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

type DayAvail = AvailabilityType[];

export default function FlexiAvailabilityPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(1); // 0-indexed, 1 = February
  const [availMap, setAvailMap] = useState<Record<string, DayAvail>>({});
  const [shifts, setShifts] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const supabase = createClient();

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: worker } = await supabase
      .from('flexi_workers')
      .select('id')
      .eq('user_id', user.id)
      .single();
    if (!worker) return;

    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = new Date(year, month + 1, 0);
    const end = endDate.toISOString().split('T')[0];

    const { data: avails } = await supabase
      .from('flexi_availabilities')
      .select('*')
      .eq('worker_id', worker.id)
      .gte('date', start)
      .lte('date', end);

    const map: Record<string, DayAvail> = {};
    (avails || []).forEach((a: any) => {
      if (!map[a.date]) map[a.date] = [];
      map[a.date].push(a.type);
    });
    setAvailMap(map);

    // Get accepted shifts for this month
    const { data: shiftData } = await supabase
      .from('shifts')
      .select('date')
      .eq('worker_id', worker.id)
      .in('status', ['accepted', 'completed'])
      .gte('date', start)
      .lte('date', end);

    const shiftMap: Record<string, boolean> = {};
    (shiftData || []).forEach((s: any) => { shiftMap[s.date] = true; });
    setShifts(shiftMap);
    setLoading(false);
  }, [supabase, year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleAvail = (dateStr: string) => {
    if (shifts[dateStr]) return; // Can't modify if shift exists

    const current = availMap[dateStr] || [];
    // Cycle: none → full_day → midi → soir → midi+soir → none
    let next: DayAvail;
    if (current.length === 0) next = ['full_day'];
    else if (current.includes('full_day')) next = ['midi'];
    else if (current.length === 1 && current[0] === 'midi') next = ['soir'];
    else if (current.length === 1 && current[0] === 'soir') next = ['midi', 'soir'];
    else next = [];

    setAvailMap((prev) => ({ ...prev, [dateStr]: next }));

    startTransition(async () => {
      await setAvailability(dateStr, next);
    });
  };

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDay.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const getAvailColor = (avails: DayAvail) => {
    if (avails.includes('full_day')) return 'bg-emerald-400 text-white';
    if (avails.includes('midi') && avails.includes('soir')) return 'bg-emerald-300 text-white';
    if (avails.includes('midi')) return 'bg-emerald-200 text-emerald-800';
    if (avails.includes('soir')) return 'bg-teal-200 text-teal-800';
    return 'bg-gray-100 text-gray-400';
  };

  const getAvailLabel = (avails: DayAvail) => {
    if (avails.includes('full_day')) return 'Jour';
    if (avails.includes('midi') && avails.includes('soir')) return 'M+S';
    if (avails.includes('midi')) return 'Midi';
    if (avails.includes('soir')) return 'Soir';
    return '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
          className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">←</button>
        <h2 className="text-sm font-bold text-gray-800">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
          className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">→</button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4 text-[10px]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400" />Journée</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200" />Midi</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-200" />Soir</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-400" />Shift planifié</span>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const avails = availMap[dateStr] || [];
            const hasShift = shifts[dateStr];
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            return (
              <button
                key={i}
                onClick={() => toggleAvail(dateStr)}
                disabled={!!hasShift}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all relative ${
                  hasShift
                    ? 'bg-blue-400 text-white cursor-not-allowed'
                    : getAvailColor(avails)
                } ${isToday ? 'ring-2 ring-orange-400' : ''}`}
              >
                <span className="font-bold">{day}</span>
                {!hasShift && avails.length > 0 && (
                  <span className="text-[8px] leading-none">{getAvailLabel(avails)}</span>
                )}
                {hasShift && <span className="text-[8px] leading-none">Shift</span>}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center mt-3">
        Tapez un jour pour changer votre disponibilité
      </p>
    </div>
  );
}
