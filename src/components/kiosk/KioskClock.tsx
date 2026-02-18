'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { kioskClockIn, kioskClockOut } from '@/lib/actions/clock';
import { kioskCheckStudentContract } from '@/lib/actions/contract';
import KioskStudentContractModal from '@/components/flexi/KioskStudentContractModal';
import { ArrowLeft, Delete } from 'lucide-react';

interface Props {
  locationToken: string;
  locationName: string;
  locationId: string;
}

export default function KioskClock({ locationToken, locationName, locationId }: Props) {
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<any>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Student contract state
  const [showStudentContract, setShowStudentContract] = useState(false);
  const [studentContractData, setStudentContractData] = useState<any>(null);
  const [pendingClockIn, setPendingClockIn] = useState<{ worker_id: string; shift_id: string; pin: string } | null>(null);

  const supabase = createClient();

  // Update clock every second
  useEffect(() => {
    const iv = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Load today's workers for this location
  // SECURITY: Do NOT select pin_code — it must never reach the client
  const loadWorkers = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];

    const { data: shifts } = await supabase
      .from('shifts')
      .select('id, start_time, end_time, role, worker_id, flexi_workers(id, first_name, last_name)')
      .eq('location_id', locationId)
      .eq('date', today)
      .eq('status', 'accepted');

    if (!shifts) { setLoading(false); return; }

    const shiftIds = shifts.map((s: any) => s.id);
    const { data: entries } = await supabase
      .from('time_entries')
      .select('*')
      .in('shift_id', shiftIds);

    const combined = shifts.map((s: any) => {
      const w = s.flexi_workers;
      const entry = entries?.find((e: any) => e.shift_id === s.id && !e.clock_out);
      const doneEntry = entries?.find((e: any) => e.shift_id === s.id && e.clock_out);
      return {
        shift_id: s.id,
        worker_id: w?.id,
        first_name: w?.first_name || '?',
        last_name: w?.last_name || '?',
        start_time: s.start_time,
        end_time: s.end_time,
        role: s.role,
        is_clocked_in: !!entry,
        is_done: !!doneEntry,
        entry_id: entry?.id,
        clock_in_time: entry?.clock_in,
      };
    });

    setWorkers(combined);
    setLoading(false);
  }, [supabase, locationId]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  useEffect(() => {
    const iv = setInterval(loadWorkers, 30000);
    return () => clearInterval(iv);
  }, [loadWorkers]);

  const handleSelectWorker = (w: any) => {
    if (w.is_done) return;
    setSelectedWorker(w);
    setPin('');
    setMessage(null);
  };

  const addDigit = (d: string) => {
    if (pin.length >= 4) return;
    setPin((p) => p + d);
  };

  const deleteDigit = () => setPin((p) => p.slice(0, -1));

  // Execute the actual clock-in (called directly or after student contract)
  const executeClockIn = async (workerId: string, shiftId: string, pinCode: string) => {
    const result = await kioskClockIn({
      worker_id: workerId,
      shift_id: shiftId,
      pin: pinCode,
      location_token: locationToken,
    });

    if ('error' in result && result.error) {
      setMessage({ type: 'error', text: result.error });
      setPin('');
    } else {
      setMessage({ type: 'success', text: `Arrivée enregistrée pour ${result.worker_name}` });
      setTimeout(() => {
        setSelectedWorker(null);
        setPin('');
        setMessage(null);
        loadWorkers();
      }, 3000);
    }
  };

  const handleSubmitPin = async () => {
    if (pin.length !== 4 || !selectedWorker) return;
    setProcessing(true);
    setMessage(null);

    // CLOCK OUT — no contract needed
    if (selectedWorker.is_clocked_in) {
      const result = await kioskClockOut({
        worker_id: selectedWorker.worker_id,
        shift_id: selectedWorker.shift_id,
        pin,
        location_token: locationToken,
      });

      if ('error' in result && result.error) {
        setMessage({ type: 'error', text: result.error });
        setPin('');
      } else {
        const hoursLabel = 'hours' in result && result.hours
          ? ` — ${result.hours.toFixed(1)}h travaillées`
          : '';
        setMessage({ type: 'success', text: `Départ enregistré pour ${result.worker_name}${hoursLabel}` });
        setTimeout(() => {
          setSelectedWorker(null);
          setPin('');
          setMessage(null);
          loadWorkers();
        }, 3000);
      }
      setProcessing(false);
      return;
    }

    // CLOCK IN — check student contract first (PIN-verified server-side)
    const check = await kioskCheckStudentContract(
      selectedWorker.shift_id,
      selectedWorker.worker_id,
      pin,
    );

    // Handle PIN errors from the check
    if ('error' in check && check.error) {
      setMessage({ type: 'error', text: check.error });
      setPin('');
      setProcessing(false);
      return;
    }

    if (check.needed) {
      // Student needs to sign → show modal, save pending clock-in
      setStudentContractData(check.contractData);
      setPendingClockIn({
        worker_id: selectedWorker.worker_id,
        shift_id: selectedWorker.shift_id,
        pin,
      });
      setShowStudentContract(true);
      setProcessing(false);
      return;
    }

    // Not a student or already signed → clock in directly
    await executeClockIn(selectedWorker.worker_id, selectedWorker.shift_id, pin);
    setProcessing(false);
  };

  // After student signs contract → proceed with clock-in
  const handleStudentContractSigned = async () => {
    setShowStudentContract(false);
    setStudentContractData(null);

    if (pendingClockIn) {
      setProcessing(true);
      await executeClockIn(pendingClockIn.worker_id, pendingClockIn.shift_id, pendingClockIn.pin);
      setPendingClockIn(null);
      setProcessing(false);
    }
  };

  const handleStudentContractCancel = () => {
    setShowStudentContract(false);
    setStudentContractData(null);
    setPendingClockIn(null);
    setPin('');
  };

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4 && selectedWorker && !processing) {
      handleSubmitPin();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ===== STUDENT CONTRACT MODAL =====
  if (showStudentContract && studentContractData) {
    return (
      <KioskStudentContractModal
        contractData={studentContractData}
        pin={pendingClockIn?.pin || ''}
        onSigned={handleStudentContractSigned}
        onCancel={handleStudentContractCancel}
      />
    );
  }

  // ===== PIN ENTRY SCREEN =====
  if (selectedWorker) {
    const isClockedIn = selectedWorker.is_clocked_in;
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        <div className="flex items-center p-4">
          <button onClick={() => { setSelectedWorker(null); setPin(''); setMessage(null); }}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wider">{locationName}</div>
          </div>
          <div className="w-10" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold mb-4 ${
            isClockedIn
              ? 'bg-gradient-to-br from-red-500 to-red-600'
              : 'bg-gradient-to-br from-emerald-400 to-emerald-600'
          }`}>
            {selectedWorker.first_name[0]}{selectedWorker.last_name[0]}
          </div>
          <h2 className="text-xl font-bold mb-1">{selectedWorker.first_name} {selectedWorker.last_name}</h2>
          <p className="text-sm text-gray-400 mb-1">
            {selectedWorker.start_time?.slice(0, 5)} – {selectedWorker.end_time?.slice(0, 5)}
          </p>
          <p className={`text-lg font-bold mb-8 ${isClockedIn ? 'text-red-400' : 'text-emerald-400'}`}>
            {isClockedIn ? '👋 Départ' : '✅ Arrivée'}
          </p>

          {message && (
            <div className={`w-full max-w-xs mb-6 p-4 rounded-2xl text-center font-medium ${
              message.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>
              <div className="text-2xl mb-1">{message.type === 'success' ? '✔' : '✗'}</div>
              {message.text}
            </div>
          )}

          {!message?.type || message.type !== 'success' ? (
            <>
              <p className="text-sm text-gray-400 mb-4">Entrez votre code PIN</p>
              <div className="flex gap-4 mb-8">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`w-4 h-4 rounded-full transition-all ${
                    i < pin.length ? 'bg-orange-500 scale-125' : 'bg-white/20'
                  }`} />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
                  if (key === '') return <div key="empty" />;
                  if (key === 'del') {
                    return (
                      <button key="del" onClick={deleteDigit}
                        className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-colors">
                        <Delete size={22} className="text-gray-400" />
                      </button>
                    );
                  }
                  return (
                    <button key={key} onClick={() => addDigit(key)} disabled={processing}
                      className="h-16 rounded-2xl bg-white/10 hover:bg-white/15 active:bg-orange-500/30 text-2xl font-bold transition-all active:scale-95 disabled:opacity-50">
                      {key}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // ===== WORKER LIST SCREEN =====
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="text-center pt-8 pb-6 px-4">
        <div className="text-xs text-orange-400 uppercase tracking-widest font-medium mb-1">MDjambo</div>
        <h1 className="text-2xl font-bold">{locationName}</h1>
        <div className="text-4xl font-mono font-bold text-white mt-3">
          {currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="text-sm text-gray-500 mt-1">
          {currentTime.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      <div className="flex-1 px-4 pb-6">
        {workers.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🏠</div>
            <p className="text-gray-400 font-medium">Aucun shift prévu aujourd&apos;hui</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3 px-1">
              Équipe du jour – {workers.length} personne{workers.length > 1 ? 's' : ''}
            </p>
            <div className="space-y-2">
              {workers.map((w) => {
                const isClockedIn = w.is_clocked_in;
                const isDone = w.is_done;
                const elapsed = isClockedIn && w.clock_in_time
                  ? Math.floor((currentTime.getTime() - new Date(w.clock_in_time).getTime()) / 60000)
                  : 0;

                return (
                  <button
                    key={w.shift_id}
                    onClick={() => handleSelectWorker(w)}
                    disabled={isDone}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98] ${
                      isDone ? 'bg-white/5 opacity-40 cursor-not-allowed'
                      : isClockedIn ? 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/15'
                      : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${
                      isDone ? 'bg-blue-500/20 text-blue-300'
                      : isClockedIn ? 'bg-gradient-to-br from-red-500 to-red-600'
                      : 'bg-gradient-to-br from-orange-400 to-red-500'
                    }`}>
                      {w.first_name[0]}{w.last_name[0]}
                    </div>

                    <div className="flex-1 text-left min-w-0">
                      <div className="font-bold text-base truncate">{w.first_name} {w.last_name}</div>
                      <div className="text-sm text-gray-400">
                        {w.start_time?.slice(0, 5)} – {w.end_time?.slice(0, 5)}
                        {w.role !== 'polyvalent' && ` · ${w.role}`}
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      {isDone ? (
                        <span className="text-xs text-blue-300 font-medium px-3 py-1.5 bg-blue-500/10 rounded-full">Terminé</span>
                      ) : isClockedIn ? (
                        <span className="flex items-center gap-1.5 text-xs text-red-300 font-medium px-3 py-1.5 bg-red-500/10 rounded-full">
                          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                          {Math.floor(elapsed / 60)}h{String(elapsed % 60).padStart(2, '0')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500 font-medium px-3 py-1.5 bg-white/5 rounded-full">
                          Pas pointé
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="text-center py-4 text-[10px] text-gray-600">
        FritOS Flexi — Pointage
      </div>
    </div>
  );
}
