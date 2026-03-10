'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptShift, refuseShift } from '@/lib/actions/shifts';
import { calculateHours } from '@/utils';
import { haversineKm, KM_RATE_CP302, LOCATION_COORDS } from '@/lib/transport';
import { Clock, MapPin, Car } from 'lucide-react';

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

// Taux minimum légal CP 302 (en vigueur au 01/03/2026, pécule vacances 7,67% inclus)
const FLEXI_MIN_RATE = 12.78;

function calcNet(hours: number, rate: number, status: string) {
  const gross = Math.round(hours * rate * 100) / 100;
  // Étudiants : cotisation de solidarité 2,71%
  const solidarity = status === 'student' ? Math.round(gross * 0.0271 * 100) / 100 : 0;
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

// ─── Détail gains (missions proposées) ──────────────────────────────────────
function EarningsBreakdown({ shift, hourlyRate, workerStatus, homeLat, homeLng }: {
  shift: any; hourlyRate: number; workerStatus: string;
  homeLat: number | null; homeLng: number | null;
}) {
  const hours = calculateHours(shift.start_time, shift.end_time);
  const rate  = hourlyRate || FLEXI_MIN_RATE;
  const { gross, solidarity, net } = calcNet(hours, rate, workerStatus);
  const transport = calcTransport(shift.locations?.name, homeLat, homeLng);
  const total = Math.round((net + (transport?.allowance ?? 0)) * 100) / 100;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
      {/* Salaire brut */}
      <div className="flex justify-between text-sm text-gray-500">
        <span className="flex items-center gap-1.5">
          <Clock size={12} />{hours}h × {fmt(rate)} €/h
        </span>
        <span>{fmt(gross)} €</span>
      </div>

      {/* Cotisation solidarité (étudiants uniquement) */}
      {solidarity > 0 && (
        <div className="flex justify-between text-xs text-orange-500">
          <span>Cotisation solidarité (2,71 %)</span>
          <span>− {fmt(solidarity)} €</span>
        </div>
      )}

      {/* Frais de déplacement */}
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

      {/* Total estimé */}
      <div className="flex justify-between text-sm font-bold text-emerald-600 pt-1.5 border-t border-gray-100">
        <span>Total estimé</span>
        <span>≈ {fmt(total)} €</span>
      </div>
    </div>
  );
}

// ─── Montant compact (historique) ───────────────────────────────────────────
function HistoryEarnings({ shift, hourlyRate, workerStatus, homeLat, homeLng }: {
  shift: any; hourlyRate: number; workerStatus: string;
  homeLat: number | null; homeLng: number | null;
}) {
  if (!['accepted', 'completed'].includes(shift.status)) return null;
  const hours = calculateHours(shift.start_time, shift.end_time);
  const rate  = hourlyRate || FLEXI_MIN_RATE;
  const { net } = calcNet(hours, rate, workerStatus);
  const transport = calcTransport(shift.locations?.name, homeLat, homeLng);
  const total = Math.round((net + (transport?.allowance ?? 0)) * 100) / 100;
  return <span className="text-emerald-600 font-semibold"> · ≈ {fmt(total)} €</span>;
}

// ─── Composant principal ─────────────────────────────────────────────────────
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

      {/* ─── Missions proposées ─────────────────────────────────────────── */}
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

      {/* ─── Historique ─────────────────────────────────────────────────── */}
      <h2 className="text-sm font-bold text-gray-800 mb-3">Historique récent</h2>
      <div className="space-y-2">
        {history.map((shift) => {
          const s = statusLabels[shift.status] || statusLabels.draft;
          return (
            <div key={shift.id}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {new Date(shift.date).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}
                  {' · '}{shift.locations?.name}
                </p>
                <p className="text-xs text-gray-400">
                  {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)} · {shift.role}
                  <HistoryEarnings
                    shift={shift}
                    hourlyRate={hourlyRate}
                    workerStatus={workerStatus}
                    homeLat={homeLat}
                    homeLng={homeLng}
                  />
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
