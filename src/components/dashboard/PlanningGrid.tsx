'use client';

import { useState, useTransition } from 'react';
import { createShift, proposeShift, cancelShift } from '@/lib/actions/shifts';
import { calculateHours, calculateCost, formatEuro } from '@/utils';
import { Plus, X } from 'lucide-react';

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Brouillon' },
  proposed: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Proposé' },
  accepted: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Accepté' },
  refused: { bg: 'bg-red-50', text: 'text-red-600', label: 'Refusé' },
  completed: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Terminé' },
  cancelled: { bg: 'bg-gray-50', text: 'text-gray-400', label: 'Annulé' },
};

interface Props {
  shifts: any[];
  locations: any[];
  workers: any[];
  availabilities: any[];
  weekStart: string;
}

export default function PlanningGrid({ shifts, locations, workers, availabilities, weekStart }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState('');
  const [modalLocation, setModalLocation] = useState('');
  const [isPending, startTransition] = useTransition();

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return {
      date: d,
      iso: d.toISOString().split('T')[0],
      label: DAY_NAMES[i],
      num: d.getDate(),
    };
  });

  const today = new Date().toISOString().split('T')[0];

  const handleCreateShift = (formData: FormData) => {
    startTransition(async () => {
      await createShift({
        location_id: formData.get('location_id') as string,
        worker_id: formData.get('worker_id') as string || undefined,
        date: formData.get('date') as string,
        start_time: formData.get('start_time') as string,
        end_time: formData.get('end_time') as string,
        role: formData.get('role') as any,
      });
      setShowModal(false);
    });
  };

  const handlePropose = (shiftId: string) => {
    startTransition(() => proposeShift(shiftId));
  };

  const handleCancel = (shiftId: string) => {
    startTransition(() => cancelShift(shiftId));
  };

  const openModal = (date: string, locationId: string) => {
    setModalDate(date);
    setModalLocation(locationId);
    setShowModal(true);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planning</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Semaine du {new Date(weekStart).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => { setModalDate(today); setModalLocation(locations[0]?.id || ''); setShowModal(true); }}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1"
        >
          <Plus size={16} /> Nouveau shift
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium w-24">Location</th>
                {weekDays.map((d) => (
                  <th key={d.iso} className={`text-center px-2 py-3 text-xs font-medium min-w-[120px] ${d.iso === today ? 'text-orange-600 bg-orange-50' : 'text-gray-500'}`}>
                    {d.label} {d.num}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locations.map((loc: any) => (
                <tr key={loc.id} className="border-t border-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800 align-top">{loc.name}</td>
                  {weekDays.map((d) => {
                    const dayShifts = shifts.filter((s: any) => s.date === d.iso && s.location_id === loc.id);
                    return (
                      <td key={d.iso} className={`px-2 py-2 align-top ${d.iso === today ? 'bg-orange-50/50' : ''}`}>
                        <div className="space-y-1 min-h-[4rem]">
                          {dayShifts.map((s: any) => {
                            const w = s.flexi_workers;
                            const sc = statusStyles[s.status] || statusStyles.draft;
                            const hours = calculateHours(s.start_time, s.end_time);
                            const cost = calculateCost(hours, w?.hourly_rate || 12.53);

                            return (
                              <div key={s.id} className={`${sc.bg} rounded-lg p-1.5 text-[10px] leading-tight group relative`}>
                                <div className={`font-bold ${sc.text}`}>{w ? `${w.first_name}` : '?'}</div>
                                <div className="text-gray-500">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</div>
                                <div className={`text-[9px] mt-0.5 ${sc.text}`}>{sc.label}</div>
                                <div className="text-gray-400 mt-0.5">{formatEuro(cost.total_cost)}</div>

                                {s.status === 'draft' && (
                                  <div className="hidden group-hover:flex absolute top-0 right-0 gap-0.5 p-0.5">
                                    <button onClick={() => handlePropose(s.id)} className="bg-amber-500 text-white rounded px-1 py-0.5 text-[8px]">Proposer</button>
                                    <button onClick={() => handleCancel(s.id)} className="bg-gray-300 text-gray-600 rounded px-1 py-0.5 text-[8px]">×</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          <button
                            onClick={() => openModal(d.iso, loc.id)}
                            className="w-full py-1 text-gray-300 hover:text-orange-400 hover:bg-orange-50 rounded text-xs transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Shift Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Nouveau shift</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form action={handleCreateShift} className="space-y-3">
              <input type="hidden" name="date" value={modalDate} />

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
                <select name="location_id" defaultValue={modalLocation} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                  {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Flexi worker</label>
                <select name="worker_id" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                  <option value="">— Non assigné —</option>
                  {workers.map((w: any) => <option key={w.id} value={w.id}>{w.first_name} {w.last_name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Début</label>
                  <input type="time" name="start_time" defaultValue="11:00" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fin</label>
                  <input type="time" name="end_time" defaultValue="15:00" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" required />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Rôle</label>
                <select name="role" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                  <option value="polyvalent">Polyvalent</option>
                  <option value="cuisine">Cuisine</option>
                  <option value="caisse">Caisse</option>
                </select>
              </div>

              <button type="submit" disabled={isPending}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm transition-colors disabled:opacity-50">
                {isPending ? 'Création...' : 'Créer le shift'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
