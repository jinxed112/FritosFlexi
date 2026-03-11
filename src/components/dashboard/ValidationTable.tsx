'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { validateTimeEntry, correctTimeEntry } from '@/lib/actions/clock';
import { cancelShiftFromValidation } from '@/lib/actions/cancel-shift';
import { calculateCost, formatEuro } from '@/utils';
import {
  CheckSquare, Clock, ChevronDown, ChevronUp, AlertTriangle,
  Pencil, XCircle, History, CheckCircle2, ChevronLeft, ChevronRight,
} from 'lucide-react';

interface Props {
  entries: any[];
  validatedEntries: any[];
}

export default function ValidationTable({ entries, validatedEntries }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  // Historique
  const [showHistory, setShowHistory] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Grouper les entrées validées par mois
  const monthsMap: Record<string, any[]> = {};
  for (const e of validatedEntries) {
    const date = e.shifts?.date || e.validated_at?.slice(0, 10) || '';
    if (!date) continue;
    const key = date.slice(0, 7); // YYYY-MM
    if (!monthsMap[key]) monthsMap[key] = [];
    monthsMap[key].push(e);
  }
  const monthKeys = Object.keys(monthsMap).sort((a, b) => b.localeCompare(a));

  // Mois sélectionné par défaut = le plus récent
  const activeMonth = selectedMonth || monthKeys[0] || '';
  const historyEntries = monthsMap[activeMonth] || [];

  const formatMonthLabel = (key: string) => {
    if (!key) return '';
    const [year, month] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
  };

  // Stats du mois sélectionné
  const monthStats = historyEntries.reduce(
    (acc, e) => {
      const info = getBillableInfo(e);
      const cost = calculateCost(info.billableHours, e.flexi_workers?.hourly_rate || 12.53, false, e.flexi_workers?.status || 'other');
      return {
        hours: acc.hours + info.billableHours,
        cost: acc.cost + cost.total_cost,
        count: acc.count + 1,
      };
    },
    { hours: 0, cost: 0, count: 0 }
  );

  // Actions
  const handleValidate = (id: string) => {
    startTransition(async () => { await validateTimeEntry(id); router.refresh(); });
  };

  const handleValidateAll = () => {
    startTransition(async () => {
      for (const e of entries) await validateTimeEntry(e.id);
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
    const clockIn = new Date(entry.clock_in);
    const clockOut = new Date(entry.clock_out);
    setEditId(entry.id);
    setEditStart(clockIn.toTimeString().slice(0, 5));
    setEditEnd(clockOut.toTimeString().slice(0, 5));
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

  const formatH = (h: number) => {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h${String(mins).padStart(2, '0')}` : `${hrs}h`;
  };

  return (
    <>
      {/* ─── EN-TÊTE ─── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Validation</h1>
          <p className="text-sm text-gray-400 mt-0.5">{entries.length} entrée(s) à valider</p>
        </div>
        <div className="flex items-center gap-2">
          {validatedEntries.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                showHistory
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              <History size={15} />
              Historique ({validatedEntries.length})
            </button>
          )}
          {entries.length > 0 && (
            <button
              onClick={handleValidateAll}
              disabled={isPending}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckSquare size={16} /> Tout valider
            </button>
          )}
        </div>
      </div>

      {/* ─── ENTRÉES À VALIDER ─── */}
      {entries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
          <div className="text-4xl mb-2">✓</div>
          <p className="font-medium">Toutes les heures sont validées</p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {entries.map((e: any) => (
            <EntryCard
              key={e.id}
              entry={e}
              isPending={isPending}
              expandedId={expandedId}
              editId={editId}
              editStart={editStart}
              editEnd={editEnd}
              isValidated={false}
              onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              onEdit={openEdit}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditId(null)}
              onSetEditStart={setEditStart}
              onSetEditEnd={setEditEnd}
              onValidate={handleValidate}
              onCancelShift={(id) => setCancelConfirmId(id)}
              formatH={formatH}
            />
          ))}
        </div>
      )}

      {/* ─── HISTORIQUE PAR MOIS ─── */}
      {showHistory && monthKeys.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-gray-100" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Historique validé</span>
            <div className="h-px flex-1 bg-gray-100" />
          </div>

          {/* Sélecteur de mois */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => {
                const idx = monthKeys.indexOf(activeMonth);
                if (idx < monthKeys.length - 1) setSelectedMonth(monthKeys[idx + 1]);
              }}
              disabled={monthKeys.indexOf(activeMonth) >= monthKeys.length - 1}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} className="text-gray-500" />
            </button>

            <div className="flex-1 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {monthKeys.map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedMonth(key)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                    key === activeMonth
                      ? 'bg-gray-900 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {formatMonthLabel(key)}
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                const idx = monthKeys.indexOf(activeMonth);
                if (idx > 0) setSelectedMonth(monthKeys[idx - 1]);
              }}
              disabled={monthKeys.indexOf(activeMonth) <= 0}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} className="text-gray-500" />
            </button>
          </div>

          {/* Stats du mois */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <div className="text-xs text-gray-400 font-medium mb-1">Shifts</div>
              <div className="text-xl font-bold text-gray-900">{monthStats.count}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <div className="text-xs text-gray-400 font-medium mb-1">Heures totales</div>
              <div className="text-xl font-bold text-gray-900">{formatH(monthStats.hours)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <div className="text-xs text-orange-400 font-medium mb-1">Coût total</div>
              <div className="text-xl font-bold text-orange-600">{formatEuro(monthStats.cost)}</div>
            </div>
          </div>

          {/* Entrées du mois */}
          <div className="space-y-3">
            {historyEntries.map((e: any) => (
              <EntryCard
                key={e.id}
                entry={e}
                isPending={isPending}
                expandedId={expandedId}
                editId={editId}
                editStart={editStart}
                editEnd={editEnd}
                isValidated={true}
                onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                onEdit={openEdit}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditId(null)}
                onSetEditStart={setEditStart}
                onSetEditEnd={setEditEnd}
                onValidate={handleValidate}
                onCancelShift={(id) => setCancelConfirmId(id)}
                formatH={formatH}
              />
            ))}
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

// ─────────────────────────────────────────────
// Utilitaire : heures facturables (capped au shift)
// ─────────────────────────────────────────────
function getBillableInfo(entry: any) {
  const s = entry.shifts;
  const clockIn = new Date(entry.clock_in);
  const clockOut = new Date(entry.clock_out);
  const shiftDate = s?.date || clockIn.toISOString().split('T')[0];

  const [sh, sm] = (s?.start_time || '17:00').split(':').map(Number);
  const [eh, em] = (s?.end_time || '21:30').split(':').map(Number);
  const shiftStart = new Date(`${shiftDate}T${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`);
  const shiftEnd = new Date(`${shiftDate}T${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`);

  // Heures reelles = heures facturables (le manager ajuste via Ajuster les heures)
  const actualHours = (clockOut.getTime() - clockIn.getTime()) / 3600000;
  const billableHours = actualHours;
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
}

// ─────────────────────────────────────────────
// Composant carte d'entrée (réutilisé pending + historique)
// ─────────────────────────────────────────────
interface CardProps {
  entry: any;
  isPending: boolean;
  expandedId: string | null;
  editId: string | null;
  editStart: string;
  editEnd: string;
  isValidated: boolean;
  onExpand: (id: string) => void;
  onEdit: (entry: any) => void;
  onSaveEdit: (entry: any) => void;
  onCancelEdit: () => void;
  onSetEditStart: (v: string) => void;
  onSetEditEnd: (v: string) => void;
  onValidate: (id: string) => void;
  onCancelShift: (id: string) => void;
  formatH: (h: number) => string;
}

function EntryCard({
  entry, isPending, expandedId, editId, editStart, editEnd, isValidated,
  onExpand, onEdit, onSaveEdit, onCancelEdit, onSetEditStart, onSetEditEnd,
  onValidate, onCancelShift, formatH,
}: CardProps) {
  const w = entry.flexi_workers;
  const s = entry.shifts;
  const info = getBillableInfo(entry);
  const cost = calculateCost(info.billableHours, w?.hourly_rate || 12.53, false, w?.status || 'other');
  const isExpanded = expandedId === entry.id;
  const isEditing = editId === entry.id;
  const hasExtra = info.earlyMinutes > 0 || info.lateMinutes > 0;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
      isValidated ? 'border-emerald-100' : 'border-gray-100'
    }`}>
      {/* Ligne principale */}
      <div className="px-4 py-3.5 flex items-center gap-3">
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
          <div className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            {w?.first_name} {w?.last_name}
            {isValidated && <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />}
          </div>
          <div className="text-xs text-gray-400">
            {s?.date ? new Date(s.date).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
            {' · '}{s?.locations?.name || '—'}
          </div>
        </div>

        {/* Horaires */}
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
            <Clock size={12} className="text-gray-300" />
            {info.shiftStart} → {info.shiftEnd}
          </div>
          <div className="text-xs text-gray-400">
            Pointé {info.clockInStr} → {info.clockOutStr}
          </div>
        </div>

        {/* Heures + coût */}
        <div className="text-right flex-shrink-0 w-20">
          <div className="text-sm font-bold text-gray-900">{formatH(info.billableHours)}</div>
          <div className="text-xs text-gray-400">{formatEuro(cost.total_cost)}</div>
        </div>

        {/* Expand */}
        <button onClick={() => onExpand(entry.id)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Actions selon statut */}
        {isValidated ? (
          <button onClick={() => onEdit(entry)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-orange-300 hover:text-orange-600 text-gray-500 text-xs font-medium transition-colors flex-shrink-0">
            <Pencil size={12} /> Modifier
          </button>
        ) : (
          <>
            <button onClick={(ev) => { ev.stopPropagation(); onCancelShift(entry.id); }}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
              title="Annuler ce shift">
              <XCircle size={16} />
            </button>
            <button onClick={() => onValidate(entry.id)} disabled={isPending}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0">
              ✓ Valider
            </button>
          </>
        )}
      </div>

      {/* Badge hors-shift (résumé, non expanded) */}
      {hasExtra && !isExpanded && !isValidated && (
        <div className="px-4 pb-3 -mt-1 flex items-center gap-2">
          {info.earlyMinutes > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
              ↑ Arrivé {info.earlyMinutes}min avant
            </span>
          )}
          {info.lateMinutes > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
              ↓ Parti {info.lateMinutes}min après
            </span>
          )}
        </div>
      )}

      {/* Détail expandé */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-50 pt-3">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Shift prévu</div>
              <div className="text-sm font-medium text-gray-700">{info.shiftStart} → {info.shiftEnd}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">Pointage réel</div>
              <div className="text-sm font-medium text-gray-700">{info.clockInStr} → {info.clockOutStr}</div>
            </div>
          </div>

          {hasExtra && !isValidated && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl mb-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-amber-500" />
                <span className="text-xs font-bold text-amber-700">Heures hors shift</span>
              </div>
              <p className="text-xs text-amber-600">
                Seules les heures dans le créneau ({info.shiftStart}–{info.shiftEnd}) sont comptées = <strong>{formatH(info.billableHours)}</strong>.
                {info.earlyMinutes > 0 && ` Arrivé ${info.earlyMinutes}min en avance.`}
                {info.lateMinutes > 0 && ` Parti ${info.lateMinutes}min après.`}
                {' '}Total réel = <strong>{formatH(info.actualHours)}</strong>.
              </p>
            </div>
          )}

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
              <div className="text-[10px] text-gray-400 font-medium">{w?.status === 'student' ? 'Cotisation 5,42%' : 'Cotisation 28%'}</div>
              <div className="text-sm font-bold text-gray-800">{formatEuro(cost.employer_contribution)}</div>
            </div>
            <div className="p-2.5 bg-orange-50 rounded-xl text-center">
              <div className="text-[10px] text-orange-500 font-medium">Coût total</div>
              <div className="text-sm font-bold text-orange-700">{formatEuro(cost.total_cost)}</div>
            </div>
          </div>

          {/* Form de modification */}
          {isEditing ? (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-xs text-blue-700 font-medium mb-3">
                {isValidated ? 'Modifier les heures (l\'entrée reste validée) :' : 'Modifier les heures comptées :'}
              </p>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1">
                  <label className="block text-[10px] text-blue-600 font-medium mb-1">Début</label>
                  <input type="time" value={editStart} onChange={(e) => onSetEditStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:border-blue-400 focus:outline-none bg-white" />
                </div>
                <span className="text-gray-300 mt-5">→</span>
                <div className="flex-1">
                  <label className="block text-[10px] text-blue-600 font-medium mb-1">Fin</label>
                  <input type="time" value={editEnd} onChange={(e) => onSetEditEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:border-blue-400 focus:outline-none bg-white" />
                </div>
              </div>
              {editStart && editEnd && (() => {
                const [hs, ms] = editStart.split(':').map(Number);
                const [he, me] = editEnd.split(':').map(Number);
                const newHours = Math.max(0, (he * 60 + me - hs * 60 - ms) / 60);
                const newCost = calculateCost(newHours, w?.hourly_rate || 12.53, false, w?.status || 'other');
                return (
                  <div className="text-xs text-blue-600 mb-3">
                    Nouveau calcul : <strong>{formatH(newHours)}</strong> → <strong>{formatEuro(newCost.total_cost)}</strong>
                  </div>
                );
              })()}
              <div className="flex gap-2">
                <button onClick={onCancelEdit}
                  className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-lg py-2 text-xs font-medium hover:bg-gray-50">
                  Annuler
                </button>
                <button onClick={() => onSaveEdit(entry)} disabled={isPending}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-2 text-xs font-medium disabled:opacity-50">
                  {isPending ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => onEdit(entry)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:text-orange-600 hover:border-orange-200 transition-colors font-medium">
              <Pencil size={14} />
              {isValidated ? 'Modifier ces heures' : 'Ajuster les heures'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
