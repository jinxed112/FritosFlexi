'use client';

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setAvailability } from '@/lib/actions/availability';
import type { AvailabilityType } from '@/types';

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

type DayState = {
  type: AvailabilityType;
  preferred_location_id: string | null;
} | null;

type Location = { id: string; name: string };

function getAvailStyle(state: DayState) {
  if (!state) return { bg: 'bg-gray-100', text: 'text-gray-400' };
  switch (state.type) {
    case 'available':   return { bg: 'bg-emerald-400', text: 'text-white' };
    case 'flexible':    return { bg: 'bg-amber-300',   text: 'text-white' };
    case 'unavailable': return { bg: 'bg-red-300',     text: 'text-white' };
  }
}

function getAvailLabel(state: DayState) {
  if (!state) return '';
  switch (state.type) {
    case 'available':   return 'Dispo';
    case 'flexible':    return 'Flex';
    case 'unavailable': return 'Indispo';
  }
}

export default function FlexiAvailabilityPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [availMap, setAvailMap]                   = useState<Record<string, DayState>>({});
  const [shifts, setShifts]                       = useState<Record<string, boolean>>({});
  const [locations, setLocations]                 = useState<Location[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState<string | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [isPending, startTransition]              = useTransition();

  // Bottom sheet
  const [sheetOpen, setSheetOpen]         = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [sheetType, setSheetType]         = useState<AvailabilityType | null>(null);
  const [sheetLocation, setSheetLocation] = useState<string | null>(null);

  // Drag/swipe — tracked via pointer events on the grid container
  const isDragging     = useRef(false);
  const dragDatesRef   = useRef<Set<string>>(new Set());
  const [dragHighlight, setDragHighlight] = useState<Set<string>>(new Set());

  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: worker } = await supabase
      .from('flexi_workers')
      .select('id, default_location_id')
      .eq('user_id', user.id)
      .single();
    if (!worker) return;

    setDefaultLocationId(worker.default_location_id ?? null);

    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const end   = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const [{ data: avails }, { data: shiftData }, { data: locs }] = await Promise.all([
      supabase.from('flexi_availabilities').select('*').eq('worker_id', worker.id).gte('date', start).lte('date', end),
      supabase.from('shifts').select('date').eq('worker_id', worker.id).in('status', ['accepted', 'completed']).gte('date', start).lte('date', end),
      supabase.from('locations').select('id, name').eq('is_active', true).order('name'),
    ]);

    const map: Record<string, DayState> = {};
    (avails || []).forEach((a: any) => {
      map[a.date] = { type: a.type as AvailabilityType, preferred_location_id: a.preferred_location_id ?? null };
    });
    setAvailMap(map);

    const shiftMap: Record<string, boolean> = {};
    (shiftData || []).forEach((s: any) => { shiftMap[s.date] = true; });
    setShifts(shiftMap);

    setLocations(locs || []);
    setLoading(false);
  }, [supabase, year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Calendar grid ────────────────────────────────────────
  const startDow    = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today       = new Date().toISOString().split('T')[0];

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const toDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isPast = (dateStr: string) => dateStr < today;

  const canSelect = (dateStr: string) => !shifts[dateStr] && !isPast(dateStr);

  // ── Open bottom sheet ────────────────────────────────────
  const openSheet = (dates: string[]) => {
    if (dates.length === 0) return;
    setSelectedDates(dates);
    const existing = availMap[dates[0]];
    setSheetType(existing?.type ?? 'available');
    setSheetLocation(existing?.preferred_location_id ?? defaultLocationId);
    setSheetOpen(true);
  };

  // ── Pointer event handlers on the GRID CONTAINER ─────────
  // Pointer events unify mouse + touch and allow pointer capture,
  // which means we keep receiving pointermove even when finger
  // slides outside the originating element.

  const getDateAtPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('[data-date]')?.getAttribute('data-date') ?? null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const date = getDateAtPoint(e.clientX, e.clientY);
    if (!date || !canSelect(date)) return;
    e.preventDefault();
    isDragging.current = true;
    dragDatesRef.current = new Set([date]);
    setDragHighlight(new Set([date]));
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const date = getDateAtPoint(e.clientX, e.clientY);
    if (!date || !canSelect(date) || dragDatesRef.current.has(date)) return;
    dragDatesRef.current.add(date);
    setDragHighlight(new Set(dragDatesRef.current));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dates = Array.from(dragDatesRef.current);
    setDragHighlight(new Set());
    dragDatesRef.current = new Set();

    // Only open sheet on pointerUp for multi-day (single tap handled by onClick)
    if (dates.length > 1) {
      openSheet(dates);
    }
  };

  const handlePointerCancel = () => {
    isDragging.current = false;
    setDragHighlight(new Set());
    dragDatesRef.current = new Set();
  };

  // ── Single tap (click) ───────────────────────────────────
  const handleDayClick = (dateStr: string) => {
    if (!canSelect(dateStr)) return;
    // Ignore if this was the end of a drag gesture
    if (dragDatesRef.current.size > 1) return;
    openSheet([dateStr]);
  };

  // ── Save ─────────────────────────────────────────────────
  const handleSave = (type: AvailabilityType | null) => {
    const locId    = type === null ? null : (sheetLocation || null);
    const newState: DayState = type === null ? null : { type, preferred_location_id: locId };

    setAvailMap((prev) => {
      const next = { ...prev };
      selectedDates.forEach((d) => { next[d] = newState; });
      return next;
    });
    setSheetOpen(false);

    startTransition(async () => {
      for (const date of selectedDates) {
        await setAvailability(date, type, locId);
      }
    });
  };

  // ── Month navigation ─────────────────────────────────────
  const prevMonth = () => { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); };

  // ── Summary counts ───────────────────────────────────────
  const counts = Object.values(availMap).reduce((acc, s) => {
    if (!s) return acc;
    acc[s.type] = (acc[s.type] || 0) + 1;
    return acc;
  }, {} as Record<AvailabilityType, number>);

  // ─────────────────────────────────────────────────────────
  return (
    <div className="pb-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95 transition-all">←</button>
        <h2 className="text-base font-bold text-gray-800">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={nextMonth} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 active:scale-95 transition-all">→</button>
      </div>

      {/* Monthly summary */}
      {!loading && (
        <div className="flex gap-2 mb-4">
          {([
            { type: 'available'   as AvailabilityType, label: 'Disponible', color: 'bg-emerald-100 text-emerald-700' },
            { type: 'flexible'    as AvailabilityType, label: 'Flexible',   color: 'bg-amber-100 text-amber-700'     },
            { type: 'unavailable' as AvailabilityType, label: 'Indispo',    color: 'bg-red-100 text-red-600'         },
          ]).map(({ type, label, color }) => (
            <div key={type} className={`flex-1 rounded-xl px-2 py-2 text-center ${color}`}>
              <div className="text-lg font-bold">{counts[type] || 0}</div>
              <div className="text-[10px] font-medium">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-400" />Disponible</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-300"   />Flexible</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-300"     />Indispo</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-400"    />Shift planifié</span>
      </div>

      {/* Calendar grid — pointer events on container */}
      <div
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const dateStr   = toDateStr(day);
            const state     = availMap[dateStr] ?? null;
            const hasShift  = shifts[dateStr];
            const past      = isPast(dateStr);
            const isToday   = dateStr === today;
            const isDragSel = dragHighlight.has(dateStr);
            const style     = getAvailStyle(hasShift ? null : state);

            return (
              <button
                key={i}
                data-date={dateStr}
                onClick={() => handleDayClick(dateStr)}
                disabled={!!hasShift || past}
                className={[
                  'aspect-square rounded-xl flex flex-col items-center justify-center text-xs transition-all',
                  isDragSel                  ? 'scale-90 brightness-110 ring-2 ring-orange-400 ring-offset-1' : '',
                  hasShift                   ? 'bg-blue-400 text-white cursor-not-allowed' : '',
                  !hasShift && past          ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : '',
                  !hasShift && !past         ? `${style.bg} ${style.text} cursor-pointer` : '',
                  isToday && !isDragSel      ? 'ring-2 ring-orange-400 ring-offset-1' : '',
                ].join(' ')}
              >
                <span className="font-bold text-[13px] leading-none">{day}</span>
                {hasShift && <span className="text-[8px] mt-0.5 leading-none opacity-80">Shift</span>}
                {!hasShift && !past && state && (
                  <span className="text-[8px] mt-0.5 leading-none opacity-90">{getAvailLabel(state)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center mt-3">
        Tapez un jour · Glissez sur plusieurs jours pour sélectionner en masse
      </p>
      {isPending && <p className="text-[11px] text-orange-500 text-center mt-1">Sauvegarde...</p>}

      {/* ── BOTTOM SHEET ── */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSheetOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-md mx-auto px-5 pt-4 pb-8">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

            <h3 className="font-bold text-gray-900 text-base mb-1">
              {selectedDates.length === 1
                ? new Date(selectedDates[0] + 'T00:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
                : `${selectedDates.length} jours sélectionnés`}
            </h3>
            <p className="text-xs text-gray-400 mb-5">Choisissez votre disponibilité</p>

            {/* Choices */}
            <div className="space-y-2.5 mb-5">
              {([
                { type: 'available'   as AvailabilityType, emoji: '🟢', label: 'Disponible',  desc: 'Je veux travailler ce jour',   active: 'border-emerald-400 bg-emerald-50' },
                { type: 'flexible'    as AvailabilityType, emoji: '🟡', label: 'Flexible',     desc: 'Je peux me libérer si besoin', active: 'border-amber-400 bg-amber-50'     },
                { type: 'unavailable' as AvailabilityType, emoji: '🔴', label: 'Indisponible', desc: 'Ne pas me contacter',          active: 'border-red-400 bg-red-50'         },
              ]).map(({ type, emoji, label, desc, active }) => (
                <button
                  key={type}
                  onClick={() => setSheetType(type)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all ${sheetType === type ? active : 'border-gray-100'}`}
                >
                  <span className="text-xl">{emoji}</span>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-gray-800 text-sm">{label}</div>
                    <div className="text-xs text-gray-400">{desc}</div>
                  </div>
                  {sheetType === type && <span className="text-lg">✓</span>}
                </button>
              ))}
            </div>

            {/* Site preference */}
            {sheetType !== 'unavailable' && locations.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-gray-500 mb-2">Site préféré</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSheetLocation(null)}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${sheetLocation === null ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-100 text-gray-500'}`}
                  >
                    Les deux
                  </button>
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => setSheetLocation(loc.id)}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${sheetLocation === loc.id ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-gray-100 text-gray-500'}`}
                    >
                      {loc.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handleSave(null)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-500 font-medium text-sm"
              >
                Effacer
              </button>
              <button
                onClick={() => handleSave(sheetType)}
                disabled={!sheetType}
                className="flex-[2] py-3 rounded-2xl bg-orange-500 text-white font-semibold text-sm disabled:opacity-50"
              >
                Confirmer
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
