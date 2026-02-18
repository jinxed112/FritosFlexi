'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { validateTimeEntry, correctTimeEntry } from '@/lib/actions/clock';
import { cancelShiftFromValidation } from '@/lib/actions/cancel-shift';
import { calculateCost, formatEuro } from '@/utils';
import { CheckSquare, Clock, ChevronDown, ChevronUp, AlertTriangle, Pencil, XCircle } from 'lucide-react';

interface Props {
  entries: any[];
}

export default function ValidationTable({ entries }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const handleValidate = (id: string) => {
    startTransition(async () => { await validateTimeEntry(id); router.refresh(); });
  };

  const handleValidateAll = () => {
    startTransition(async () => {
      for (const e of entries) {
        await validateTimeEntry(e.id);
      }
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
    const s = entry.shifts;
    // Default billable = capped to shift times
    const clockIn = new Date(entry.clock_in);
    const clockOut = new Date(entry.clock_out);
    const shiftDate = s?.date || clockIn.toISOString().split('T')[0];

    // Parse shift times
    const [sh, sm] = (s?.start_time || '17:00').split(':').map(Number);
    const [eh, em] = (s?.end_time || '21:30').split(':').map(Number);
    const shiftStart = new Date(`${shiftDate}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`);
    const shiftEnd = new Date(`${shiftDate}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`);

    // Actual times
    const actualStart = clockIn.toTimeString().slice(0, 5);
    const actualEnd = clockOut.toTimeString().slice(0, 5);

    setEditId(entry.id);
    setEditStart(actualStart);
    setEditEnd(actualEnd);
  };

  const saveEdit = (entry: any) => {
    const shiftDate = entry.shifts?.date || new Date(entry.clock_in).toISOString().split('T')[0];
    const newClockIn = new Date(`${shiftDate}T${editStart}:00`).toISOString();
    const newClockOut = new Date(`${shiftDate}T${editEnd}:00`).toISOString();

    startTransition(async () => {
      await correctTimeEntry(entry.id, newClockIn, newClockOut);
      setEditId(null);
      router.refresh();
    });
  };

  // Helper: compute billable hours (capped to shift)
  const getBillableInfo = (entry: any) => {
    const s = entry.shifts;
    const clockIn = new Date(entry.clock_in);
    const clockOut = new Date(entry.clock_out);
    const shiftDate = s?.date || clockIn.toISOString().split('T')[0];

    const [sh, sm] = (s?.start_time || '17:00').split(':').map(Number);
    const [eh, em] = (s?.end_time || '21:30').split(':').map(Number);
    const shiftStart = new Date(`${shiftDate}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`);
    const shiftEnd = new Date(`${shiftDate}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`);

    const billableStart = clockIn < shiftStart ? shiftStart : clockIn;
    const billableEnd = clockOut > shiftEnd ? shiftEnd : clockOut;
    const billableHours = Math.max(0, (billableEnd.getTime() - billableStart.getTime()) / 3600000);
    const actualHours = (clockOut.getTime() - clockIn.getTime()) / 3600000;
    const earlyMinutes = clockIn < shiftStart ? Math.round((shiftStart.getTime() - clockIn.getTime()) / 60000) : 0;
    const lateMinutes = clockOut > shiftEnd ? Math.round((clockOut.getTime() - shiftEnd.getTime()) / 60000) : 0;

    return {
      billableHours: Math.round(billableHours * 100) / 100,
      actualHours: Math.round(actualHours * 100) / 100,
      earlyMinutes,
      lateMinutes,
      shiftStart: s?.start_time?.slice(0, 5) || '—',
      shiftEnd: s?.end_time?.slice(0, 5) || '—',
      clockInStr: clockIn.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }),
      clockOutStr: clockOut.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const formatH = (h: number) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h${String(mins).padStart(2, '0')}` : `${hrs}h`;
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
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5">
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
        <div className="space-y-3">
          {entries.map((e: any) => {
            const w = e.flexi_workers;
            const s = e.shifts;
            const info = getBillableInfo(e);
            const cost = calculateCost(info.billableHours, w?.hourly_rate || 12.53);
            const isExpanded = expandedId === e.id;
            const isEditing = editId === e.id;
            const hasExtra = info.earlyMinutes > 0 || info.lateMinutes > 0;

            return (
              <div key={e.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Main row */}
                <div className="px-4 py-3.5 flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                    {w?.first_name?.[0]}{w?.last_name?.[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{w?.first_name} {w?.last_name}</div>
                    <div className="text-xs text-gray-400">
                      {s?.date ? new Date(s.date).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
                      {' · '}{s?.locations?.name || '—'}
                    </div>
                  </div>

                  {/* Times */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                      <Clock size={12} className="text-gray-300" />
                      {info.shiftStart} → {info.shiftEnd}
                    </div>
                    <div className="text-xs text-gray-400">
                      Pointé {info.clockInStr} → {info.clockOutStr}
                    </div>
                  </div>

                  {/* Hours + Cost */}
                  <div className="text-right flex-shrink-0 w-20">
                    <div className="text-sm font-bold text-gray-900">{formatH(info.billableHours)}</div>
                    <div className="text-xs text-gray-400">{formatEuro(cost.total_cost)}</div>
                  </div>

                  {/* Expand button */}
                  <button onClick={() => setExpandedId(isExpanded ? null : e.id)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>

                  {/* Cancel */}
                  <button onClick={(ev) => { ev.stopPropagation(); setCancelConfirmId(e.id); }}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
                    title="Annuler ce shift">
                    <XCircle size={16} />
                  </button>

                  {/* Validate */}
                  <button onClick={() => handleValidate(e.id)} disabled={isPending}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0">
                    ✓ Valider
                  </button>
                </div>

                {/* Early/late badge */}
                {hasExtra && !isExpanded && (
                  <div className="px-4 pb-3 -mt-1">
                    <div className="flex items-center gap-2">
                      {info.earlyMinutes > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
                          ↑ Arrivé {info.earlyMinutes}min avant le shift
                        </span>
                      )}
                      {info.lateMinutes > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                          ↓ Parti {info.lateMinutes}min après le shift
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {/* Planned */}
                      <div className="p-3 bg-gray-50 rounded-xl">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Shift prévu</div>
                        <div className="text-sm font-medium text-gray-700">{info.shiftStart} → {info.shiftEnd}</div>
                      </div>
                      {/* Actual */}
                      <div className="p-3 bg-gray-50 rounded-xl">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Pointage réel</div>
                        <div className="text-sm font-medium text-gray-700">{info.clockInStr} → {info.clockOutStr}</div>
                      </div>
                    </div>

                    {/* Extra time info */}
                    {hasExtra && (
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle size={14} className="text-amber-500" />
                          <span className="text-xs font-bold text-amber-700">Heures hors shift</span>
                        </div>
                        <p className="text-xs text-amber-600">
                          Par défaut, seules les heures dans le créneau du shift ({info.shiftStart}–{info.shiftEnd}) sont comptées = <strong>{formatH(info.billableHours)}</strong>.
                          {info.earlyMinutes > 0 && ` Le flexi est arrivé ${info.earlyMinutes}min en avance.`}
                          {info.lateMinutes > 0 && ` Le flexi est parti ${info.lateMinutes}min après.`}
                          {' '}Total réel = <strong>{formatH(info.actualHours)}</strong>.
                        </p>
                        <p className="text-xs text-amber-600 mt-1">
                          Pour compter les heures supplémentaires, cliquez &quot;Ajuster les heures&quot; ci-dessous.
                        </p>
                      </div>
                    )}

                    {/* Cost breakdown */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      <div className="p-2.5 bg-gray-50 rounded-xl text-center">
                        <div className="text-[10px] text-gray-400 font-medium">Heures</div>
                        <div className="text-sm font-bold text-gray-800">{formatH(info.billableHours)}</div>
                      </div>
                      <div className="p-2.5 bg-gray-50 rounded-xl text-center">
                        <div className="text-[10px] text-gray-400 font-medium">Salaire</div>
                        <div className="text-sm font-bold text-gray-800">{formatEuro(cost.total_salary)}</div>
                      </div>
                      <div className="p-2.5 bg-gray-50 rounded-xl text-center">
                        <div className="text-[10px] text-gray-400 font-medium">Cotisation 28%</div>
                        <div className="text-sm font-bold text-gray-800">{formatEuro(cost.employer_contribution)}</div>
                      </div>
                      <div className="p-2.5 bg-orange-50 rounded-xl text-center">
                        <div className="text-[10px] text-orange-500 font-medium">Coût total</div>
                        <div className="text-sm font-bold text-orange-700">{formatEuro(cost.total_cost)}</div>
                      </div>
                    </div>

                    {/* Edit hours */}
                    {!isEditing ? (
                      <button onClick={() => openEdit(e)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:text-orange-600 hover:border-orange-200 transition-colors font-medium">
                        <Pencil size={14} /> Ajuster les heures
                      </button>
                    ) : (
                      <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                        <p className="text-xs text-blue-700 font-medium mb-3">Modifier les heures comptées :</p>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex-1">
                            <label className="block text-[10px] text-blue-600 font-medium mb-1">Début</label>
                            <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:border-blue-400 focus:outline-none bg-white" />
                          </div>
                          <span className="text-gray-300 mt-5">→</span>
                          <div className="flex-1">
                            <label className="block text-[10px] text-blue-600 font-medium mb-1">Fin</label>
                            <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:border-blue-400 focus:outline-none bg-white" />
                          </div>
                        </div>
                        {/* Preview */}
                        {editStart && editEnd && (() => {
                          const [hs, ms] = editStart.split(':').map(Number);
                          const [he, me] = editEnd.split(':').map(Number);
                          const newHours = Math.max(0, (he * 60 + me - hs * 60 - ms) / 60);
                          const newCost = calculateCost(newHours, w?.hourly_rate || 12.53);
                          return (
                            <div className="text-xs text-blue-600 mb-3">
                              Nouveau calcul : <strong>{formatH(newHours)}</strong> → <strong>{formatEuro(newCost.total_cost)}</strong>
                            </div>
                          );
                        })()}
                        <div className="flex gap-2">
                          <button onClick={() => setEditId(null)}
                            className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-lg py-2 text-xs font-medium hover:bg-gray-50">Annuler</button>
                          <button onClick={() => saveEdit(e)} disabled={isPending}
                            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 text-xs font-medium disabled:opacity-50">
                            {isPending ? 'Enregistrement...' : 'Enregistrer'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel confirmation modal */}
      {cancelConfirmId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-900 mb-2">Annuler ce shift ?</h3>
            <p className="text-sm text-gray-600 mb-1">Le pointage sera supprimé et le shift passera en &quot;annulé&quot;.</p>
            <p className="text-xs text-red-500 mb-4">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelConfirmId(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">
                Retour
              </button>
              <button onClick={() => handleCancel(cancelConfirmId)} disabled={isPending}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">
                {isPending ? '...' : 'Annuler le shift'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
