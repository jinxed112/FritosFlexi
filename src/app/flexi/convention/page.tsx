'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { signFrameworkContract } from '@/lib/actions/contract';
import { FileCheck, AlertTriangle, ChevronDown, ChevronUp, Check, RotateCcw } from 'lucide-react';

export default function ConventionSignPage() {
  const router = useRouter();
  const [worker, setWorker] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'read' | 'sign' | 'done'>('read');
  const [hasRead, setHasRead] = useState(false);
  const [expandedArticle, setExpandedArticle] = useState<number | null>(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/flexi/login'); return; }
      const { data } = await supabase
        .from('flexi_workers')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (data) {
        setWorker(data);
        // Deja signe si signature_url existe
        if (data.signature_url) setStep('done');
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  useEffect(() => {
    if (step !== 'sign') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = 200;
    }
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 40);
    ctx.lineTo(canvas.width - 20, canvas.height - 40);
    ctx.stroke();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
  }, [step]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSigned(true);
  };

  const endDraw = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 40);
    ctx.lineTo(canvas.width - 20, canvas.height - 40);
    ctx.stroke();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    setHasSigned(false);
  };

  // On reutilise signFrameworkContract pour capturer la signature
  // Ca stocke signature_url sur le worker — meme mecanique que les flexis
  const handleSign = () => {
    if (!canvasRef.current || !hasSigned) return;
    const signatureData = canvasRef.current.toDataURL('image/png');
    setError('');
    startTransition(async () => {
      // On appelle signFrameworkContract uniquement pour capturer la signature
      // Pour un independant ca va quand meme stocker signature_url
      const result = await signFrameworkContract(signatureData);
      if (result.error && result.error !== 'Contrat deja signe') {
        setError(result.error);
      } else {
        setStep('done');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase.from('flexi_workers').select('*').eq('user_id', user.id).single();
          if (data) setWorker(data);
        }
      }
    });
  };

  const articles = [
    {
      title: 'Article 1 — Parties',
      text: "Le present document est conclu entre S.B.U.R.G.S. SRL (MDjambo), Rue de Ghlin 2, 7050 Jurbise, BCE BE 1009.237.290, represente par Michele Terrana (Administrateur), et le Prestataire identifie ci-dessous.",
    },
    {
      title: 'Article 2 — Objet',
      text: "Le Prestataire est mandate pour realiser des prestations d'aide en cuisine et friture au sein des etablissements MDjambo (Jurbise et Boussu), en qualite d'independant et sans aucun lien de subordination. Il intervient avec son savoir-faire propre et organise son travail de maniere autonome.",
    },
    {
      title: 'Article 3 — Remuneration',
      text: "Le montant convenu est calcule sur base du taux horaire convenu dans le profil du Prestataire. Le paiement est effectue par virement bancaire dans les 30 jours suivant reception de la facture. Le Prestataire s'engage a emettre une facture conforme (BCE, TVA ou mention franchise art. 56bis).",
    },
    {
      title: 'Article 4 — Nature independante (art. 337/2 CDE)',
      text: "Les parties declarent que : (1) le choix du statut independant est libre et expres ; (2) le Prestataire organise librement son temps de travail ; (3) il execute sa mission selon ses propres methodes ; (4) aucun lien de subordination n'existe. Le Prestataire est seul responsable de ses cotisations INASTI et obligations fiscales.",
    },
    {
      title: 'Article 5 — Responsabilite',
      text: "Le Prestataire est seul responsable des dommages causes a des tiers et declare disposer des assurances necessaires. Le Donneur d'ordre ne peut etre tenu responsable des accidents survenant du fait du Prestataire.",
    },
    {
      title: 'Article 6 — Droit applicable',
      text: "Le present contrat est soumis au droit belge. Tout litige sera porte devant les tribunaux de l'arrondissement de Mons.",
    },
  ];

  if (loading) return <div className="py-10 text-center text-gray-400">Chargement...</div>;
  if (!worker) return null;

  // DEJA SIGNE
  if (step === 'done') {
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileCheck size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-emerald-800 mb-1">Convention cadre signee</h2>
          <p className="text-sm text-emerald-600">
            Votre signature a ete enregistree. Elle sera apposee automatiquement sur chaque convention de prestation.
          </p>
        </div>
        <button onClick={() => router.push('/flexi/missions')}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-3 font-medium text-sm transition-colors">
          Voir mes missions
        </button>
      </div>
    );
  }

  // STEP 1: LECTURE
  if (step === 'read') {
    return (
      <div className="space-y-4">
        <div className="text-center mb-2">
          <h2 className="text-lg font-bold text-gray-900">Convention de prestation</h2>
          <p className="text-xs text-gray-500 mt-1">Independant complementaire — MDjambo</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
          Votre signature sera enregistree une seule fois et apposee automatiquement sur chaque convention generee a chaque prestation.
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 bg-gray-50 border-b border-gray-100">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Donneur d'ordre</p>
            <p className="text-sm font-semibold text-gray-800">S.B.U.R.G.S. SRL — MDjambo</p>
            <p className="text-xs text-gray-500 mt-1">Rue de Ghlin 2, 7050 Jurbise — BCE 1009.237.290</p>
          </div>
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Prestataire</p>
            <p className="text-sm font-semibold text-gray-800">{worker.first_name} {worker.last_name}</p>
            <p className="text-xs text-gray-500 mt-1">{worker.vat_number || 'N° BCE non renseigne'}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {articles.map((art, i) => (
              <div key={i}>
                <button
                  onClick={() => setExpandedArticle(expandedArticle === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800">{art.title}</span>
                  {expandedArticle === i
                    ? <ChevronUp size={16} className="text-gray-400" />
                    : <ChevronDown size={16} className="text-gray-400" />}
                </button>
                {expandedArticle === i && (
                  <div className="px-4 pb-4 -mt-1">
                    <p className="text-sm text-gray-600 leading-relaxed">{art.text}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200 cursor-pointer">
          <input type="checkbox" checked={hasRead} onChange={(e) => setHasRead(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
          <span className="text-sm text-gray-700 leading-snug">
            J&apos;ai lu et j&apos;accepte les conditions generales de prestation en tant qu&apos;independant complementaire
          </span>
        </label>
        <button onClick={() => setStep('sign')} disabled={!hasRead}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-3 font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Continuer vers la signature
        </button>
      </div>
    );
  }

  // STEP 2: SIGNATURE
  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-gray-900">Signez la convention</h2>
        <p className="text-xs text-gray-500 mt-1">Dessinez votre signature ci-dessous</p>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 text-sm">
        <p className="font-semibold text-gray-800 mb-0.5">S.B.U.R.G.S. SRL (MDjambo)</p>
        <p className="text-gray-600">et <strong>{worker.first_name} {worker.last_name}</strong></p>
      </div>
      <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium">Votre signature</span>
          <button onClick={clearSignature} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <RotateCcw size={12} /> Effacer
          </button>
        </div>
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full touch-none cursor-crosshair"
            style={{ height: 200 }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
          />
          {!hasSigned && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-gray-300 text-sm">Dessinez ici avec votre doigt</p>
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      <p className="text-[10px] text-gray-400 text-center leading-relaxed px-2">
        En cliquant &quot;Enregistrer ma signature&quot;, vous confirmez agir en qualite d&apos;independant complementaire et acceptez les conditions de prestation. Votre signature sera conservee et apposee sur chaque convention.
      </p>
      <div className="flex gap-3">
        <button onClick={() => setStep('read')}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 font-medium text-sm transition-colors">
          Retour
        </button>
        <button onClick={handleSign} disabled={!hasSigned || isPending}
          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-xl py-3 font-medium text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
          {isPending ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Enregistrement...</>
          ) : (
            <><Check size={16} /> Enregistrer ma signature</>
          )}
        </button>
      </div>
    </div>
  );
}
