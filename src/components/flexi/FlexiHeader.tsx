'use client';

import type { FlexiWorker } from '@/types';
import { FLEXI_CONSTANTS } from '@/types';

interface FlexiHeaderProps {
  worker: FlexiWorker;
}

export default function FlexiHeader({ worker }: FlexiHeaderProps) {
  const ytdPct = Math.min((worker.ytd_earnings / FLEXI_CONSTANTS.YTD_BLOCKED_THRESHOLD) * 100, 100);
  const isPensioner = worker.status === 'pensioner';

  const alertLabel =
    !isPensioner && worker.ytd_earnings >= 18000 ? 'Plafond atteint' :
    !isPensioner && worker.ytd_earnings > 17000 ? 'Critique' :
    !isPensioner && worker.ytd_earnings > 15000 ? 'Attention' : null;

  return (
    <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-red-600 text-white px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-orange-100 text-xs font-medium tracking-wide">FRITOS FLEXI</p>
          <h1 className="text-xl font-bold">
            Bonjour, {worker.first_name} 👋
          </h1>
        </div>
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
          {worker.first_name[0]}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <div className="bg-white/15 backdrop-blur rounded-lg px-3 py-1.5 text-xs">
          <span className="opacity-70">Gains 2026 :</span>{' '}
          <span className="font-bold">
            {worker.ytd_earnings.toLocaleString('fr-BE')} €
          </span>
          {!isPensioner && (
            <span className="opacity-50"> / 18 000 €</span>
          )}
        </div>
        {alertLabel && (
          <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-medium">
            ⚠ {alertLabel}
          </span>
        )}
      </div>
    </div>
  );
}
