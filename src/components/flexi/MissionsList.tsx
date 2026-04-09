'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptShift, refuseShift } from '@/lib/actions/shifts';
import { calculateHours } from '@/utils';
import { haversineKm, KM_RATE_CP302, LOCATION_COORDS } from '@/lib/transport';
import { FLEXI_CONSTANTS, getDefaultRate } from '@/types';
import { Clock, MapPin, Car, CheckCircle } from 'lucide-react';

interface MissionsListProps {
  proposed: any[];
  history: any[];
  hourlyRate: number;
  workerStatus: string;
  homeLat: number | null;
  homeLng: number | null;
}

const statusLabels: Record<string, { label: string; class: string }> = {
  draft:     { label: 'Brouillon', class: 'bg-gray-100 text-gray-600' },
  accepted:  { label: 'Accepté',   class: 'bg-emerald-50 text-emerald-700' },
  refused:   { label: 'Refusé',    class: 'bg-red-50 text-red-600' },
  completed: { label: 'Terminé',   class: 'bg-blue-50 text-blue-600' },
  cancelled: { label: 'Annulé',    class: 'bg-gray-50 text-gray-400' },
};

function calcNet(hours: number, rate: number, status: string) {
  const gross = Math.round(hours * rate * 100) / 100;
  const solidarity = status === 'student'
    ? Math.round(gross * FLEXI_CONSTANTS.SOLIDARITY_CONTRIBUTION_STUDENT * 100) / 100
    : 0;
  const net = Math.round((gross - solidarity) * 100) / 100;
  return { gross, solidarity, net };
}

function calcTransport(locationName: string, homeLat: number | null, homeLng: number | null) {
  if (!homeLat || !homeLng) return null;
  const coords = LOCATION_COORDS[locationName];
  if (!coords) return null;
  const km = Math.round(haversineKm(homeLat, homeLng, coords.lat, coords.lng) * 10) / 10;
  const allowance = Math.round(km * KM_RATE_CP302 * 100) / 100;
  return { km, allowance };
}

function fmt(n: number) {
  return n.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Get actual hours from time_entries if available */
function getActualData(shift: any): {
  hasActual: boolean;
  actualHours: number | null;
  clockIn: string | null;
  clockOut: string | null;
  validated: boolean;
} {
  const entries = shift.time_entries;
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return { hasActual: false, actualHours: null, clockIn: null, clockOut: null, validated: false };
  }
  // Take the first (and usually only) time entry
  const entry = entries[0];
  const clockIn = entry.clock_in;
  const clockOut = entry.clock_out;
  const validated = entry.validated || false;

  let actualHours = entry.actual_hours;
  // Calculate from timestamps if actual_hours not set
  if (!actualHours && clockIn && clockOut) {
    const diffMs = new Date(clockOut).getTime() - new Date(clockIn).getTime();
    actualHours = Math.round((diffMs / 3600000) * 100) / 100;
  }

  return {
    hasActual: !!clockIn,
    actualHours,
    clockIn,
    clockOut,
    validated,
  };
}

/** Format a timestamp to HH:MM in Brussels timezone */
function formatTime(ts: string | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleTimeString('fr-BE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Brussels',
    });
  } catch {
    return '—';
  }
}

/** Format hours as Xh XXmin */
function formatHours(h: number | null): string {
  if (!h) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}min`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h${String(mins).padStart(2, '0')}`;
}

function EarningsBreakdown({ shift, hourlyRate, workerStatus, homeLat, homeLng }: {
  shift: any; hourlyRate: number; workerStatus: string;
  homeLat: number | null; homeLng: number | null;
}) {
  const hours = calculateHours(shift.start_time, shift.end_time);
  const rate  = hourlyRate || getDefaultRate(workerStatus as any);
  const { gross, solidarity, net } = calcNet(hours, rate, workerStatus);
  const transport = calcTransport(shift.locations?.name, homeLat, homeLng);
  const total = Math.round((net + (transport?.allowance ?? 0)) * 100) / 100;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
      <div className="flex justify-between text-sm text-gray-500">
        <span className="flex items-center gap-1.5">
          <Clock size={12} />{hours}h × {fmt(rate)} €/h
        </span>
        <span>{fmt(gross)} €</span>
      </div>

      {solidarity > 0 && (
        <div className="flex justify-between text-xs text-orange-500">
          <span>Cotisation solidarité (2,71 %)</span>
          <span>− {fmt(solidarity)} €</span>
        </div>
      )}

      {transport ? (
        <div className="flex justify-between text-xs text-blue-500">
          <span className="flex items-center gap-1.5">
            <Car size={11} />Trajet {shift.locations?.name} · {transport.km} km
          </span>
          <span>+ {fmt(transport.allowance)} €</span>
        </div>
      ) : (
        <div className="text-[11px] text-gray-400 italic flex items-center gap-1.5">
          <Car size={10} />Frais trajet : complète ton adresse dans ton profil
        </div>
      )}

      <div className="flex justify-between text-sm font-bold text-emerald-600 pt-1.5 border-t border-gray-100">
        <span>Total estimé</span>
        <span>≈ {fmt(total)} €</span>
      </div>
    </div>
  );
}

