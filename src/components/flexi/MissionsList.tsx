'use client';

import { useState, useTransition } from 'react';
import { acceptShift, refuseShift } from '@/lib/actions/shifts';
import { calculateCost, calculateHours, formatEuro } from '@/utils';
import { Clock, MapPin } from 'lucide-react';

interface MissionsListProps {
  proposed: any[];
  history: any[];
  hourlyRate: number;
}

const statusLabels: Record<string, { label: string; class: string }> = {
  draft: { label: 'Brouillon', class: 'bg-gray-100 text-gray-600' },
  accepted: { label: 'Accepté', class: 'bg-emerald-50 text-emerald-700' },
  refused: { label: 'Refusé', class: 'bg-red-50 text-red-600' },
  completed: { label: 'Terminé', class: 'bg-blue-50 text-blue-600' },
  cancelled: { label: 'Annulé', class: 'bg-gray-50 text-gray-400' },
};

export default function MissionsList({ proposed, history, hourlyRate }: MissionsListProps) {
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleAccept = (shiftId: string) => {
    setProcessingId(shiftId);
    startTransition(async () => {
      await acceptShift(shiftId);
      setProcessingId(null);
    });
  };

  const handleRefuse = (shiftId: string) => {
    setProcessingId(shiftId);
    startTransition(async () => {
      await refuseShift(shiftId);
      setProcessingId(null);
    });
  };

  return (
    <div>
      {proposed.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-800 mb-3">Nouvelles missions</h2>
          <div className="space-y-3 mb-6">
            {proposed.map((shift) => {
              const hours = calculateHours(shift.start_time, shift.end_time);
              const cost = calculateCost(hours, hourlyRate);
              const isProcessing = processingId === shift.id;

              return (
                <div
                  key={shift.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 border-l-4 border-l-amber-400"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-gray-900">
                        {new Date(shift.date).toLocaleDateString('fr-BE', {
                          weekday: 'long', day: 'numeric', month: 'long',
                        })}
                      </p>
                      <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                        <MapPin size={14} />
                        <span>{shift.locations?.name}</span>
                        <span className="text-gray-300 mx-1">·</span>
                        <span>{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</span>
                      </div>
                    </div>
                    <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium capitalize">
                      {shift.role}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                    <Clock size={14} />
                    <span>{hours}h</span>
                    <span className="text-gray-300">·</span>
                    <span className="font-semibold text-emerald-600">
                      ~{formatEuro(cost.total_salary)}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(shift.id)}
                      disabled={isProcessing}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-50"
                    >
                      {isProcessing ? '...' : '✓ Accepter'}
                    </button>
                    <button
                      onClick={() => handleRefuse(shift.id)}
                      disabled={isProcessing}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      Refuser
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {proposed.length === 0 && (
        <div className="text-center py-10 text-gray-400 mb-6">
          <div className="text-4xl mb-2">📋</div>
          <p className="font-medium">Aucune nouvelle mission</p>
          <p className="text-xs mt-1">Les nouvelles missions apparaîtront ici</p>
        </div>
      )}

      <h2 className="text-sm font-bold text-gray-800 mb-3">Historique récent</h2>
      <div className="space-y-2">
        {history.map((shift) => {
          const s = statusLabels[shift.status] || statusLabels.draft;
          return (
            <div key={shift.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {new Date(shift.date).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
                  {' · '}{shift.locations?.name}
                </p>
                <p className="text-xs text-gray-400">
                  {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} · {shift.role}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.class}`}>{s.label}</span>
            </div>
          );
        })}
        {history.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Aucun historique</p>
        )}
      </div>
    </div>
  );
}
