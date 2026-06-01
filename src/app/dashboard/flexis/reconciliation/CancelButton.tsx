// src/app/dashboard/flexis/reconciliation/CancelButton.tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiCancelDimona } from '@/lib/actions/dimona';

export default function CancelButton({ dimonaId, label }: { dimonaId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onClick() {
    const confirmed = window.confirm(
      `Annuler la Dimona de ${label} ?\n\n` +
      `Un Dimona-Cancel sera envoyé à l'ONSS et le shift passera en « annulé ». ` +
      `Action irréversible.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      setMsg(null);
      try {
        const res: any = await apiCancelDimona(dimonaId, 'no_show');
        if (res?.success) {
          setMsg({ ok: true, text: 'Annulée ✓' });
          router.refresh();
        } else {
          setMsg({ ok: false, text: res?.error || 'Erreur' });
        }
      } catch (e: any) {
        setMsg({ ok: false, text: e?.message || 'Erreur' });
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={pending}
        className="px-3 py-1 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? 'Annulation…' : 'Annuler'}
      </button>
      {msg && (
        <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>
      )}
    </div>
  );
}
