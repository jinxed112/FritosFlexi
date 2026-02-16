'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createMultiShifts, updateShift, deleteShift, cancelShift } from '@/lib/actions/shifts';
import { calculateHours, calculateCost, formatEuro } from '@/utils';
import { Plus, X, ChevronLeft, ChevronRight, Users, Clock, Search, MapPin } from 'lucide-react';
import Link from 'next/link';

const DAY_NAMES_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const DAY_NAMES_FULL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-100', border: 'border-gray-200', text: 'text-gray-600', label: 'Brouillon' },
  proposed: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', label: 'En attente' },
  accepted: { bg: 'bg-emerald-50', border: 'border-emerald-400', text: 'text-emerald-700', label: 'Accepté' },
  refused: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-600', label: 'Refusé' },
  completed: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-600', label: 'Terminé' },
  cancelled: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-400', label: 'Annulé' },
};

const PRESETS = [
  { label: 'Ouverture', start: '17:00', end: '21:30' },
  { label: 'Classique', start: '18:00', end: '21:30' },
  { label: 'Midi', start: '11:00', end: '15:00' },
  { label: 'Journée', start: '11:00', end: '21:30' },
];

interface Props {
  shifts: any[];
  locations: any[];
  allWorkers: any[];
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
}

export default function PlanningGrid({ shifts, locations, allWorkers, weekStart, prevWeek, nextWeek }: Props) {
  const router = useRouter();
  const [filterLocationId, setFilterLocationId] = useState<string>('all');
  const filteredShifts = filterLocationId === 'all' ? shifts : shifts.filter((s: any) => s.location_id === filterLocationId);

  const [teamIds, setTeamIds] = useState<string[]>(() =>
    [...new Set(shifts.filter((s: any) => s.worker_id).map((s: any) => s.worker_id))]
  );
  useEffect(() => {
    setTeamIds((prev) => {
      const fromShifts = [...new Set(shifts.filter((s: any) => s.worker_id).map((s: any) => s.worker_id))] as string[];
      return [...new Set([...prev, ...fromShifts])];
    });
  }, [shifts]);

  const [showTeamPanel, setShowTeamPanel] = useState(false);
  const [showShiftPanel, setShowShiftPanel] = useState(false);
  const [shiftWorker, setShiftWorker] = useState<any>(null);
  const [shiftLocation, setShiftLocation] = useState('');
  const [shiftRole, setShiftRole] = useState('polyvalent');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [daySchedules, setDaySchedules] = useState<Record<string, { start: string; end: string }>>({});
  const [sameSchedule, setSameSchedule] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingShift, setEditingShift] = useState<any>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [mobileDayIdx, setMobileDayIdx] = useState(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const idx = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    }).findIndex((iso) => iso === todayStr);
    return idx >= 0 ? idx : 0;
  });

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    return { date: d, iso: d.toISOString().split('T')[0], dayName: DAY_NAMES_SHORT[i], dayFull: DAY_NAMES_FULL[i], num: d.getDate(), month: MONTH_NAMES[d.getMonth()] };
  });

  const today = new Date().toISOString().split('T')[0];
  const teamWorkers = allWorkers.filter((w: any) => teamIds.includes(w.id));
  const availableWorkers = allWorkers.filter((w: any) => !teamIds.includes(w.id));
  const filteredAvailable = availableWorkers.filter((w: any) =>
    `${w.first_name} ${w.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const dayStats = weekDays.map((d) => {
    const dayShifts = filteredShifts.filter((s: any) => s.date === d.iso && s.status !== 'cancelled' && s.status !== 'refused');
    let totalHours = 0, totalCost = 0;
    const workerSet = new Set<string>();
    dayShifts.forEach((s: any) => {
      const h = calculateHours(s.start_time, s.end_time);
      totalHours += h; totalCost += calculateCost(h, s.flexi_workers?.hourly_rate || 12.53).total_cost;
      if (s.worker_id) workerSet.add(s.worker_id);
    });
    return { hours: totalHours, employees: workerSet.size, cost: totalCost };
  });
  const totalHours = dayStats.reduce((s, d) => s + d.hours, 0);
  const totalCost = dayStats.reduce((s, d) => s + d.cost, 0);

  const addToTeam = (id: string) => setTeamIds((p) => [...p, id]);
  const removeFromTeam = (id: string) => setTeamIds((p) => p.filter((x) => x !== id));

  const openShiftPanel = (worker: any, initialDay?: string) => {
    setShiftWorker(worker);
    setShiftLocation(filterLocationId !== 'all' ? filterLocationId : locations[0]?.id || '');
    setShiftRole('polyvalent');
    const preset = PRESETS[0];
    if (initialDay) { setSelectedDays([initialDay]); setDaySchedules({ [initialDay]: { start: preset.start, end: preset.end } }); }
    else { setSelectedDays([]); setDaySchedules({}); }
    setSameSchedule(true); setShowShiftPanel(true);
  };

  const toggleDay = (iso: string) => {
    setSelectedDays((prev) => {
      if (prev.includes(iso)) return prev.filter((d) => d !== iso);
      setDaySchedules((ds) => ({ ...ds, [iso]: { start: PRESETS[0].start, end: PRESETS[0].end } }));
      return [...prev, iso];
    });
  };

  const applyPreset = (p: typeof PRESETS[0]) => {
    const upd: Record<string, { start: string; end: string }> = {};
    selectedDays.forEach((d) => { upd[d] = { start: p.start, end: p.end }; });
    setDaySchedules((prev) => ({ ...prev, ...upd }));
  };

  const updateDaySchedule = (iso: string, field: 'start' | 'end', value: string) => {
    if (sameSchedule) {
      setDaySchedules((prev) => {
        const upd = { ...prev };
        selectedDays.forEach((d) => { upd[d] = { ...(upd[d] || { start: '17:00', end: '21:30' }), [field]: value }; });
        return upd;
      });
    } else {
      setDaySchedules((prev) => ({ ...prev, [iso]: { ...prev[iso], [field]: value } }));
    }
  };

  const handleCreateShifts = () => {
    if (!shiftWorker || selectedDays.length === 0) return;
    startTransition(async () => {
      await createMultiShifts({
        worker_id: shiftWorker.id, location_id: shiftLocation, role: shiftRole,
        days: selectedDays.map((iso) => ({ date: iso, start_time: daySchedules[iso]?.start || '17:00', end_time: daySchedules[iso]?.end || '21:30' })),
      });
      setShowShiftPanel(false); router.refresh();
    });
  };

  const openEditPanel = (shift: any) => {
    setEditingShift(shift); setEditStart(shift.start_time?.slice(0, 5) || '17:00'); setEditEnd(shift.end_time?.slice(0, 5) || '21:30');
    setEditRole(shift.role || 'polyvalent'); setEditLocation(shift.location_id || locations[0]?.id || ''); setShowDeleteConfirm(false);
  };

  const handleUpdateShift = () => { if (!editingShift) return; startTransition(async () => { await updateShift(editingShift.id, { start_time: editStart, end_time: editEnd, role: editRole, location_id: editLocation }); setEditingShift(null); router.refresh(); }); };
  const handleDeleteShift = () => { if (!editingShift) return; startTransition(async () => { await deleteShift(editingShift.id); setEditingShift(null); router.refresh(); }); };
  const handleCancelShift = () => { if (!editingShift) return; startTransition(async () => { await cancelShift(editingShift.id); setEditingShift(null); router.refresh(); }); };

  const formatH = (h: number) => { const hrs = Math.floor(h); const mins = Math.round((h - hrs) * 60); return mins > 0 ? `${hrs}h${mins.toString().padStart(2, '0')}` : `${hrs}h`; };

  /* ============================================================
     MOBILE VIEW — day-by-day vertical
     ============================================================ */
  const mobileDay = weekDays[mobileDayIdx];
  const mobileStats = dayStats[mobileDayIdx];

  const renderMobile = () => (
    <div className="lg:hidden">
      {/* Week nav */}
      <div className="flex items-center justify-between mb-3">
        <Link href={`/dashboard/flexis/planning?week=${prevWeek}`} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronLeft size={18} /></Link>
        <span className="text-xs font-medium text-gray-600">
          {new Date(weekStart).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} — {weekDays[6].date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
        </span>
        <Link href={`/dashboard/flexis/planning?week=${nextWeek}`} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"><ChevronRight size={18} /></Link>
      </div>

      {/* Location filter pills */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setFilterLocationId('all')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterLocationId === 'all' ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>Tous</button>
        {locations.map((l: any) => (
          <button key={l.id} onClick={() => setFilterLocationId(l.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterLocationId === l.id ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>{l.name}</button>
        ))}
      </div>

      {/* Day pills */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
        {weekDays.map((d, i) => {
          const sel = i === mobileDayIdx;
          const isToday = d.iso === today;
          const has = filteredShifts.some((s: any) => s.date === d.iso && s.status !== 'cancelled' && s.status !== 'refused');
          return (
            <button key={d.iso} onClick={() => setMobileDayIdx(i)}
              className={`flex-shrink-0 w-12 py-2 rounded-xl text-center transition-all ${sel ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : isToday ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-white border border-gray-100 text-gray-500'}`}>
              <div className="text-[9px] font-medium uppercase opacity-70">{d.dayName}</div>
              <div className="text-lg font-bold leading-tight">{d.num}</div>
              {has && !sel && <div className="w-1 h-1 rounded-full bg-orange-400 mx-auto mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Day header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 capitalize">{mobileDay.dayFull} {mobileDay.num} {mobileDay.month}</h3>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          <span>{formatH(mobileStats.hours)}</span>
          <span>{formatEuro(mobileStats.cost)}</span>
        </div>
      </div>

      {/* Worker cards */}
      <div className="space-y-2 mb-4">
        {teamWorkers.map((w: any) => {
          const ws = filteredShifts.filter((s: any) => s.worker_id === w.id && s.date === mobileDay.iso);
          return (
            <div key={w.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-[10px] font-bold">{w.first_name[0]}{w.last_name[0]}</div>
                <div className="flex-1 min-w-0"><div className="font-medium text-gray-800 text-sm truncate">{w.first_name} {w.last_name}</div></div>
                {ws.length === 0 && (
                  <button onClick={() => openShiftPanel(w, mobileDay.iso)}
                    className="w-8 h-8 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-500 flex items-center justify-center"><Plus size={16} /></button>
                )}
              </div>
              {ws.length > 0 ? (
                <div className="space-y-1.5">
                  {ws.map((s: any) => {
                    const st = STATUS_STYLES[s.status] || STATUS_STYLES.draft;
                    const h = calculateHours(s.start_time, s.end_time);
                    return (
                      <div key={s.id} onClick={() => openEditPanel(s)}
                        className={`${st.bg} border ${st.border} rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform`}>
                        <div>
                          <span className={`text-xs font-bold ${st.text}`}>{s.role}</span>
                          <span className="text-xs text-gray-500 ml-2">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {filterLocationId === 'all' && s.locations?.name && <span className="text-[10px] text-gray-400">{s.locations.name}</span>}
                          <span className="text-[10px] text-gray-400">{formatH(h)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-xs text-gray-300 pl-10">Pas de shift</p>}
            </div>
          );
        })}
      </div>

      <button onClick={() => { setSearchTerm(''); setShowTeamPanel(true); }}
        className="w-full bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 text-gray-400 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2">
        <Users size={16} /> Gérer l&apos;équipe
      </button>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <div className="flex gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400" /> Accepté</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400" /> Attente</span>
        </div>
        <div className="flex gap-3">
          <span>Sem: <strong className="text-gray-600">{formatH(totalHours)}</strong></span>
          <span><strong className="text-gray-600">{formatEuro(totalCost)}</strong></span>
        </div>
      </div>
    </div>
  );

  /* ============================================================
     DESKTOP VIEW — table grid
     ============================================================ */
  const renderDesktop = () => (
    <div className="hidden lg:block">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/flexis/planning?week=${prevWeek}`} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><ChevronLeft size={18} /></Link>
          <div className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700">
            {new Date(weekStart).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} — {weekDays[6].date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
          </div>
          <Link href={`/dashboard/flexis/planning?week=${nextWeek}`} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"><ChevronRight size={18} /></Link>
          <Link href="/dashboard/flexis/planning" className="text-xs text-orange-500 hover:text-orange-600 font-medium ml-1">Aujourd&apos;hui</Link>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden text-xs">
            <button onClick={() => setFilterLocationId('all')} className={`px-3 py-2 font-medium transition-colors ${filterLocationId === 'all' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>Tous</button>
            {locations.map((l: any) => (
              <button key={l.id} onClick={() => setFilterLocationId(l.id)} className={`px-3 py-2 font-medium transition-colors border-l border-gray-200 ${filterLocationId === l.id ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{l.name}</button>
            ))}
          </div>
          <button onClick={() => { setSearchTerm(''); setShowTeamPanel(true); }}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"><Users size={16} /> Ajouter à l&apos;équipe</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium w-56 min-w-[14rem] sticky left-0 bg-gray-50 z-10" />
                {weekDays.map((d) => (
                  <th key={d.iso} className={`text-center px-2 py-3 text-xs font-medium min-w-[8rem] ${d.iso === today ? 'bg-orange-50 text-orange-600' : 'text-gray-500'}`}>
                    {d.dayName} {String(d.num).padStart(2, '0')} {d.month}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <td className="px-4 py-1.5 text-[11px] text-gray-400 font-medium sticky left-0 bg-gray-50/50 z-10">Heures</td>
                {dayStats.map((s, i) => <td key={i} className={`text-center text-[11px] font-medium text-gray-500 px-2 py-1.5 ${weekDays[i].iso === today ? 'bg-orange-50/50' : ''}`}>{s.hours > 0 ? formatH(s.hours) : '0h'}</td>)}
              </tr>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <td className="px-4 py-1.5 text-[11px] text-gray-400 font-medium sticky left-0 bg-gray-50/50 z-10">Employés</td>
                {dayStats.map((s, i) => <td key={i} className={`text-center text-[11px] text-gray-500 px-2 py-1.5 ${weekDays[i].iso === today ? 'bg-orange-50/50' : ''}`}>{s.employees}</td>)}
              </tr>
              <tr className="bg-gray-50/50 border-b border-gray-200">
                <td className="px-4 py-1.5 text-[11px] text-gray-400 font-medium sticky left-0 bg-gray-50/50 z-10">Coûts</td>
                {dayStats.map((s, i) => <td key={i} className={`text-center text-[11px] text-gray-500 px-2 py-1.5 ${weekDays[i].iso === today ? 'bg-orange-50/50' : ''}`}>{formatEuro(s.cost)}</td>)}
              </tr>
              <tr className="border-b border-gray-100">
                <td colSpan={8} className="px-4 py-2 text-xs font-bold text-gray-700 bg-gray-50">
                  Équipe {teamWorkers.length > 0 && <span className="font-normal text-gray-400">({teamWorkers.length})</span>}
                  {teamWorkers.length === 0 && <span className="font-normal text-gray-400 ml-2">— Ajoutez des membres</span>}
                </td>
              </tr>
              {teamWorkers.map((w: any) => {
                const wShifts = filteredShifts.filter((s: any) => s.worker_id === w.id);
                const wH = wShifts.filter((s: any) => s.status !== 'cancelled' && s.status !== 'refused').reduce((sum: number, s: any) => sum + calculateHours(s.start_time, s.end_time), 0);
                const wC = wShifts.filter((s: any) => s.status !== 'cancelled' && s.status !== 'refused').reduce((sum: number, s: any) => sum + calculateCost(calculateHours(s.start_time, s.end_time), w.hourly_rate || 12.53).total_cost, 0);
                return (
                  <tr key={w.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                    <td className="px-4 py-3 align-top sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{w.first_name[0]}{w.last_name[0]}</div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 text-sm truncate">{w.first_name} {w.last_name}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${w.status === 'student' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>{w.status === 'student' ? 'Étud.' : 'Flexi'}</span>
                            {wH > 0 && <span className="text-[10px] text-gray-400">{formatH(wH)} · {formatEuro(wC)}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {weekDays.map((d) => {
                      const cell = wShifts.filter((s: any) => s.date === d.iso);
                      return (
                        <td key={d.iso} className={`px-1.5 py-2 align-top ${d.iso === today ? 'bg-orange-50/30' : ''}`}>
                          <div className="min-h-[3rem] space-y-1">
                            {cell.map((s: any) => {
                              const st = STATUS_STYLES[s.status] || STATUS_STYLES.draft;
                              const h = calculateHours(s.start_time, s.end_time);
                              return (
                                <div key={s.id} onClick={() => openEditPanel(s)}
                                  className={`${st.bg} border ${st.border} rounded-lg px-2 py-1.5 text-[10px] leading-tight cursor-pointer hover:shadow-md transition-shadow`}>
                                  <div className={`font-bold ${st.text}`}>{s.role || 'Polyvalent'}</div>
                                  <div className="text-gray-500">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)} ({formatH(h)})</div>
                                  {filterLocationId === 'all' && s.locations?.name && <div className="text-gray-400 flex items-center gap-0.5 mt-0.5"><MapPin size={8} />{s.locations.name}</div>}
                                </div>
                              );
                            })}
                            {cell.length === 0 && (
                              <button onClick={() => openShiftPanel(w, d.iso)} className="w-full h-10 flex items-center justify-center text-gray-300 hover:text-orange-400 hover:bg-orange-50 rounded-lg transition-colors"><Plus size={16} /></button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Accepté</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> En attente</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-gray-300" /> Brouillon</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Annulé</span>
          </div>
          <div className="flex items-center gap-6 text-gray-500">
            <span>Heures : <strong className="text-gray-700">{formatH(totalHours)}</strong></span>
            <span>Coût : <strong className="text-gray-700">{formatEuro(totalCost)}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );

  /* ============================================================
     SHARED PANELS (Team, Create Shift, Edit Shift)
     ============================================================ */
  return (
    <>
      {renderMobile()}
      {renderDesktop()}

      {/* TEAM PANEL */}
      {showTeamPanel && (
        <div className="fixed inset-0 z-50 flex">
          <div className="hidden sm:block flex-1 bg-black/30" onClick={() => setShowTeamPanel(false)} />
          <div className="w-full sm:w-96 bg-white shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold text-gray-900">Gérer l&apos;équipe</h3>
              <button onClick={() => setShowTeamPanel(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-4 border-b">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {teamWorkers.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] text-gray-400 font-medium mb-2 uppercase">Dans l&apos;équipe ({teamWorkers.length})</p>
                  {teamWorkers.map((w: any) => (
                    <div key={w.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-orange-50 mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-[10px] font-bold">{w.first_name[0]}{w.last_name[0]}</div>
                        <div><div className="text-sm font-medium text-gray-800">{w.first_name} {w.last_name}</div></div>
                      </div>
                      <button onClick={() => removeFromTeam(w.id)} className="text-red-400 hover:text-red-600 text-xs">Retirer</button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-400 font-medium mb-2 uppercase">Disponibles ({filteredAvailable.length})</p>
              {filteredAvailable.map((w: any) => (
                <div key={w.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-[10px] font-bold">{w.first_name[0]}{w.last_name[0]}</div>
                    <div><div className="text-sm font-medium text-gray-800">{w.first_name} {w.last_name}</div></div>
                  </div>
                  <button onClick={() => addToTeam(w.id)} className="w-7 h-7 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-500 flex items-center justify-center"><Plus size={14} /></button>
                </div>
              ))}
            </div>
            <div className="p-4 border-t"><button onClick={() => setShowTeamPanel(false)} className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm">Terminé</button></div>
          </div>
        </div>
      )}

      {/* CREATE SHIFT PANEL */}
      {showShiftPanel && shiftWorker && (
        <div className="fixed inset-0 z-50 flex">
          <div className="hidden sm:block flex-1 bg-black/30" onClick={() => setShowShiftPanel(false)} />
          <div className="w-full sm:w-[28rem] bg-white shadow-2xl flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold text-gray-900">Créer un shift</h3>
              <button onClick={() => setShowShiftPanel(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-5">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-sm font-bold">{shiftWorker.first_name[0]}{shiftWorker.last_name[0]}</div>
                <div><div className="font-medium text-gray-800">{shiftWorker.first_name} {shiftWorker.last_name}</div></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Location</label>
                <select value={shiftLocation} onChange={(e) => setShiftLocation(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                  {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Rôle</label>
                <select value={shiftRole} onChange={(e) => setShiftRole(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                  <option value="polyvalent">Polyvalent</option><option value="cuisine">Cuisine</option><option value="caisse">Caisse</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Horaire type</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESETS.map((p) => (
                    <button key={p.label} onClick={() => applyPreset(p)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50">
                      <Clock size={10} className="inline mr-1" />{p.label} ({p.start}–{p.end})
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Jours</label>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((d) => {
                    const sel = selectedDays.includes(d.iso);
                    const has = shifts.some((s: any) => s.worker_id === shiftWorker.id && s.date === d.iso && s.status !== 'cancelled');
                    return (
                      <button key={d.iso} onClick={() => !has && toggleDay(d.iso)} disabled={has}
                        className={`py-2 rounded-lg text-center text-xs font-medium transition-colors ${has ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : sel ? 'bg-orange-500 text-white' : d.iso === today ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                        <div className="text-[10px] opacity-60">{d.dayName}</div><div>{d.num}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{selectedDays.length} jour(s)</p>
              </div>
              {selectedDays.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-500">Horaires</label>
                    {selectedDays.length > 1 && (
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={sameSchedule} onChange={(e) => setSameSchedule(e.target.checked)} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" /> Même horaire
                      </label>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(sameSchedule ? [selectedDays[0]] : [...selectedDays].sort()).map((iso) => {
                      const d = weekDays.find((wd) => wd.iso === iso);
                      const sc = daySchedules[iso] || { start: '17:00', end: '21:30' };
                      const h = calculateHours(sc.start + ':00', sc.end + ':00');
                      return (
                        <div key={iso} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
                          <div className="text-xs text-gray-500 w-16 flex-shrink-0">{sameSchedule ? 'Tous' : `${d?.dayName} ${d?.num}`}</div>
                          <input type="time" value={sc.start} onChange={(e) => updateDaySchedule(iso, 'start', e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm w-24" />
                          <span className="text-gray-400">–</span>
                          <input type="time" value={sc.end} onChange={(e) => updateDaySchedule(iso, 'end', e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm w-24" />
                          <span className="text-[10px] text-gray-400 ml-auto">{formatH(h)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-auto p-4 border-t flex gap-3">
              <button onClick={() => setShowShiftPanel(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Annuler</button>
              <button onClick={handleCreateShifts} disabled={isPending || selectedDays.length === 0}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">
                {isPending ? 'Création...' : `Ajouter (${selectedDays.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SHIFT PANEL */}
      {editingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingShift(null)} />
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
              <h3 className="font-bold text-gray-900">Modifier le shift</h3>
              <button onClick={() => setEditingShift(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-sm font-bold">
                  {editingShift.flexi_workers?.first_name?.[0] || '?'}{editingShift.flexi_workers?.last_name?.[0] || '?'}
                </div>
                <div>
                  <div className="font-medium text-gray-800">{editingShift.flexi_workers?.first_name} {editingShift.flexi_workers?.last_name}</div>
                  <div className="text-xs text-gray-400">{new Date(editingShift.date).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                </div>
                <span className={`ml-auto text-[10px] px-2 py-1 rounded-full font-medium ${(STATUS_STYLES[editingShift.status] || STATUS_STYLES.draft).bg} ${(STATUS_STYLES[editingShift.status] || STATUS_STYLES.draft).text}`}>
                  {(STATUS_STYLES[editingShift.status] || STATUS_STYLES.draft).label}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Location</label>
                <select value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                  {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Début</label>
                  <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1.5">Fin</label>
                  <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm" /></div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {PRESETS.map((p) => (
                  <button key={p.label} onClick={() => { setEditStart(p.start); setEditEnd(p.end); }}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${editStart === p.start && editEnd === p.end ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:border-orange-300'}`}>{p.label}</button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Rôle</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                  <option value="polyvalent">Polyvalent</option><option value="cuisine">Cuisine</option><option value="caisse">Caisse</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm">
                <span className="text-gray-500">Coût estimé</span>
                <span className="font-bold text-gray-800">{formatEuro(calculateCost(calculateHours(editStart + ':00', editEnd + ':00'), editingShift.flexi_workers?.hourly_rate || 12.53).total_cost)}</span>
              </div>
            </div>
            <div className="p-4 border-t space-y-2">
              <button onClick={handleUpdateShift} disabled={isPending} className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">{isPending ? 'Sauvegarde...' : 'Enregistrer'}</button>
              <div className="flex gap-2">
                {editingShift.status !== 'cancelled' && (
                  <button onClick={handleCancelShift} disabled={isPending} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl py-2 text-sm font-medium disabled:opacity-50">Annuler le shift</button>
                )}
                {!showDeleteConfirm
                  ? <button onClick={() => setShowDeleteConfirm(true)} className="flex-1 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl py-2 text-sm font-medium">Supprimer</button>
                  : <button onClick={handleDeleteShift} disabled={isPending} className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2 text-sm font-medium disabled:opacity-50">{isPending ? '...' : 'Confirmer'}</button>
                }
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}