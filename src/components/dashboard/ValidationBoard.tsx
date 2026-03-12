'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { validateTimeEntry, correctTimeEntry, createManualTimeEntry } from '@/lib/actions/clock';
import { cancelShiftFromValidation } from '@/lib/actions/cancel-shift';
import { calculateCost, formatEuro } from '@/utils';
import {
  CheckSquare, Clock, AlertTriangle, Pencil, XCircle,
  CheckCircle2, Plus, ChevronDown, ChevronUp, Calendar,
  MapPin, X,
} from 'lucide-react';

const MONTH_NAMES = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
const DAY_NAMES = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (iso === today) return 'Aujourd\'hui';
  if (iso === yesterday) return 'Hier';
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function formatH(h: number) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}h${String(mins).padStart(2, '0')}` : `${hrs}h`;
}

function getBillableInfo(entry: any) {
  const s = entry.shifts;
  const clockIn = new Date(entry.clock_in);
  const clockOut = new Date(entry.clock_out);
  const shiftDate = s?.date || clockIn.toISOString().split('T')[0];
  const [sh, sm] = (s?.start_time || '17:00').split(':').map(Number);
  const [eh, em] = (s?.end_time || '21:30').split(':').map(Number);
  const shiftStart = new Date(`${shiftDate}T${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}:00`);
  const shiftEnd = new Date(`${shiftDate}T${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}:00`);
  const actualHours = (clockOut.getTime() - clockIn.getTime()) / 3600000;
  const earlyMinutes = clockIn < shiftStart ? Math.round((shiftStart.getTime() - clockIn.getTime()) / 60000) : 0;
  const lateMinutes = clockOut > shiftEnd ? Math.round((clockOut.getTime() - shiftEnd.getTime()) / 60000) : 0;
  return {
    billableHours: Math.round(actualHours * 100) / 100,
    actualHours: Math.round(actualHours * 100) / 100,
    earlyMinutes, lateMinutes,
    shiftStart: s?.start_time?.slice(0, 5) || '—',
    shiftEnd: s?.end_time?.slice(0, 5) || '—',
    clockInStr: clockIn.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }),
    clockOutStr: clockOut.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }),
  };
}

interface Props {
  allPending: any[];
  allValidated: any[];
  allMissing: any[];
  allOpen: any[];
  from: string;
  to: string;
}

export default function ValidationBoard({ allPending, allValidated, allMissing, allOpen, from, to }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<any>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [manualShift, setManualShift] = useState<any>(null);
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [manualError, setManualError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  // Filter by date range
  const inRange = (date: string) => date >= from && date <= to;

  const pending = allPending.filter((e) => inRange(e.shifts?.date || ''));
  const validated = allValidated.filter((e) => inRange(e.shifts?.date || ''));
  const missing = allMissing.filter((s) => inRange(s.date || ''));
  const open = allOpen.filter((e) => inRange(e.shifts?.date || ''));

  // Group everything by date
  const byDate = useMemo(() => {
    const map: Record<string, { pending: any[]; validated: any[]; missing: any[]; open: any[] }> = {};
    const ensure = (d: string) => { if (!map[d]) map[d] = { pending: [], validated: [], missing: [], open: [] }; };
    pending.forEach((e) => { const d = e.shifts?.date; if (d) { ensure(d); map[d].pending.push(e); } });
    validated.forEach((e) => { const d = e.shifts?.date; if (d) { ensure(d); map[d].validated.push(e); } });
    missing.forEach((s) => { const d = s.date; if (d) { ensure(d); map[d].missing.push(s); } });
    open.forEach((e) => { const d = e.shifts?.date; if (d) { ensure(d); map[d].open.push(e); } });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [pending, validated, missing, open]);

  const totalPending = allPending.length;
  const totalMissing = allMissing.length;
  const totalOpen = allOpen.length;

  // Quick range presets
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const setRange = (f: string, t: string) => {
    router.push(`/dashboard/flexis/validation?from=${f}&to=${t}`);
    setShowDatePicker(false);
  };

  const isPreset = (f: string, t: string) => from === f && to === t;

  // Actions
  const handleValidate = (id: string) => {
    startTransition(async () => { await validateTimeEntry(id); router.refresh(); });
  };

  const handleValidateAllDay = (entries: any[]) => {
    startTransition(async () => {
      for (const e of entries) await validateTimeEntry(e.id);
      router.refresh();
    });
  };

  const handleValidateAll = () => {
    startTransition(async () => {
      for (const e of pending) await validateTimeEntry(e.id);
      router.refresh();
    });
  };

  const handleCancel = (id: string) => {
    startTransition(async () => {
      const result = await cancelShiftFromValidation(id);
      if (result.error) alert(result.error);
      setCancelConfirmId(null);
      router.refresh();
    });
  };

  const openEdit = (entry: any) => {
    setEditingEntry(entry);
    setEditStart(new Date(entry.clock_in).toTimeString().slice(0, 5));
    // Si pas de clock_out, pré-remplir avec l'heure de fin du shift
    const fallbackEnd = entry.shifts?.end_time?.slice(0, 5) || new Date().toTimeString().slice(0, 5);
    setEditEnd(entry.clock_out ? new Date(entry.clock_out).toTimeString().slice(0, 5) : fallbackEnd);
  };

  const saveEdit = () => {
    if (!editingEntry) return;
    const shiftDate = editingEntry.shifts?.date || new Date(editingEntry.clock_in).toISOString().split('T')[0];
    const newClockIn = new Date(`${shiftDate}T${editStart}:00`).toISOString();
    const newClockOut = new Date(`${shiftDate}T${editEnd}:00`).toISOString();
    startTransition(async () => {
      await correctTimeEntry(editingEntry.id, newClockIn, newClockOut);
      setEditingEntry(null);
      router.refresh();
    });
  };

  const openManual = (shift: any) => {
    setManualShift(shift);
    setManualStart(shift.start_time?.slice(0, 5) || '');
    setManualEnd(shift.end_time?.slice(0, 5) || '');
    setManualError('');
  };

  const saveManual = () => {
    if (!manualShift) return;
    setManualError('');
    if (!manualStart || !manualEnd) { setManualError('Renseignez les deux heures'); return; }
    const [hs, ms] = manualStart.split(':').map(Number);
    const [he, me] = manualEnd.split(':').map(Number);
    const h = (he * 60 + me - hs * 60 - ms) / 60;
    if (h <= 0) { setManualError('L\'heure de fin doit être après le début'); return; }
    const clockIn = new Date(`${manualShift.date}T${manualStart}:00`).toISOString();
    const clockOut = new Date(`${manualShift.date}T${manualEnd}:00`).toISOString();
    startTransition(async () => {
      const result = await createManualTimeEntry({
        shift_id: manualShift.id,
        worker_id: manualShift.flexi_workers?.id,
        clock_in: clockIn,
        clock_out: clockOut,
      });
      if (result.error) { setManualError(result.error); return; }
      setManualShift(null);
      router.refresh();
    });
  };

  // ─── RANGE LABEL ───
  const rangeLabel = (() => {
    if (isPreset(yesterday, today)) return 'Hier & aujourd\'hui';
    if (isPreset(today, today)) return 'Aujourd\'hui';
    if (isPreset(d7, today)) return '7 derniers jours';
    if (isPreset(d30, today)) return '30 derniers jours';
    const df = new Date(from + 'T00:00:00');
    const dt = new Date(to + 'T00:00:00');
    if (from === to) return `${df.getDate()} ${MONTH_NAMES[df.getMonth()]}`;
    return `${df.getDate()} ${MONTH_NAMES[df.getMonth()]} → ${dt.getDate()} ${MONTH_NAMES[dt.getMonth()]}`;
  })();

  return (
    <>
      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Validation</h1>
          <div className="flex items-center gap-3 mt-1">
            {totalPending > 0 && (
              <span className="text-xs font-medium text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                {totalPending} à valider
              </span>
            )}
            {totalOpen > 0 && (
              <span className="text-xs font-medium text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                {totalOpen} sortie(s) manquante(s)
              </span>
            )}
            {totalMissing > 0 && (
              <span className="text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                {totalMissing} pointage(s) manquant(s)
              </span>
            )}
            {totalPending === 0 && totalMissing === 0 && (
              <span className="text-xs text-gray-400">Tout est à jour ✓</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range selector */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:border-gray-300 transition-colors"
            >
              <Calendar size={14} className="text-gray-400" />
              {rangeLabel}
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {showDatePicker && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-30 p-4 w-72">
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { label: 'Aujourd\'hui', f: today, t: today },
                    { label: 'Hier & auj.', f: yesterday, t: today },
                    { label: '7 derniers jours', f: d7, t: today },
                    { label: '30 derniers jours', f: d30, t: today },
                  ].map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setRange(p.f, p.t)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                        isPreset(p.f, p.t)
                          ? 'bg-gray-900 text-white'
                          : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[10px] text-gray-400 font-medium uppercase mb-2">Période custom</p>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-400 mb-1 block">Du</label>
                      <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-gray-400 mb-1 block">Au</label>
                      <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs" />
                    </div>
                  </div>
                  <button
                    onClick={() => setRange(customFrom, customTo)}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2 text-xs font-medium"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            )}
          </div>
          {pending.length > 1 && (
            <button
              onClick={handleValidateAll}
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              <CheckSquare size={15} /> Tout valider ({pending.length})
            </button>
          )}
        </div>
      </div>

      {/* ─── EMPTY STATE ─── */}
      {byDate.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
          <div className="text-5xl mb-3">✓</div>
          <p className="font-semibold text-gray-600 mb-1">Rien à valider sur cette période</p>
          <p className="text-sm">Sélectionnez une autre plage de dates</p>
        </div>
      )}

      {/* ─── BY DATE ─── */}
      <div className="space-y-6">
        {byDate.map(([date, { pending: dp, validated: dv, missing: dm, open: dop }]) => {
          const dayHours = [...dp, ...dv].reduce((sum, e) => sum + getBillableInfo(e).billableHours, 0);
          const dayCost = [...dp, ...dv].reduce((sum, e) => {
            const info = getBillableInfo(e);
            const w = e.flexi_workers;
            return sum + calculateCost(info.billableHours, w?.hourly_rate || 12.53, false, w?.status || 'other').total_cost;
          }, 0);
          const isToday = date === today;
          const isYesterday = date === yesterday;

          return (
            <div key={date}>
              {/* Day header */}
              <div className={`flex items-center justify-between mb-3 px-1`}>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 ${isToday ? 'text-orange-600' : isYesterday ? 'text-gray-700' : 'text-gray-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${isToday ? 'bg-orange-500' : isYesterday ? 'bg-gray-400' : 'bg-gray-300'}`} />
                    <span className="font-bold text-base capitalize">{fmtDate(date)}</span>
                    <span className="text-xs font-normal text-gray-400">
                      {new Date(date + 'T00:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  {dop.length > 0 && (
                    <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">
                      {dop.length} sortie{dop.length > 1 ? 's' : ''} manquante{dop.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {dm.length > 0 && (
                    <span className="text-[10px] font-semibold text-red-400 bg-red-50 px-2 py-0.5 rounded-full">
                      {dm.length} manquant{dm.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {dp.length > 0 && (
                    <span className="text-[10px] font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                      {dp.length} à valider
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  {dayHours > 0 && <span className="font-medium text-gray-600">{formatH(dayHours)}</span>}
                  {dayCost > 0 && <span className="font-medium text-gray-600">{formatEuro(dayCost)}</span>}
                  {dp.length > 1 && (
                    <button
                      onClick={() => handleValidateAllDay(dp)}
                      disabled={isPending}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[11px] font-medium transition-colors disabled:opacity-50"
                    >
                      <CheckSquare size={11} /> Valider le jour
                    </button>
                  )}
                </div>
              </div>

              {/* Cards grid */}
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {/* Open entries — clock_in but no clock_out */}
                {dop.map((entry: any) => (
                  <OpenCard
                    key={entry.id}
                    entry={entry}
                    onClockOut={() => openEdit(entry)}
                  />
                ))}
                {/* Missing shifts */}
                {dm.map((shift: any) => (
                  <MissingCard
                    key={shift.id}
                    shift={shift}
                    onSaisir={() => openManual(shift)}
                  />
                ))}
                {/* Pending entries */}
                {dp.map((entry: any) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    isPending={isPending}
                    isValidated={false}
                    expandedId={expandedId}
                    onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                    onEdit={() => openEdit(entry)}
                    onValidate={() => handleValidate(entry.id)}
                    onCancel={() => setCancelConfirmId(entry.id)}
                  />
                ))}
                {/* Validated entries */}
                {dv.map((entry: any) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    isPending={isPending}
                    isValidated={true}
                    expandedId={expandedId}
                    onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                    onEdit={() => openEdit(entry)}
                    onValidate={() => {}}
                    onCancel={() => {}}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── MODAL SAISIE MANUELLE ─── */}
      {manualShift && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-bold text-gray-900">Saisie manuelle</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {manualShift.flexi_workers?.first_name} {manualShift.flexi_workers?.last_name} · {fmtDate(manualShift.date)}
                </p>
              </div>
              <button onClick={() => setManualShift(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="p-3 bg-gray-50 rounded-xl flex items-center justify-between text-sm">
                <span className="text-gray-500">Shift prévu</span>
                <span className="font-medium text-gray-700 flex items-center gap-1">
                  <Clock size={12} className="text-gray-300" />
                  {manualShift.start_time?.slice(0, 5)} → {manualShift.end_time?.slice(0, 5)}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Heures réelles travaillées</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-violet-600 font-medium mb-1 block">Arrivée</label>
                    <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-violet-200 text-sm focus:border-violet-400 focus:outline-none" />
                  </div>
                  <span className="text-gray-300 mt-5">→</span>
                  <div className="flex-1">
                    <label className="text-[10px] text-violet-600 font-medium mb-1 block">Départ</label>
                    <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-violet-200 text-sm focus:border-violet-400 focus:outline-none" />
                  </div>
                </div>
              </div>
              {manualStart && manualEnd && (() => {
                const [hs, ms] = manualStart.split(':').map(Number);
                const [he, me] = manualEnd.split(':').map(Number);
                const h = Math.max(0, (he * 60 + me - hs * 60 - ms) / 60);
                if (h <= 0) return null;
                const cost = calculateCost(h, manualShift.flexi_workers?.hourly_rate || 12.53, false, manualShift.flexi_workers?.status || 'other');
                return (
                  <div className="text-sm text-violet-600 font-medium bg-violet-50 px-3 py-2 rounded-xl">
                    {formatH(h)} · {formatEuro(cost.total_cost)}
                  </div>
                );
              })()}
              {manualError && <p className="text-xs text-red-500">{manualError}</p>}
            </div>
            <div className="p-4 border-t flex gap-2">
              <button onClick={() => setManualShift(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium">
                Annuler
              </button>
              <button onClick={saveManual} disabled={isPending}
                className="flex-1 bg-violet-500 hover:bg-violet-600 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
                {isPending ? 'Création...' : 'Créer le pointage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL MODIFICATION HEURES ─── */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h3 className="font-bold text-gray-900">Modifier les heures</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {editingEntry.flexi_workers?.first_name} {editingEntry.flexi_workers?.last_name} · {fmtDate(editingEntry.shifts?.date)}
                </p>
              </div>
              <button onClick={() => setEditingEntry(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-blue-600 font-medium mb-1 block">Début</label>
                  <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm focus:border-blue-400 focus:outline-none" />
                </div>
                <span className="text-gray-300 mt-5">→</span>
                <div className="flex-1">
                  <label className="text-[10px] text-blue-600 font-medium mb-1 block">Fin</label>
                  <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-blue-200 text-sm focus:border-blue-400 focus:outline-none" />
                </div>
              </div>
              {editStart && editEnd && (() => {
                const [hs, ms] = editStart.split(':').map(Number);
                const [he, me] = editEnd.split(':').map(Number);
                const h = Math.max(0, (he * 60 + me - hs * 60 - ms) / 60);
                if (h <= 0) return null;
                const w = editingEntry.flexi_workers;
                const cost = calculateCost(h, w?.hourly_rate || 12.53, false, w?.status || 'other');
                return (
                  <div className="text-sm text-blue-600 font-medium bg-blue-50 px-3 py-2 rounded-xl">
                    {formatH(h)} · {formatEuro(cost.total_cost)}
                  </div>
                );
              })()}
            </div>
            <div className="p-4 border-t flex gap-2">
              <button onClick={() => setEditingEntry(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium">
                Annuler
              </button>
              <button onClick={saveEdit} disabled={isPending}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50">
                {isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL ANNULATION ─── */}
      {cancelConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-900 mb-2">Annuler ce shift ?</h3>
            <p className="text-sm text-gray-600 mb-1">Le pointage sera supprimé et le shift passera en &quot;annulé&quot;.</p>
            <p className="text-xs text-red-500 mb-4">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelConfirmId(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Retour</button>
              <button onClick={() => handleCancel(cancelConfirmId)} disabled={isPending}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">
                {isPending ? '...' : 'Annuler le shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop for date picker */}
      {showDatePicker && (
        <div className="fixed inset-0 z-20" onClick={() => setShowDatePicker(false)} />
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// Carte pointage ouvert (clock_in sans clock_out)
// ─────────────────────────────────────────────
function OpenCard({ entry, onClockOut }: { entry: any; onClockOut: () => void }) {
  const w = entry.flexi_workers;
  const s = entry.shifts;
  const clockIn = new Date(entry.clock_in);
  const clockInStr = clockIn.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
  const sinceMinutes = Math.round((Date.now() - clockIn.getTime()) / 60000);
  const sinceStr = sinceMinutes >= 60
    ? `${Math.floor(sinceMinutes / 60)}h${String(sinceMinutes % 60).padStart(2, '0')} en cours`
    : `${sinceMinutes}min en cours`;

  return (
    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-400 to-indigo-500 text-white font-bold text-xs flex-shrink-0">
            {w?.first_name?.[0]}{w?.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm mb-0.5">{w?.first_name} {w?.last_name}</div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <MapPin size={10} className="text-gray-300" />
              <span>{s?.locations?.name || '—'}</span>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg flex-shrink-0">
            Sortie manquante
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-gray-50 rounded-xl px-2.5 py-1.5">
            <div className="text-gray-400 mb-0.5">Shift prévu</div>
            <div className="font-medium text-gray-700 flex items-center gap-1">
              <Clock size={10} className="text-gray-300" />
              {s?.start_time?.slice(0, 5)} → {s?.end_time?.slice(0, 5)}
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl px-2.5 py-1.5">
            <div className="text-blue-400 mb-0.5">Pointé à</div>
            <div className="font-medium text-blue-700 flex items-center gap-1">
              <Clock size={10} className="text-blue-300" />
              {clockInStr} → <span className="text-blue-300">?</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 font-medium">
            ⏱ {sinceStr}
          </span>
        </div>

        <button
          onClick={onClockOut}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold transition-colors"
        >
          <Pencil size={12} /> Saisir l&apos;heure de sortie
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Carte pointage existant
// ─────────────────────────────────────────────
function EntryCard({
  entry, isPending, isValidated, expandedId,
  onExpand, onEdit, onValidate, onCancel,
}: {
  entry: any;
  isPending: boolean;
  isValidated: boolean;
  expandedId: string | null;
  onExpand: (id: string) => void;
  onEdit: () => void;
  onValidate: () => void;
  onCancel: () => void;
}) {
  const w = entry.flexi_workers;
  const s = entry.shifts;
  const info = getBillableInfo(entry);
  const cost = calculateCost(info.billableHours, w?.hourly_rate || 12.53, false, w?.status || 'other');
  const isExpanded = expandedId === entry.id;
  const hasExtra = info.earlyMinutes > 0 || info.lateMinutes > 0;
  const isManual = !entry.geo_valid_in && !entry.geo_valid_out;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      isValidated ? 'border-emerald-100' : 'border-gray-100'
    }`}>
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${
            isValidated
              ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
              : 'bg-gradient-to-br from-orange-400 to-red-500'
          }`}>
            {w?.first_name?.[0]}{w?.last_name?.[0]}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-gray-900 text-sm">{w?.first_name} {w?.last_name}</span>
              {isValidated && <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />}
              {isManual && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-500 font-medium">manuel</span>}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <MapPin size={10} className="text-gray-300" />
              <span>{s?.locations?.name || '—'}</span>
            </div>
          </div>

          {/* Heures + coût */}
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold text-gray-900">{formatH(info.billableHours)}</div>
            <div className="text-xs text-gray-400">{formatEuro(cost.total_cost)}</div>
          </div>
        </div>

        {/* Horaires */}
        <div className={`mt-2.5 grid grid-cols-2 gap-2 text-[11px]`}>
          <div className="bg-gray-50 rounded-lg px-2.5 py-1.5">
            <div className="text-gray-400 mb-0.5">Shift prévu</div>
            <div className="font-medium text-gray-700 flex items-center gap-1">
              <Clock size={10} className="text-gray-300" />
              {info.shiftStart} → {info.shiftEnd}
            </div>
          </div>
          <div className={`rounded-lg px-2.5 py-1.5 ${hasExtra ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <div className="text-gray-400 mb-0.5">Pointage réel</div>
            <div className={`font-medium flex items-center gap-1 ${hasExtra ? 'text-amber-700' : 'text-gray-700'}`}>
              <Clock size={10} className={hasExtra ? 'text-amber-300' : 'text-gray-300'} />
              {info.clockInStr} → {info.clockOutStr}
            </div>
          </div>
        </div>

        {/* Extra time badges */}
        {hasExtra && (
          <div className="flex gap-1.5 mt-2">
            {info.earlyMinutes > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
                +{info.earlyMinutes}min avant
              </span>
            )}
            {info.lateMinutes > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                +{info.lateMinutes}min après
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-3">
          <button
            onClick={() => onExpand(entry.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-400 text-xs transition-colors"
          >
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{isExpanded ? 'Moins' : 'Détails'}</span>
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-blue-300 hover:text-blue-600 text-gray-400 text-xs transition-colors"
          >
            <Pencil size={11} /> Modifier
          </button>
          <div className="flex-1" />
          {!isValidated && (
            <>
              <button onClick={onCancel}
                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors">
                <XCircle size={15} />
              </button>
              <button
                onClick={onValidate}
                disabled={isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                <CheckCircle2 size={12} /> Valider
              </button>
            </>
          )}
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: 'Heures', value: formatH(info.billableHours) },
                { label: 'Salaire', value: formatEuro(cost.total_salary) },
                { label: w?.status === 'student' ? 'Cotis. 5,42%' : 'Cotis. 28%', value: formatEuro(cost.employer_contribution) },
                { label: 'Total', value: formatEuro(cost.total_cost), highlight: true },
              ].map((item) => (
                <div key={item.label} className={`p-2 rounded-xl text-center ${item.highlight ? 'bg-orange-50' : 'bg-gray-50'}`}>
                  <div className={`text-[9px] font-medium mb-0.5 ${item.highlight ? 'text-orange-400' : 'text-gray-400'}`}>{item.label}</div>
                  <div className={`text-xs font-bold ${item.highlight ? 'text-orange-700' : 'text-gray-800'}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Carte shift sans pointage
// ─────────────────────────────────────────────
function MissingCard({ shift, onSaisir }: { shift: any; onSaisir: () => void }) {
  const w = shift.flexi_workers;
  const plannedH = (() => {
    const [hs, ms] = (shift.start_time || '17:00').split(':').map(Number);
    const [he, me] = (shift.end_time || '21:30').split(':').map(Number);
    return Math.max(0, (he * 60 + me - hs * 60 - ms) / 60);
  })();
  const cost = calculateCost(plannedH, w?.hourly_rate || 12.53, false, w?.status || 'other');

  return (
    <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-red-400 to-rose-500 text-white font-bold text-xs flex-shrink-0">
            {w?.first_name?.[0]}{w?.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm mb-0.5">{w?.first_name} {w?.last_name}</div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <MapPin size={10} className="text-gray-300" />
              <span>{shift.locations?.name || '—'}</span>
            </div>
          </div>
          <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-1 rounded-lg flex-shrink-0">
            Pas de pointage
          </span>
        </div>

        <div className="mt-2.5 bg-gray-50 rounded-xl px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Clock size={11} className="text-gray-300" />
            <span className="font-medium">{shift.start_time?.slice(0, 5)} → {shift.end_time?.slice(0, 5)}</span>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-gray-700">{formatH(plannedH)}</div>
            <div className="text-[10px] text-gray-400">{formatEuro(cost.total_cost)}</div>
          </div>
        </div>

        <button
          onClick={onSaisir}
          className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-700 text-xs font-semibold transition-colors"
        >
          <Plus size={13} /> Saisir les heures
        </button>
      </div>
    </div>
  );
}
