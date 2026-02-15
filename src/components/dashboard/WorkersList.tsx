'use client';

import { useState, useTransition } from 'react';
import { createWorker, toggleWorkerActive, resetWorkerPassword, deleteWorker } from '@/lib/actions/workers';
import { FLEXI_CONSTANTS } from '@/types';
import { Plus, X, UserPlus } from 'lucide-react';

interface Props {
  workers: any[];
}

export default function WorkersList({ workers }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [resetInfo, setResetInfo] = useState<{ name: string; password: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
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

  const handleReset = (id: string, name: string) => {
    startTransition(async () => {
      const result = await resetWorkerPassword(id);
      if ('newPassword' in result && result.newPassword) {
        setResetInfo({ name, password: result.newPassword });
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteWorker(id);
      setDeleteConfirm(null);
    });
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
                <div className="flex flex-col gap-1">
                  <button onClick={() => handleReset(w.id, `${w.first_name} ${w.last_name}`)}
                    className="text-xs px-2 py-1 rounded-lg text-blue-500 hover:bg-blue-50">
                    Reset mdp
                  </button>
                  <button onClick={() => handleToggle(w.id, !w.is_active)}
                    className={`text-xs px-2 py-1 rounded-lg ${w.is_active ? 'text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}>
                    {w.is_active ? 'Désactiver' : 'Réactiver'}
                  </button>
                  <button onClick={() => setDeleteConfirm({ id: w.id, name: `${w.first_name} ${w.last_name}` })}
                    className="text-xs px-2 py-1 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600">
                    Supprimer
                  </button>
                </div>
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

      {/* Reset Password Modal */}
      {resetInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-900 mb-3">Mot de passe réinitialisé ✓</h3>
            <p className="text-sm text-gray-600 mb-3">{resetInfo.name}</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
              <p className="text-xs text-blue-600 mb-1">Nouveau mot de passe :</p>
              <p className="text-2xl font-mono font-bold text-blue-800 select-all">{resetInfo.password}</p>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">Communiquez ce mot de passe au flexi.</p>
            <button onClick={() => setResetInfo(null)}
              className="w-full mt-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="font-bold text-gray-900 mb-2">Supprimer ce worker ?</h3>
            <p className="text-sm text-gray-600 mb-1">{deleteConfirm.name}</p>
            <p className="text-xs text-red-500 mb-4">Cette action est irréversible. Le compte, le profil et toutes les disponibilités seront supprimés.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-2.5 font-medium text-sm">
                Annuler
              </button>
              <button onClick={() => handleDelete(deleteConfirm.id)} disabled={isPending}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 font-medium text-sm disabled:opacity-50">
                {isPending ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
