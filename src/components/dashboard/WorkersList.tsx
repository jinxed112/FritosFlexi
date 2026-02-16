'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWorker, toggleWorkerActive, resetWorkerPassword, deleteWorker } from '@/lib/actions/workers';
import { createMultiShifts } from '@/lib/actions/shifts';
import { calculateHours, calculateCost, formatEuro } from '@/utils';
import { FLEXI_CONSTANTS } from '@/types';
import { Plus, X, UserPlus, Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';

const PRESETS = [
  { label: 'Ouverture', start: '17:00', end: '21:30' },
  { label: 'Classique', start: '18:00', end: '21:30' },
  { label: 'Midi', start: '11:00', end: '15:00' },
  { label: 'Journée', start: '11:00', end: '21:30' },
];

const DAY_NAMES = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

interface Props {
  workers: any[];
  locations: any[];
}

export default function WorkersList({ workers, locations }: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [resetInfo, setResetInfo] = useState<{ name: string; password: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Assignment modal state
  const [assignWorker, setAssignWorker] = useState<any>(null);
  const [assignWeekStart, setAssignWeekStart] = useState(() => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return mon.toISOString().split('T')[0];
  });
  const [assignLocation, setAssignLocation] = useState('');
  const [assignRole, setAssignRole] = useState('polyvalent');
  const [assignSelectedDays, setAssignSelectedDays] = useState<string[]>([]);
  const [assignSchedules, setAssignSchedules] = useState<Record<string, { start: string; end: string }>>({});
  const [assignSameSchedule, setAssignSameSchedule] = useState(true);

  const handleCreate = (formData: FormData) => {
    startTransition(async () => {
      const result = await createWorker({
        first_name: formData.get('first_name') as string,
        last_name: formData.get('last_name') as string,
        email: formData.get('email') as string,
        hourly_rate: parseFloat(formData.get('hourly_rate') as string) || 12.53,
        status: formData.get('status') as any,
      });
      if (result.tempPassword) {
        setTempPassword(result.tempPassword);
      } else {
        setShowModal(false);
      }
      router.refresh();
    });
  };

  const handleToggle = (id: string, active: boolean) => {
    startTransition(async () => { await toggleWorkerActive(id, active); router.refresh(); });
  };

  const handleReset = (id: string, name: string) => {
    startTransition(async () => {
      const result = await resetWorkerPassword(id);
      if ('newPassword' in result && result.newPassword) {
        setResetInfo({ name, password: result.newPassword });
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => { await deleteWorker(id); setDeleteConfirm(null); router.refresh(); });
  };

  // Assignment modal logic
  const openAssignModal = (worker: any) => {
    setAssignWorker(worker);
    setAssignLocation(locations[0]?.id || '');
    setAssignRole('polyvalent');
    setAssignSelectedDays([]);
    setAssignSchedules({});
    setAssignSameSchedule(true);
  };

  const assignWeekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(assignWeekStart);
    d.setDate(d.getDate() + i);
    return { date: d, iso: d.toISOString().split('T')[0], dayName: DAY_NAMES[i], num: d.getDate(), month: MONTH_NAMES[d.getMonth()] };
  });

  const navigateAssignWeek = (dir: number) => {
    const d = new Date(assignWeekStart);
    d.setDate(d.getDate() + dir * 7);
    setAssignWeekStart(d.toISOString().split('T')[0]);
    setAssignSelectedDays([]);
    setAssignSchedules({});
  };

  const toggleAssignDay = (iso: string) => {
    setAssignSelectedDays((prev) => {
      if (prev.includes(iso)) return prev.filter((d) => d !== iso);
      setAssignSchedules((s) => ({ ...s, [iso]: { start: PRESETS[0].start, end: PRESETS[0].end } }));
      return [...prev, iso];
    });
  };

  const applyAssignPreset = (p: typeof PRESETS[0]) => {
    const upd: Record<string, { start: string; end: string }> = {};
    assignSelectedDays.forEach((d) => { upd[d] = { start: p.start, end: p.end }; });
    setAssignSchedules((prev) => ({ ...prev, ...upd }));
  };

  const updateAssignSchedule = (iso: string, field: 'start' | 'end', value: string) => {
    if (assignSameSchedule) {
      setAssignSchedules((prev) => {
        const upd = { ...prev };
        assignSelectedDays.forEach((d) => { upd[d] = { ...(upd[d] || { start: '17:00', end: '21:30' }), [field]: value }; });
        return upd;
      });
    } else {
      setAssignSchedules((prev) => ({ ...prev, [iso]: { ...prev[iso], [field]: value } }));
    }
  };

  const handleAssignCreate = () => {
    if (!assignWorker || assignSelectedDays.length === 0) return;
    startTransition(async () => {
      await createMultiShifts({
        worker_id: assignWorker.id,
        location_id: assignLocation,
        role: assignRole,
        days: assignSelectedDays.map((iso) => ({
          date: iso,
          start_time: assignSchedules[iso]?.start || '17:00',
          end_time: assignSchedules[iso]?.end || '21:30',
        })),
      });
      setAssignWorker(null);
      router.refresh();
    });
  };

  const alertLevel = (ytd: number, status: string) => {
    if (status === 'pensioner') return null;
    if (ytd >= 18000) return { color: 'bg-red-500', label: 'PLAFOND' };
    if (ytd > 17000) return { color: 'bg-red-400', label: 'Critique' };
    if (ytd > 15000) return { color: 'bg-amber-400', label: 'Attention' };
    return null;
  };

  const statusLabels: Record<string, string> = {
    student: 'Étudiant', pensioner: 'Pensionné', employee: 'Salarié', other: 'Autre',
  };

  const formatH = (h: number) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h${mins.toString().padStart(2, '0')}` : `${hrs}h`;
  };

  const todayISO = new Date().toISOString().split('T')[0];

  // Total estimated cost for assignment
  const assignTotalCost = assignSelectedDays.reduce((sum, iso) => {
    const sc = assignSchedules[iso] || { start: '17:00', end: '21:30' };
    const h = calculateHours(sc.start + ':00', sc.end + ':00');
    return sum + calculateCost(h, assignWorker?.hourly_rate || 12.53).total_cost;
  }, 0);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Workers</h1>
        <button onClick={() => { setShowModal(true); setTempPassword(''); }}
          className="bg-orange-500 hover:bg-orange-600 text-white px-3 sm:px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1">
          <UserPlus size={16} /> <span className="hidden sm:inline">Nouveau flexi</span><span className="sm:hidden">Nouveau</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workers.map((w: any) => {
          const alert = alertLevel(w.ytd_earnings, w.status);
          const pct = Math.min((w.ytd_earnings / 18000) * 100, 100);

          return (
            <div key={w.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5 ${!w.is_active ? 'opacity-50' : ''}`}>
              {/* Header — clickable to assign */}
              <div
                onClick={() => w.is_active && w.profile_complete && openAssignModal(w)}
                className={`flex items-start gap-3 mb-4 ${w.is_active && w.profile_complete ? 'cursor-pointer group' : ''}`}
              >
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg transition-transform ${w.profile_complete ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-gray-300'} ${w.is_active && w.profile_complete ? 'group-hover:scale-105' : ''}`}>
                  {w.first_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-bold text-gray-900 truncate ${w.is_active && w.profile_complete ? 'group-hover:text-orange-600 transition-colors' : ''}`}>
                    {w.first_name} {w.last_name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${w.profile_complete ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      {w.profile_complete ? 'Profil ✓' : 'Incomplet'}
                    </span>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                      {statusLabels[w.status] || w.status}
                    </span>
                  </div>
                  {w.is_active && w.profile_complete && (
                    <p className="text-[10px] text-orange-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <Calendar size={10} /> Cliquer pour assigner des missions
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); handleReset(w.id, `${w.first_name} ${w.last_name}`); }}
                    className="text-xs px-2 py-1 rounded-lg text-blue-500 hover:bg-blue-50">Reset mdp</button>
                  <button onClick={(e) => { e.stopPropagation(); handleToggle(w.id, !w.is_active); }}
                    className={`text-xs px-2 py-1 rounded-lg ${w.is_active ? 'text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}>
                    {w.is_active ? 'Désactiver' : 'Réactiver'}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: w.id, name: `${w.first_name} ${w.last_name}` }); }}
                    className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600">Supprimer</button>
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Taux horaire</span>
                  <span className="font-medium text-gray-800">{w.hourly_rate} €/h</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Contrat-cadre</span>
                  <span className={`font-medium ${w.framework_contract_date ? 'text-emerald-600' : 'text-red-500'}`}>
                    {w.framework_contract_date || 'Non signé'}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Email</span>
                  <span className="font-medium text-gray-800 text-xs truncate ml-2">{w.email}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Téléphone</span>
                  <span className="font-medium text-gray-800">{w.phone || '—'}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-50">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Gains 2026</span>
                  <span className="font-medium text-gray-600">
                    {w.ytd_earnings.toLocaleString('fr-BE')} € {w.status !== 'pensioner' ? '/ 18 000 €' : '(illimité)'}
                  </span>
                </div>
                {w.status !== 'pensioner' && (
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct > 94 ? 'bg-red-500' : pct > 83 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                )}
                {alert && <p className={`text-[10px] font-medium mt-1 ${pct > 94 ? 'text-red-600' : 'text-amber-600'}`}>⚠ {alert.label}</p>}
              </div>

              {/* Quick assign button on mobile */}
              {w.is_active && w.profile_complete && (
                <button onClick={() => openAssignModal(w)}
                  className="mt-3 w-full bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 sm:hidden">
                  <Calendar size={14} /> Assigner des missions
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ========== ASSIGNMENT MODAL ========== */}
      {assignWorker && (
        <div className="fixed inset-0 z-50 flex">
          <div className="hidden sm:block flex-1 bg-black/30" onClick={() => setAssignWorker(null)} />
          <div className="w-full sm:w-[28rem] bg-white shadow-2xl flex flex-col h-full overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold text-gray-900">Assigner des missions</h3>
              <button onClick={() => setAssignWorker(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            <div className="p-4 space-y-5">
              {/* Worker */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-sm font-bold">
                  {assignWorker.first_name[0]}{assignWorker.last_name[0]}
                </div>
                <div>
                  <div className="font-medium text-gray-800">{assignWorker.first_name} {assignWorker.last_name}</div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${assignWorker.status === 'student' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                    {statusLabels[assignWorker.status] || assignWorker.status}
                  </span>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-xs text-gray-400">{assignWorker.hourly_rate} €/h</div>
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Location</label>
                <select value={assignLocation} onChange={(e) => setAssignLocation(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                  {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Rôle</label>
                <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                  <option value="polyvalent">Polyvalent</option>
                  <option value="cuisine">Cuisine</option>
                  <option value="caisse">Caisse</option>
                </select>
              </div>

              {/* Week navigation */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Semaine</label>
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => navigateAssignWeek(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    {new Date(assignWeekStart).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })} — {assignWeekDays[6].date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
                  </span>
                  <button onClick={() => navigateAssignWeek(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1">
                  {assignWeekDays.map((d) => {
                    const sel = assignSelectedDays.includes(d.iso);
                    const isPast = d.iso < todayISO;
                    return (
                      <button key={d.iso} onClick={() => !isPast && toggleAssignDay(d.iso)} disabled={isPast}
                        className={`py-2.5 rounded-lg text-center text-xs font-medium transition-all ${isPast ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                            : sel ? 'bg-orange-500 text-white shadow-sm'
                              : d.iso === todayISO ? 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}>
                        <div className="text-[10px] opacity-60">{d.dayName}</div>
                        <div className="text-base font-bold leading-tight">{d.num}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">{assignSelectedDays.length} jour(s) sélectionné(s)</p>
              </div>

              {/* Presets */}
              {assignSelectedDays.length > 0 && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Horaire type</label>
                    <div className="flex gap-2 flex-wrap">
                      {PRESETS.map((p) => (
                        <button key={p.label} onClick={() => applyAssignPreset(p)}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-colors">
                          <Clock size={10} className="inline mr-1" />{p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Schedules */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-500">Horaires</label>
                      {assignSelectedDays.length > 1 && (
                        <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
                          <input type="checkbox" checked={assignSameSchedule} onChange={(e) => setAssignSameSchedule(e.target.checked)}
                            className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                          Même horaire
                        </label>
                      )}
                    </div>
                    <div className="space-y-2">
                      {(assignSameSchedule ? [assignSelectedDays[0]] : [...assignSelectedDays].sort()).map((iso) => {
                        const d = assignWeekDays.find((wd) => wd.iso === iso);
                        const sc = assignSchedules[iso] || { start: '17:00', end: '21:30' };
                        const h = calculateHours(sc.start + ':00', sc.end + ':00');
                        return (
                          <div key={iso} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-xl">
                            <div className="text-xs text-gray-500 w-16 flex-shrink-0">
                              {assignSameSchedule ? 'Tous' : `${d?.dayName} ${d?.num}`}
                            </div>
                            <input type="time" value={sc.start} onChange={(e) => updateAssignSchedule(iso, 'start', e.target.value)}
                              className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm w-24" />
                            <span className="text-gray-400">–</span>
                            <input type="time" value={sc.end} onChange={(e) => updateAssignSchedule(iso, 'end', e.target.value)}
                              className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm w-24" />
                            <span className="text-[10px] text-gray-400 ml-auto">{formatH(h)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cost summary */}
                  <div className="flex items-center justify-between p-3 bg-orange-50 rounded-xl text-sm">
                    <span className="text-orange-600 font-medium">Coût total estimé</span>
                    <span className="font-bold text-orange-700">{formatEuro(assignTotalCost)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-auto p-4 border-t flex gap-3">
              <button onClick={() => setAssignWorker(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Annuler</button>
              <button onClick={handleAssignCreate} disabled={isPending || assignSelectedDays.length === 0}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">
                {isPending ? 'Création...' : `Proposer ${assignSelectedDays.length} shift(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Worker Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{tempPassword ? 'Compte créé ✓' : 'Nouveau flexi'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {tempPassword ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-emerald-700 mb-2">Mot de passe temporaire :</p>
                  <p className="text-2xl font-mono font-bold text-emerald-800 select-all">{tempPassword}</p>
                </div>
                <p className="text-xs text-gray-500 text-center">Communiquez ce mot de passe au flexi. Il pourra le changer après connexion.</p>
                <button onClick={() => setShowModal(false)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Fermer</button>
              </div>
            ) : (
              <form action={handleCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Prénom</label>
                    <input type="text" name="first_name" required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
                    <input type="text" name="last_name" required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input type="email" name="email" required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Taux horaire (€)</label>
                    <input type="number" name="hourly_rate" defaultValue="12.53" step="0.01" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
                    <select name="status" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                      <option value="student">Étudiant</option>
                      <option value="pensioner">Pensionné</option>
                      <option value="employee">Salarié</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={isPending}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm transition-colors disabled:opacity-50">
                  {isPending ? 'Création...' : 'Créer le compte'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-900 mb-3">Mot de passe réinitialisé ✓</h3>
            <p className="text-sm text-gray-600 mb-3">{resetInfo.name}</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <p className="text-xs text-blue-600 mb-1">Nouveau mot de passe :</p>
              <p className="text-2xl font-mono font-bold text-blue-800 select-all">{resetInfo.password}</p>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">Communiquez ce mot de passe au flexi.</p>
            <button onClick={() => setResetInfo(null)} className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Fermer</button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-900 mb-2">Supprimer ce worker ?</h3>
            <p className="text-sm text-gray-600 mb-1">{deleteConfirm.name}</p>
            <p className="text-xs text-red-500 mb-4">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Annuler</button>
              <button onClick={() => handleDelete(deleteConfirm.id)} disabled={isPending}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">
                {isPending ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}