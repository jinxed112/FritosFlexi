'use client';

import { useState, useEffect, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { updateProfile } from '@/lib/actions/workers';
import { validateNISS, formatNISS, validateIBAN, formatIBAN, validatePhone, profileCompletionCount } from '@/utils/validation';
import type { FlexiWorker, UpdateProfileInput } from '@/types';

export default function FlexiAccountPage() {
  const [worker, setWorker] = useState<FlexiWorker | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('flexi_workers')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (data) setWorker(data as FlexiWorker);
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading || !worker) return <div className="py-10 text-center text-gray-400">Chargement...</div>;

  const { done, total } = profileCompletionCount(worker as any);
  const pct = Math.round((done / total) * 100);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: UpdateProfileInput = {
      first_name: fd.get('first_name') as string,
      last_name: fd.get('last_name') as string,
      date_of_birth: fd.get('date_of_birth') as string || undefined,
      niss: fd.get('niss') as string || undefined,
      address_street: fd.get('address_street') as string || undefined,
      address_city: fd.get('address_city') as string || undefined,
      address_zip: fd.get('address_zip') as string || undefined,
      phone: fd.get('phone') as string || undefined,
      iban: fd.get('iban') as string || undefined,
      status: fd.get('status') as any || undefined,
    };

    // Validations
    if (input.niss && !validateNISS(input.niss)) {
      setMessage('Format NISS invalide');
      return;
    }
    if (input.iban && !validateIBAN(input.iban)) {
      setMessage('Format IBAN invalide');
      return;
    }

    startTransition(async () => {
      const result = await updateProfile(input);
      if ('error' in result) {
        setMessage(result.error || 'Erreur');
      } else {
        setWorker(result.data as FlexiWorker);
        setMessage('Profil sauvegardé ✓');
        setTimeout(() => setMessage(''), 3000);
      }
    });
  };

  const Field = ({ label, name, type = 'text', defaultValue, placeholder, required = false }: any) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}{required && ' *'}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm"
      />
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-xl font-bold">
          {worker.first_name[0]}
        </div>
        <div>
          <h2 className="font-bold text-gray-900">{worker.first_name} {worker.last_name}</h2>
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${worker.profile_complete ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className={`text-xs font-medium ${worker.profile_complete ? 'text-emerald-600' : 'text-amber-600'}`}>
              {worker.profile_complete ? 'Profil complet' : `Profil ${pct}% complet`}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {!worker.profile_complete && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="h-2 bg-amber-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-amber-700">Complétez votre profil pour pouvoir recevoir des missions</p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" name="first_name" defaultValue={worker.first_name} required />
          <Field label="Nom" name="last_name" defaultValue={worker.last_name} required />
        </div>
        <Field label="Date de naissance" name="date_of_birth" type="date" defaultValue={worker.date_of_birth} required />
        <Field label="Registre national (NISS)" name="niss" defaultValue={worker.niss} placeholder="XX.XX.XX-XXX.XX" required />
        <Field label="Adresse (rue)" name="address_street" defaultValue={worker.address_street} required />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Code postal" name="address_zip" defaultValue={worker.address_zip} required />
          <div className="col-span-2">
            <Field label="Ville" name="address_city" defaultValue={worker.address_city} required />
          </div>
        </div>
        <Field label="Téléphone" name="phone" type="tel" defaultValue={worker.phone} placeholder="0475 12 34 56" required />
        <Field label="IBAN" name="iban" defaultValue={worker.iban} placeholder="BE68 5390 0754 7034" required />

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Statut *</label>
          <select
            name="status"
            defaultValue={worker.status}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm bg-white"
          >
            <option value="student">Étudiant</option>
            <option value="pensioner">Pensionné</option>
            <option value="employee">Salarié 4/5e</option>
            <option value="other">Autre</option>
          </select>
        </div>

        {message && (
          <p className={`text-sm text-center py-2 rounded-lg ${message.includes('✓') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl py-3 font-bold text-sm transition-all disabled:opacity-50"
        >
          {isPending ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </form>

      {/* YTD progress */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Gains 2026</span>
          <span className="font-medium">{worker.ytd_earnings.toLocaleString('fr-BE')} € / 18 000 €</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all"
            style={{ width: `${Math.min((worker.ytd_earnings / 18000) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
