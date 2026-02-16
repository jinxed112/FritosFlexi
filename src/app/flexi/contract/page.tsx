'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { signFrameworkContract } from '@/lib/actions/contract';
import { FileCheck, AlertTriangle, ChevronDown, ChevronUp, Check, RotateCcw } from 'lucide-react';

export default function ContractPage() {
  const router = useRouter();
  const [worker, setWorker] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'read' | 'sign' | 'done'>('read');
  const [hasRead, setHasRead] = useState(false);
  const [expandedArticle, setExpandedArticle] = useState<number | null>(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  // Signature canvas
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
        if (data.framework_contract_date) setStep('done');
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  // Canvas setup
  useEffect(() => {
    if (step !== 'sign') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size based on container
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = 200;
    }

    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw baseline
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 40);
    ctx.lineTo(canvas.width - 20, canvas.height - 40);
    ctx.stroke();

    // Reset stroke style for drawing
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
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
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
    // Redraw baseline
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

  const handleSign = () => {
    if (!canvasRef.current || !hasSigned) return;
    const signatureData = canvasRef.current.toDataURL('image/png');
    setError('');

    startTransition(async () => {
      const result = await signFrameworkContract(signatureData);
      if (result.error) {
        setError(result.error);
      } else {
        setStep('done');
        // Reload worker data
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
      title: 'Article 1 — Objet',
      text: 'Le présent contrat-cadre est conclu dans le cadre de la réglementation relative aux flexi-jobs. Il définit les conditions générales dans lesquelles vous pourrez effectuer des prestations de travail pour S.B.U.R.G.S. SRL (MDjambo).',
    },
    {
      title: 'Article 2 — Fonction et lieux de travail',
      text: 'Vous exercerez la fonction de collaborateur polyvalent en restauration rapide. Les prestations peuvent avoir lieu dans l\'un ou l\'autre des établissements : MDjambo Jurbise et MDjambo Boussu.',
    },
    {
      title: 'Article 3 — Rémunération',
      text: `Votre flexi-salaire horaire est fixé à ${worker?.hourly_rate || '12,53'} €/h brut/net (pécule de vacances de 7,67% inclus). Ce salaire est exonéré d'impôt et de cotisations sociales. Une prime dimanche/jour férié de 2 €/h (max 12 €/jour) est applicable.`,
    },
    {
      title: 'Article 4 — Horaires et planning',
      text: 'Les horaires de travail vous seront communiqués via la plateforme FritOS Flexi. Vous êtes libre d\'accepter ou de refuser chaque mission proposée. Chaque prestation acceptée fera l\'objet d\'une déclaration Dimona préalable.',
    },
    {
      title: 'Article 5 — Vos obligations',
      text: 'Vous vous engagez à : (a) vous présenter aux heures convenues, (b) pointer votre arrivée et votre départ via le système de pointage, (c) respecter les règles d\'hygiène et de sécurité alimentaire, (d) signaler toute indisponibilité dans les meilleurs délais.',
    },
    {
      title: 'Article 6 — Plafond fiscal',
      text: 'Les revenus flexi-job sont exonérés d\'impôt jusqu\'à 18 000 € par an (sauf pensionnés). Au-delà, les revenus sont imposés normalement. Vous êtes responsable du suivi de votre compteur via mycareer.be.',
    },
    {
      title: 'Article 7 — Durée et résiliation',
      text: 'Le présent contrat-cadre est conclu pour une durée indéterminée. Il peut être résilié par l\'une ou l\'autre partie moyennant un préavis écrit.',
    },
  ];

  if (loading) return <div className="py-10 text-center text-gray-400">Chargement...</div>;
  if (!worker) return null;

  // ===== ALREADY SIGNED =====
  if (step === 'done') {
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileCheck size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-emerald-800 mb-1">Contrat-cadre signé</h2>
          <p className="text-sm text-emerald-600">
            Signé le {worker.framework_contract_date
              ? new Date(worker.framework_contract_date).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
              : 'aujourd\'hui'}
          </p>
        </div>

        {worker.framework_contract_url && (
          <a href={worker.framework_contract_url} target="_blank" rel="noopener noreferrer"
            className="block w-full text-center bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl py-3 text-sm font-medium transition-colors">
            Télécharger le contrat signé (PDF)
          </a>
        )}

        <button onClick={() => router.push('/flexi/missions')}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-3 font-medium text-sm transition-colors">
          Voir mes missions
        </button>
      </div>
    );
  }

  // ===== STEP 1: READ CONTRACT =====
  if (step === 'read') {
    return (
      <div className="space-y-4">
        <div className="text-center mb-2">
          <h2 className="text-lg font-bold text-gray-900">Contrat-cadre flexi-job</h2>
          <p className="text-xs text-gray-500 mt-1">Lisez le contrat avant de le signer</p>
        </div>

        {/* Contract content */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Employer info */}
          <div className="p-4 bg-gray-50 border-b border-gray-100">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Employeur</p>
            <p className="text-sm font-semibold text-gray-800">S.B.U.R.G.S. SRL — MDjambo</p>
            <p className="text-xs text-gray-500 mt-1">CP 302 — Horeca</p>
          </div>

          {/* Worker info */}
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Travailleur</p>
            <p className="text-sm font-semibold text-gray-800">{worker.first_name} {worker.last_name}</p>
            <p className="text-xs text-gray-500 mt-1">{worker.email}</p>
          </div>

          {/* Articles — accordion */}
          <div className="divide-y divide-gray-50">
            {articles.map((art, i) => (
              <div key={i}>
                <button
                  onClick={() => setExpandedArticle(expandedArticle === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800">{art.title}</span>
                  {expandedArticle === i ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
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

        {/* Accept checkbox */}
        <label className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200 cursor-pointer">
          <input type="checkbox" checked={hasRead} onChange={(e) => setHasRead(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
          <span className="text-sm text-gray-700 leading-snug">
            J&apos;ai lu et je comprends les termes du contrat-cadre flexi-job
          </span>
        </label>

        <button onClick={() => setStep('sign')} disabled={!hasRead}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-3 font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Continuer vers la signature
        </button>

        <p className="text-center text-[10px] text-gray-400 px-4">
          En signant ce contrat, vous acceptez de travailler comme flexi-job pour S.B.U.R.G.S. SRL selon les conditions décrites ci-dessus.
        </p>
      </div>
    );
  }

  // ===== STEP 2: SIGNATURE =====
  return (
    <div className="space-y-4">
      <div className="text-center mb-2">
        <h2 className="text-lg font-bold text-gray-900">Signez votre contrat</h2>
        <p className="text-xs text-gray-500 mt-1">Dessinez votre signature ci-dessous</p>
      </div>

      {/* Recap */}
      <div className="bg-gray-50 rounded-xl p-4 text-sm">
        <div className="flex justify-between mb-1">
          <span className="text-gray-500">Contrat-cadre entre</span>
        </div>
        <p className="font-semibold text-gray-800 mb-0.5">S.B.U.R.G.S. SRL (MDjambo)</p>
        <p className="text-gray-600">et <strong>{worker.first_name} {worker.last_name}</strong></p>
      </div>

      {/* Signature canvas */}
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
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
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
        En cliquant &quot;Signer le contrat&quot;, vous confirmez que cette signature est la vôtre et que vous acceptez les termes du contrat-cadre. Un PDF signé sera généré et conservé comme preuve.
      </p>

      <div className="flex gap-3">
        <button onClick={() => setStep('read')}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl py-3 font-medium text-sm transition-colors">
          Retour
        </button>
        <button onClick={handleSign} disabled={!hasSigned || isPending}
          className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-3 font-medium text-sm transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
          {isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signature...
            </>
          ) : (
            <>
              <Check size={16} /> Signer le contrat
            </>
          )}
        </button>
      </div>
    </div>
  );
}