'use client';

import { useState } from 'react';
import { kioskSignStudentContract } from '@/lib/actions/contract';
import { FileText, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

// SECURITY: This interface only contains safe display data
// No NISS, IBAN, address — those are loaded server-side for PDF
interface SafeContractData {
  shiftId: string;
  workerId: string;
  locationId: string;
  workerName: string;
  hourlyRate: number;
  shiftDate: string;
  startTime: string;
  endTime: string;
  locationName: string;
}

interface Props {
  contractData: SafeContractData;
  pin: string;
  onSigned: () => void;
  onCancel: () => void;
}

export default function KioskStudentContractModal({ contractData, pin, onSigned, onCancel }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const d = contractData;
  const hours = calculateHours(d.startTime, d.endTime);
  const dateFormatted = new Date(d.shiftDate).toLocaleDateString('fr-BE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const handleSign = async () => {
    setSigning(true);
    setError(null);

    let geoLat: number | undefined;
    let geoLng: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      );
      geoLat = pos.coords.latitude;
      geoLng = pos.coords.longitude;
    } catch { /* geoloc not required */ }

    const result = await kioskSignStudentContract({
      shiftId: d.shiftId,
      workerId: d.workerId,
      locationId: d.locationId,
      contractDate: d.shiftDate,
      startTime: d.startTime,
      endTime: d.endTime,
      hourlyRate: d.hourlyRate,
      pin,
      geoLat,
      geoLng,
      userAgent: navigator.userAgent,
    });

    setSigning(false);

    if (result.success) {
      setSigned(true);
      setTimeout(() => onSigned(), 1500);
    } else if (result.error) {
      setError(result.error);
    } else {
      setError('Erreur inconnue lors de la signature');
    }
  };

  if (signed) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Contrat validé !</h2>
          <p className="text-gray-500 text-sm">Votre contrat de travail étudiant a été enregistré.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full my-4">
        {/* Header */}
        <div className="bg-orange-500 rounded-t-3xl px-6 py-4 text-white">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={20} />
            <h2 className="text-lg font-bold">Contrat de travail étudiant</h2>
          </div>
          <p className="text-orange-100 text-sm">Validation obligatoire avant pointage</p>
        </div>

        {/* Contract summary — SAFE DATA ONLY */}
        <div className="px-6 py-4 space-y-3 text-sm max-h-[60vh] overflow-y-auto">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <h3 className="font-bold text-gray-800">Résumé du contrat</h3>
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
          </div>

          <div className="text-xs text-gray-500 space-y-2 leading-relaxed">
            <p><strong>Employeur :</strong> S.B.U.R.G.S. SRL (MDjambo), Rue de Mons 2, 7050 Jurbise. Représenté par Michele Terrana, gérant.</p>

            <p><strong>Étudiant(e) :</strong> {d.workerName}</p>

            <p><strong>Fonction :</strong> Polyvalent en restauration rapide (préparation, service, caisse, nettoyage) au sein de l&apos;établissement {d.locationName}.</p>

            <p><strong>Durée :</strong> Contrat journalier du {dateFormatted}. Les 3 premiers jours de travail constituent la période d&apos;essai.</p>

            <p><strong>Rémunération :</strong> {d.hourlyRate.toFixed(2)} € bruts/heure, payable par virement bancaire.</p>

            <p><strong>CP 302 :</strong> Les conditions de travail sont régies par la commission paritaire n° 302 (Horeca).</p>

            <p><strong>Légal :</strong> Contrat soumis aux lois du 3 juillet 1978 et du 26 décembre 2013. Période d&apos;essai de 3 jours. Préavis de 3 jours (employeur) / 1 jour (étudiant) si l&apos;engagement ne dépasse pas 1 mois.</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Acceptance */}
        <div className="px-6 py-4 border-t border-gray-100">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
            />
            <span className="text-sm text-gray-700">
              J&apos;ai lu et j&apos;accepte les conditions du contrat de travail étudiant pour cette prestation. Je reconnais avoir reçu une copie du règlement de travail.
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 text-sm font-medium transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSign}
            disabled={!accepted || signing}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:text-gray-500 text-white rounded-xl py-3 text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            {signing ? (
              <><Loader2 size={18} className="animate-spin" /> Validation...</>
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