function HistoryEarnings({ shift, hourlyRate, workerStatus, homeLat, homeLng }: {
  shift: any; hourlyRate: number; workerStatus: string;
  homeLat: number | null; homeLng: number | null;
}) {
  if (!['accepted', 'completed'].includes(shift.status)) return null;

  const actual = getActualData(shift);
  // Use actual hours if available, otherwise planned
  const hours = actual.actualHours || calculateHours(shift.start_time, shift.end_time);
  const rate  = hourlyRate || getDefaultRate(workerStatus as any);
  const { net } = calcNet(hours, rate, workerStatus);
  const transport = calcTransport(shift.locations?.name, homeLat, homeLng);
  const total = Math.round((net + (transport?.allowance ?? 0)) * 100) / 100;

  return <span className="text-emerald-600 font-semibold"> · ≈ {fmt(total)} €</span>;
}

export default function MissionsList({
  proposed, history, hourlyRate, workerStatus, homeLat, homeLng,
}: MissionsListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = (shiftId: string) => {
    setProcessingId(shiftId);
    setError(null);
    startTransition(async () => {
      const result = await acceptShift(shiftId);
      if (result?.error) setError(result.error);
      setProcessingId(null);
      router.refresh();
    });
  };

  const handleRefuse = (shiftId: string) => {
    setProcessingId(shiftId);
    setError(null);
    startTransition(async () => {
      const result = await refuseShift(shiftId);
      if (result?.error) setError(result.error);
      setProcessingId(null);
      router.refresh();
    });
  };

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2 text-lg leading-none">&times;</button>
        </div>
      )}

      {proposed.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-800 mb-3">Nouvelles missions</h2>
          <div className="space-y-3 mb-6">
            {proposed.map((shift) => {
              const isProcessing = processingId === shift.id;
              return (
                <div key={shift.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 border-l-4 border-l-amber-400">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <p className="font-bold text-gray-900">
                        {new Date(shift.date).toLocaleDateString('fr-BE', {
                          weekday: 'long', day: 'numeric', month: 'long',
                        })}
                      </p>
                      <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                        <MapPin size={13} />
                        <span>{shift.locations?.name}</span>
                        <span className="text-gray-300 mx-1">·</span>
                        <span>{shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}</span>
                      </div>
                    </div>
                    <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium capitalize">
                      {shift.role}
                    </span>
                  </div>

                  <EarningsBreakdown
                    shift={shift}
                    hourlyRate={hourlyRate}
                    workerStatus={workerStatus}
                    homeLat={homeLat}
                    homeLng={homeLng}
                  />

                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleAccept(shift.id)} disabled={isProcessing}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-50">
                      {isProcessing ? '...' : '✓ Accepter'}
                    </button>
                    <button onClick={() => handleRefuse(shift.id)} disabled={isProcessing}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50">
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
          const actual = getActualData(shift);

          return (
            <div key={shift.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">
                    {new Date(shift.date).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
                    {' · '}{shift.locations?.name}
                  </p>

                  {actual.hasActual ? (
                    // Show actual clocked times
                    <div className="flex items-center gap-1 text-xs mt-0.5">
                      <Clock size={11} className="text-blue-500" />
                      <span className="text-blue-600 font-medium">
                        {formatTime(actual.clockIn)}–{formatTime(actual.clockOut)}
                      </span>
                      <span className="text-gray-400">·</span>
                      <span className="text-blue-600 font-semibold">
                        {formatHours(actual.actualHours)}
                      </span>
                      {actual.validated && (
                        <CheckCircle size={11} className="text-emerald-500 ml-0.5" />
                      )}
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-400">{shift.role}</span>
                      <HistoryEarnings
                        shift={shift}
                        hourlyRate={hourlyRate}
                        workerStatus={workerStatus}
                        homeLat={homeLat}
                        homeLng={homeLng}
                      />
                    </div>
                  ) : (
                    // Fallback: planned shift times
                    <p className="text-xs text-gray-400 mt-0.5">
                      {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} · {shift.role}
                      <HistoryEarnings
                        shift={shift}
                        hourlyRate={hourlyRate}
                        workerStatus={workerStatus}
                        homeLat={homeLat}
                        homeLng={homeLng}
                      />
                    </p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ml-2 ${s.class}`}>{s.label}</span>
              </div>
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