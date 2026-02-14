'use client';

import { useState, useTransition } from 'react';
import { createWorker, toggleWorkerActive } from '@/lib/actions/workers';
import { FLEXI_CONSTANTS } from '@/types';
import { Plus, X, UserPlus } from 'lucide-react';

interface Props {
  workers: any[];
}

export default function WorkersList({ workers }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleCreate = (formData: FormData) => {
    startTransition(async () => {
      const result = await createWorker({
        first_name: formData.get('first_name') as string,
        last_name: formData.get('last_name') as string,
        email: formData.get('email') as string,
        hourly_rate: parseFloat(formData.get('hourly_rate') as string) || 12.53,
        status: formData.get('status') as any,
      });
      if (result.tempPassword) {
        setTempPassword(result.tempPassword);
      } else {
        setShowModal(false);
      }
    });
  };

  const handleToggle = (id: string, active: boolean) => {
    startTransition(() => toggleWorkerActive(id, active));
  };

  const alertLevel = (ytd: number, status: string) => {
    if (status === 'pensioner') return null;
    if (ytd >= 18000) return { color: 'bg-red-500', label: 'PLAFOND' };
    if (ytd > 17000) return { color: 'bg-red-400', label: 'Critique' };
    if (ytd > 15000) return { color: 'bg-amber-400', label: 'Attention' };
    return null;
  };

  const statusLabels: Record<string, string> = {
    student: 'Étudiant', pensioner: 'Pensionné', employee: 'Salarié', other: 'Autre',
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Workers</h1>
        <button onClick={() => { setShowModal(true); setTempPassword(''); }}
          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1">
          <UserPlus size={16} /> Nouveau flexi
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {workers.map((w: any) => {
          const alert = alertLevel(w.ytd_earnings, w.status);
          const pct = Math.min((w.ytd_earnings / 18000) * 100, 100);

          return (
            <div key={w.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${!w.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg ${w.profile_complete ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-gray-300'}`}>
                  {w.first_name[0]}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{w.first_name} {w.last_name}</h3>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${w.profile_complete ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      {w.profile_complete ? 'Profil ✓' : 'Incomplet'}
                    </span>
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                      {statusLabels[w.status] || w.status}
                    </span>
                  </div>
                </div>
                <button onClick={() => handleToggle(w.id, !w.is_active)}
                  className={`text-xs px-2 py-1 rounded-lg ${w.is_active ? 'text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}>
                  {w.is_active ? 'Désactiver' : 'Réactiver'}
                </button>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Taux horaire</span>
                  <span className="font-medium text-gray-800">{w.hourly_rate} €/h</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Contrat-cadre</span>
                  <span className={`font-medium ${w.framework_contract_date ? 'text-emerald-600' : 'text-red-500'}`}>
                    {w.framework_contract_date || 'Non signé'}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Email</span>
                  <span className="font-medium text-gray-800 text-xs">{w.email}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Téléphone</span>
                  <span className="font-medium text-gray-800">{w.phone || '—'}</span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-50">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Gains 2026</span>
                  <span className="font-medium text-gray-600">
                    {w.ytd_earnings.toLocaleString('fr-BE')} € {w.status !== 'pensioner' ? '/ 18 000 €' : '(illimité)'}
                  </span>
                </div>
                {w.status !== 'pensioner' && (
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct > 94 ? 'bg-red-500' : pct > 83 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                )}
                {alert && <p className={`text-[10px] font-medium mt-1 ${pct > 94 ? 'text-red-600' : 'text-amber-600'}`}>⚠ {alert.label}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Worker Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">{tempPassword ? 'Compte créé ✓' : 'Nouveau flexi'}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {tempPassword ? (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-emerald-700 mb-2">Mot de passe temporaire :</p>
                  <p className="text-2xl font-mono font-bold text-emerald-800 select-all">{tempPassword}</p>
                </div>
                <p className="text-xs text-gray-500 text-center">Communiquez ce mot de passe au flexi. Il pourra le changer après connexion.</p>
                <button onClick={() => setShowModal(false)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">Fermer</button>
              </div>
            ) : (
              <form action={handleCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Prénom</label>
                    <input type="text" name="first_name" required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
                    <input type="text" name="last_name" required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                  <input type="email" name="email" required className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Taux horaire (€)</label>
                    <input type="number" name="hourly_rate" defaultValue="12.53" step="0.01" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Statut</label>
                    <select name="status" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
                      <option value="student">Étudiant</option>
                      <option value="pensioner">Pensionné</option>
                      <option value="employee">Salarié</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                </div>
                <button type="submit" disabled={isPending}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm transition-colors disabled:opacity-50">
                  {isPending ? 'Création...' : 'Créer le compte'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
