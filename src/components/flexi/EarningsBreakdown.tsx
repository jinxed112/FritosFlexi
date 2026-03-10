// src/components/flexi/EarningsBreakdown.tsx
// Affiche le détail du salaire estimé + frais de déplacement pour un shift.

"use client";

import { calcShiftEarnings, calcTransportAllowance, KM_RATE_CP302 } from "@/lib/transport";

interface Props {
  startTime: string;      // "HH:mm"
  endTime: string;        // "HH:mm"
  hourlyRate: number;
  workerStatus: string;   // 'student' | 'flexi' | 'pensioner' | ...
  locationName: string;   // 'Jurbise' | 'Boussu'
  homeLat: number | null;
  homeLng: number | null;
}

export default function EarningsBreakdown({
  startTime,
  endTime,
  hourlyRate,
  workerStatus,
  locationName,
  homeLat,
  homeLng,
}: Props) {
  const { hours, grossSalary, solidarityDeduction, netSalary } =
    calcShiftEarnings(startTime, endTime, hourlyRate, workerStatus);

  const transport = calcTransportAllowance(homeLat, homeLng, locationName);

  const totalEstimated =
    Math.round((netSalary + (transport?.allowance ?? 0)) * 100) / 100;

  const fmt = (n: number) =>
    n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 space-y-2 text-sm">
      {/* Salaire */}
      <div className="flex justify-between text-gray-300">
        <span>
          {hours}h × {fmt(hourlyRate)} €/h
        </span>
        <span>{fmt(grossSalary)} €</span>
      </div>

      {/* Cotisation solidarité étudiants */}
      {solidarityDeduction > 0 && (
        <div className="flex justify-between text-orange-400">
          <span>Cotisation solidarité (2,71 %)</span>
          <span>− {fmt(solidarityDeduction)} €</span>
        </div>
      )}

      {/* Salaire net */}
      <div className="flex justify-between text-white font-medium">
        <span>Salaire net</span>
        <span>{fmt(netSalary)} €</span>
      </div>

      {/* Frais de déplacement */}
      {transport ? (
        <div className="flex justify-between text-blue-400">
          <span>
            Frais trajet ({transport.distanceKm} km × {KM_RATE_CP302} €)
          </span>
          <span>+ {fmt(transport.allowance)} €</span>
        </div>
      ) : (
        <div className="text-xs text-gray-500 italic">
          Frais trajet non calculés — complète ton adresse dans ton profil
        </div>
      )}

      {/* Séparateur */}
      <div className="border-t border-white/10 pt-2 flex justify-between text-green-400 font-bold">
        <span>Total estimé</span>
        <span>≈ {fmt(totalEstimated)} €</span>
      </div>
    </div>
  );
}
