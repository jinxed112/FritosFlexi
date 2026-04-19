'use client';

import { useState } from 'react';
import { signIndependentConvention } from '@/lib/actions/convention';
import { FileText, CheckCircle, Loader2, Euro } from 'lucide-react';

interface ConventionData {
  shiftId: string;
  workerId: string;
  locationId: string;
  locationName: string;
  conventionDate: string;
  startTime: string;
  endTime: string;
  hourlyRate: number;
  amountHtva: number;
  vatRate: number;
  vatAmount: number;
  amountTtc: number;
  vatApplicable: boolean;
  vatNumber?: string;
}

interface Props {
  conventionData: ConventionData;
  onSigned: (pdfUrl?: string) => void;
  onCancel: () => void;
}

export default function IndependentConventionModal({ conventionData, onSigned, onCancel }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  const d = conventionData;
  const hours = calculateHours(d.startTime, d.endTime);
  const dateFormatted = new Date(d.conventionDate).toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const handleSign = async () => {
    setSigning(true);

    let geoLat: number | undefined;
    let geoLng: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      );
      geoLat = pos.coords.latitude;
      geoLng = pos.coords.longitude;
    } catch { /* geoloc pas obligatoire */ }

    const result = await signIndependentConvention({
      shiftId:        d.shiftId,
      workerId:       d.workerId,
      locationId:     d.locationId,
      conventionDate: d.conventionDate,
      startTime:      d.startTime,
      endTime:        d.endTime,
      hourlyRate:     d.hourlyRate,
      amountHtva:     d.amountHtva,
      vatRate:        d.vatRate,
      vatAmount:      d.vatAmount,
      amountTtc:      d.amountTtc,
      geoLat,
      geoLng,
      userAgent: navigator.userAgent,
    });

    setSigning(false);

    if (result.success || ('alreadySigned' in result && result.alreadySigned)) {
      setSigned(true);
      setTimeout(() => onSigned('pdfUrl' in result ? result.pdfUrl ?? undefined : undefined), 1500);
    }
  };

  if (signed) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Convention validée !</h2>
          <p className="text-gray-500 text-sm">
            Votre convention de prestation a été générée et enregistrée. Vous pouvez la retrouver dans la section Paie de votre portail.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full my-4">

        {/* Header */}
        <div className="bg-amber-500 rounded-t-3xl px-6 py-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={20} />
            <h2 className="text-lg font-bold">Convention de prestation</h2>
          </div>
          <p className="text-amber-100 text-sm">À valider avant le pointage</p>
        </div>

        {/* Résumé */}
        <div className="px-6 py-4 space-y-3 text-sm max-h-[60vh] overflow-y-auto">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <h3 className="font-bold text-gray-800">Résumé de la prestation</h3>
            <div className="grid grid-cols-2 gap-2 text-gray-600">
              <div>
                <span className="text-gray-400 text-xs">Date</span>
                <p className="font-medium text-gray-800">{dateFormatted}</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Lieu</span>
                <p className="font-medium text-gray-800">{d.locationName}</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Horaire</span>
                <p className="font-medium text-gray-800">{d.startTime} – {d.endTime} ({hours}h)</p>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Taux horaire</span>
                <p className="font-medium text-gray-800">{d.hourlyRate.toFixed(2)} €/h</p>
              </div>
            </div>

            {/* Montants */}
            <div className="border-t border-gray-200 pt-2 mt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Montant HTVA</span>
                <span className="font-medium text-gray-800">{d.amountHtva.toFixed(2)} €</span>
              </div>
              {d.vatApplicable ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">TVA ({d.vatRate}%)</span>
                    <span className="font-medium text-gray-800">{d.vatAmount.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-1">
                    <span className="text-gray-800">Total TTC</span>
                    <span className="text-amber-700">{d.amountTtc.toFixed(2)} €</span>
                  </div>
                </>
              ) : (
                <div className="text-xs text-gray-400 italic">
                  Franchise TVA art. 56bis — pas de TVA applicable
                </div>
              )}
            </div>
          </div>

          {/* Texte de la convention */}
          <div className="text-xs text-gray-500 space-y-2 leading-relaxed">
            <p><strong>Donneur d'ordre :</strong> S.B.U.R.G.S. SRL (MDjambo), Rue de Ghlin 2, 7050 Jurbise. Représenté par Michele Terrana, Administrateur.</p>

            <p><strong>Objet :</strong> Aide en cuisine et friture au sein de l'établissement {d.locationName}, en qualité d'indépendant et sans aucun lien de subordination.</p>

            <p><strong>Nature indépendante :</strong> Le Prestataire intervient avec son savoir-faire propre, organise librement son travail et n'est soumis à aucune instruction hiérarchique. Il est seul responsable de ses cotisations sociales (INASTI) et obligations fiscales.</p>

            <p><strong>Paiement :</strong> Sur présentation d'une facture conforme, par virement bancaire dans les 30 jours calendrier. Aucun paiement en espèces sans justificatif comptable.</p>

            <p><strong>Responsabilité :</strong> Le Prestataire déclare disposer des assurances nécessaires à l'exercice de son activité indépendante.</p>

            <p><strong>Droit applicable :</strong> Droit belge. Juridiction compétente : arrondissement de Mons.</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            ⚠️ En validant, vous confirmez agir en qualité d'indépendant. Le PDF de la convention sera généré et stocké. Vous pourrez le télécharger depuis votre portail.
          </div>
        </div>

        {/* Acceptation */}
        <div className="px-6 py-4 border-t border-gray-100">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
            <span className="text-sm text-gray-700">
              J'ai lu et j'accepte les conditions de la présente convention de prestation de services. Je confirme agir en qualité d'indépendant complémentaire affilié à l'INASTI.
            </span>
          </label>
        </div>

        {/* Boutons */}
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onCancel}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium transition-colors">
            Annuler
          </button>
          <button onClick={handleSign} disabled={!accepted || signing}
            className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 disabled:text-gray-500 text-white rounded-xl py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2">
            {signing ? (
              <><Loader2 size={18} className="animate-spin" /> Génération...</>
            ) : (
              <><CheckCircle size={18} /> Valider et pointer</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function calculateHours(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return (diff / 60).toFixed(1);
}
