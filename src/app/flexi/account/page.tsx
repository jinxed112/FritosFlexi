'use client';

import { useState, useEffect, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { updateProfile } from '@/lib/actions/workers';
import { updatePinCode } from '@/lib/actions/clock';
import { validateNISS, formatNISS, validateIBAN, formatIBAN, validatePhone, profileCompletionCount } from '@/utils/validation';
import StudentContractsList from '@/components/flexi/StudentContractsList';
import IndependentConventionsList from '@/components/flexi/IndependentConventionsList';
import type { FlexiWorker, UpdateProfileInput } from '@/types';

export default function FlexiAccountPage() {
  const [worker, setWorker] = useState<FlexiWorker | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  // Champs TVA (état local pour l'indépendant)
  const [vatApplicable, setVatApplicable] = useState(false);
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
      if (data) {
        setWorker(data as FlexiWorker);
        setVatApplicable(!!(data as any).vat_applicable);
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading || !worker) return <div className="py-10 text-center text-gray-400">Chargement...</div>;

  const isIndependent = worker.status === 'independent';
  const { done, total } = profileCompletionCount(worker as any);
  const pct = Math.round((done / total) * 100);

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const input: UpdateProfileInput = {
      first_name:      fd.get('first_name') as string,
      last_name:       fd.get('last_name') as string,
      date_of_birth:   fd.get('date_of_birth') as string || undefined,
      address_street:  fd.get('address_street') as string || undefined,
      address_city:    fd.get('address_city') as string || undefined,
      address_zip:     fd.get('address_zip') as string || undefined,
      phone:           fd.get('phone') as string || undefined,
      iban:            fd.get('iban') as string || undefined,
    };

    if (isIndependent) {
      // Champs spécifiques indépendant
      input.vat_number    = fd.get('vat_number') as string || undefined;
      input.vat_applicable = vatApplicable;
      input.vat_rate      = vatApplicable ? parseFloat(fd.get('vat_rate') as string) || 21 : 0;
    } else {
      // Champs spécifiques flexi/student/other
      input.gender          = fd.get('gender') as 'M' | 'F' || undefined;
      input.birth_place     = fd.get('birth_place') as string || undefined;
      input.birth_country   = fd.get('birth_country') as string || undefined;
      input.nationality     = fd.get('nationality') as string || undefined;
      input.middle_initial  = fd.get('middle_initial') as string || undefined;
      input.language        = fd.get('language') as string || undefined;
      input.education_level = fd.get('education_level') as string || undefined;
      input.niss            = fd.get('niss') as string || undefined;
      input.status          = fd.get('status') as any || undefined;

      // Validations flexi
      if (input.niss && !validateNISS(input.niss)) {
        setMessage('Format NISS invalide');
        return;
      }
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
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold ${isIndependent ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-orange-400 to-red-500'}`}>
          {worker.first_name[0]}
        </div>
        <div>
          <h2 className="font-bold text-gray-900">{worker.first_name} {worker.last_name}</h2>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${worker.profile_complete ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className={`text-xs font-medium ${worker.profile_complete ? 'text-emerald-600' : 'text-amber-600'}`}>
              {worker.profile_complete ? 'Profil complet' : `Profil ${pct}% complet`}
            </span>
            {isIndependent && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                Indépendant
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {!worker.profile_complete && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="h-2 bg-amber-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-amber-700">
            {isIndependent
              ? 'Complétez votre profil (adresse, IBAN, N° TVA/BCE) pour pouvoir recevoir des missions'
              : 'Complétez votre profil pour pouvoir recevoir des missions'}
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        {/* Champs communs */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom" name="first_name" defaultValue={worker.first_name} required />
          <Field label="Nom" name="last_name" defaultValue={worker.last_name} required />
        </div>
        <Field label="Date de naissance" name="date_of_birth" type="date" defaultValue={worker.date_of_birth} required />

        {isIndependent ? (
          /* ===== FORMULAIRE INDÉPENDANT ===== */
          <>
            <Field label="Adresse (rue)" name="address_street" defaultValue={worker.address_street} required />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Code postal" name="address_zip" defaultValue={worker.address_zip} required />
              <div className="col-span-2">
                <Field label="Ville" name="address_city" defaultValue={worker.address_city} required />
              </div>
            </div>
            <Field label="Téléphone" name="phone" type="tel" defaultValue={worker.phone} placeholder="0475 12 34 56" required />
            <Field label="IBAN" name="iban" defaultValue={worker.iban} placeholder="BE68 5390 0754 7034" required />

            {/* Bloc TVA */}
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <p className="text-xs font-semibold text-amber-800">Informations indépendant</p>
              <Field label="N° TVA / BCE *" name="vat_number" defaultValue={(worker as any).vat_number} placeholder="BE0123456789" required />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Régime TVA *</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="vat_regime" value="franchise"
                      checked={!vatApplicable}
                      onChange={() => setVatApplicable(false)}
                      className="text-orange-500 focus:ring-orange-500" />
                    <span className="text-sm text-gray-700">Franchise TVA (art. 56bis) — pas de TVA sur mes factures</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="vat_regime" value="assujetti"
                      checked={vatApplicable}
                      onChange={() => setVatApplicable(true)}
                      className="text-orange-500 focus:ring-orange-500" />
                    <span className="text-sm text-gray-700">Assujetti à la TVA</span>
                  </label>
                </div>
                {vatApplicable && (
                  <div className="mt-2 flex items-center gap-2">
                    <input type="number" name="vat_rate"
                      defaultValue={(worker as any).vat_rate || 21}
                      step="0.01" min="0" max="21"
                      className="w-20 px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none" />
                    <span className="text-sm text-gray-600">% TVA applicable</span>
                  </div>
                )}
              </div>
              <div className="text-[11px] text-amber-700 bg-amber-100 rounded-lg p-2">
                ℹ️ Ces informations apparaîtront sur vos conventions de prestation générées automatiquement.
              </div>
            </div>
          </>
        ) : (
          /* ===== FORMULAIRE FLEXI/STUDENT/OTHER ===== */
          <>
            {/* Dimona fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sexe *</label>
                <div className="flex gap-4 px-3 py-2.5 rounded-xl border border-gray-200 bg-white">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="gender" value="M" defaultChecked={worker.gender === 'M'}
                      className="text-orange-500 focus:ring-orange-500" /> Homme
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" name="gender" value="F" defaultChecked={worker.gender === 'F'}
                      className="text-orange-500 focus:ring-orange-500" /> Femme
                  </label>
                </div>
              </div>
              <Field label="Initiale 2e prénom" name="middle_initial" defaultValue={worker.middle_initial} placeholder="Ex: J" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lieu de naissance" name="birth_place" defaultValue={worker.birth_place} placeholder="Ex: Mons" required />
              <Field label="Pays de naissance" name="birth_country" defaultValue={worker.birth_country || 'Belgique'} required />
            </div>
            <Field label="Nationalité" name="nationality" defaultValue={worker.nationality || 'Belge'} required />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Langue *</label>
                <select name="language" defaultValue={worker.language || ''} required
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm bg-white">
                  <option value="">-- Choisir --</option>
                  <option value="FR">Français</option>
                  <option value="NL">Néerlandais</option>
                  <option value="DE">Allemand</option>
                  <option value="EN">Anglais</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Niveau d&apos;études *</label>
                <select name="education_level" defaultValue={worker.education_level || ''} required
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm bg-white">
                  <option value="">-- Choisir --</option>
                  <option value="primaire">Niveau primaire</option>
                  <option value="secondaire">Niveau secondaire</option>
                  <option value="superieur">Supérieur non universitaire</option>
                  <option value="universitaire">Niveau universitaire</option>
                  <option value="inconnu">Inconnu</option>
                </select>
              </div>
            </div>

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
              <select name="status" defaultValue={worker.status}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm bg-white">
                <option value="student">Étudiant</option>
                <option value="pensioner">Pensionné</option>
                <option value="employee">Salarié 4/5e</option>
                <option value="other">Autre</option>
              </select>
            </div>
          </>
        )}

        {message && (
          <p className={`text-sm text-center py-2 rounded-lg ${message.includes('✓') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {message}
          </p>
        )}

        <button type="submit" disabled={isPending}
          className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white rounded-xl py-3 font-bold text-sm transition-all disabled:opacity-50">
          {isPending ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </form>

      {/* YTD progress */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        {isIndependent ? (
          <div className="flex justify-between text-xs text-gray-500">
            <span>Gains 2026</span>
            <span className="font-medium text-gray-700">
              {worker.ytd_earnings.toLocaleString('fr-BE')} € <span className="text-gray-400">(illimité)</span>
            </span>
          </div>
        ) : (
          <>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Gains 2026</span>
              <span className="font-medium">{worker.ytd_earnings.toLocaleString('fr-BE')} € / 18 000 €</span>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all"
                style={{ width: `${Math.min((worker.ytd_earnings / 18000) * 100, 100)}%` }} />
            </div>
          </>
        )}
      </div>

      {/* PIN code for kiosk */}
      <PinSection currentPin={worker.pin_code} />

      {/* Password change */}
      <PasswordChangeSection />

      {/* Contrats / conventions selon statut */}
      {worker.status === 'student' && <StudentContractsList workerId={worker.id} />}
      {worker.status === 'independent' && <IndependentConventionsList workerId={worker.id} />}
    </div>
  );
}

function PinSection({ currentPin }: { currentPin?: string | null }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinMsg('');

    if (!/^\d{4}$/.test(pin)) {
      setPinMsg('Le PIN doit contenir exactement 4 chiffres');
      return;
    }
    if (pin !== confirmPin) {
      setPinMsg('Les PINs ne correspondent pas');
      return;
    }

    setPinLoading(true);
    const result = await updatePinCode(pin);
    if ('error' in result && result.error) {
      setPinMsg(result.error);
    } else {
      setPinMsg('PIN enregistré ✓');
      setPin('');
      setConfirmPin('');
      setTimeout(() => { setPinMsg(''); setOpen(false); }, 2000);
    }
    setPinLoading(false);
  };

  return (
    <div className="mt-6 pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-gray-700">Code PIN de pointage</p>
          <p className="text-xs text-gray-400">Pour pointer sur la borne de la friterie</p>
        </div>
        {currentPin ? (
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 font-medium">Configuré ✓</span>
        ) : (
          <span className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-500 font-medium">Non configuré</span>
        )}
      </div>

      <button onClick={() => setOpen(!open)}
        className="text-sm text-orange-500 hover:text-orange-600 transition-colors font-medium">
        {open ? '▾' : '▸'} {currentPin ? 'Changer mon PIN' : 'Configurer mon PIN'}
      </button>

      {open && (
        <form onSubmit={handleSetPin} className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nouveau PIN (4 chiffres)</label>
            <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4}
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm text-center tracking-[0.5em] text-lg"
              required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Confirmer le PIN</label>
            <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4}
              value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm text-center tracking-[0.5em] text-lg"
              required />
          </div>
          {pinMsg && (
            <p className={`text-sm text-center py-2 rounded-lg ${pinMsg.includes('✓') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {pinMsg}
            </p>
          )}
          <button type="submit" disabled={pinLoading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2.5 font-medium text-sm transition-all disabled:opacity-50">
            {pinLoading ? 'Enregistrement...' : 'Enregistrer le PIN'}
          </button>
        </form>
      )}
    </div>
  );
}

function PasswordChangeSection() {
  const [open, setOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const supabase = createClient();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg('');

    if (newPwd.length < 8) {
      setPwdMsg('Le mot de passe doit faire au moins 8 caractères');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg('Les mots de passe ne correspondent pas');
      return;
    }

    setPwdLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setPwdMsg('Erreur: utilisateur non trouvé');
      setPwdLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPwd,
    });

    if (signInError) {
      setPwdMsg('Mot de passe actuel incorrect');
      setPwdLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPwd });

    if (error) {
      setPwdMsg('Erreur lors du changement');
    } else {
      setPwdMsg('Mot de passe changé ✓');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setTimeout(() => { setPwdMsg(''); setOpen(false); }, 2000);
    }
    setPwdLoading(false);
  };

  return (
    <div className="mt-6 pt-4 border-t border-gray-100">
      <button onClick={() => setOpen(!open)}
        className="text-sm text-gray-500 hover:text-orange-500 transition-colors font-medium">
        {open ? '▾ Changer mot de passe' : '▸ Changer mot de passe'}
      </button>

      {open && (
        <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Mot de passe actuel</label>
            <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm"
              required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nouveau mot de passe</label>
            <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              placeholder="Min. 8 caractères"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm"
              required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Confirmer</label>
            <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition-all text-sm"
              required />
          </div>

          {pwdMsg && (
            <p className={`text-sm text-center py-2 rounded-lg ${pwdMsg.includes('✓') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {pwdMsg}
            </p>
          )}

          <button type="submit" disabled={pwdLoading}
            className="w-full bg-gray-800 hover:bg-gray-900 text-white rounded-xl py-2.5 font-medium text-sm transition-all disabled:opacity-50">
            {pwdLoading ? 'Changement...' : 'Changer le mot de passe'}
          </button>
        </form>
      )}
    </div>
  );
}
