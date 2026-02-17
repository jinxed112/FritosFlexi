'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { manualClock } from '@/lib/actions/clock';
import { useRouter } from 'next/navigation';
import { Radio, QrCode, Clock, UserCheck, AlertTriangle, Play, Square, Copy, Check } from 'lucide-react';

export default function DashboardLivePage() {
  const router = useRouter();
  const today = new Date().toISOString().split('T')[0];
  const [shifts, setShifts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPending, startTransition] = useTransition();
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState('');
  const supabase = createClient();

  // Clock tick
  useEffect(() => {
    const iv = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const loadData = useCallback(async () => {
    const { data: locs } = await supabase.from('locations').select('*').eq('is_active', true);
    setLocations(locs || []);

    const { data: s } = await supabase
      .from('shifts')
      .select('*, flexi_workers(id, first_name, last_name), locations(name)')
      .eq('date', today)
      .in('status', ['accepted', 'completed']);
    setShifts(s || []);

    const shiftIds = (s || []).map((sh: any) => sh.id);
    if (shiftIds.length > 0) {
      const { data: e } = await supabase
        .from('time_entries')
        .select('*')
        .in('shift_id', shiftIds);
      setEntries(e || []);
    }

    setLoading(false);
  }, [supabase, today]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 15s
  useEffect(() => {
    const iv = setInterval(loadData, 15000);
    return () => clearInterval(iv);
  }, [loadData]);

  const handleManualClock = (shiftId: string, workerId: string, type: 'in' | 'out') => {
    startTransition(async () => {
      await manualClock(shiftId, workerId, type);
      loadData();
    });
  };

  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  if (loading) return <div className="py-10 text-center text-gray-400">Chargement...</div>;

  const activeCount = entries.filter((e: any) => e.clock_in && !e.clock_out).length;
  const totalExpected = shifts.length;
  const lateShifts = shifts.filter((s: any) => {
    const hasEntry = entries.some((e: any) => e.shift_id === s.id);
    if (hasEntry) return false;
    const [h, m] = s.start_time.split(':').map(Number);
    const shiftStart = new Date();
    shiftStart.setHours(h, m + 15, 0, 0); // 15min grace
    return currentTime > shiftStart;
  });

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Radio size={24} className="text-emerald-500" /> Live
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {currentTime.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' — '}
            {currentTime.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        <button onClick={() => setShowQR(!showQR)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
            showQR ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          <QrCode size={16} /> QR Codes
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{activeCount}</div>
          <div className="text-[11px] text-gray-400 font-medium">Sur site</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{totalExpected}</div>
          <div className="text-[11px] text-gray-400 font-medium">Prévus</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <div className={`text-2xl font-bold ${lateShifts.length > 0 ? 'text-red-500' : 'text-gray-300'}`}>{lateShifts.length}</div>
          <div className="text-[11px] text-gray-400 font-medium">En retard</div>
        </div>
      </div>

      {/* QR Code section */}
      {showQR && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <QrCode size={18} /> Liens de pointage
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Imprimez ces QR codes ou affichez les liens sur une tablette dans chaque friterie.
            Les employés scannent le QR → sélectionnent leur nom → entrent leur PIN.
          </p>
          <div className="space-y-3">
            {locations.map((loc: any) => {
              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/pointage/${loc.qr_code_token}`;
              return (
                <div key={loc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <QrCode size={20} className="text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800">{loc.name}</div>
                    <div className="text-xs text-gray-400 truncate">{url}</div>
                  </div>
                  <button onClick={() => copyUrl(url, loc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0">
                    {copied === loc.id ? <><Check size={12} className="text-emerald-500" /> Copié</> : <><Copy size={12} /> Copier</>}
                  </button>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors flex-shrink-0">
                    Ouvrir
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Late alerts */}
      {lateShifts.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-500" />
            <span className="text-sm font-bold text-red-700">En retard ({lateShifts.length})</span>
          </div>
          <div className="space-y-2">
            {lateShifts.map((s: any) => {
              const w = s.flexi_workers;
              return (
                <div key={s.id} className="flex items-center justify-between bg-white rounded-xl p-3">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{w?.first_name} {w?.last_name}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      devait commencer à {s.start_time?.slice(0, 5)} — {s.locations?.name}
                    </span>
                  </div>
                  <button onClick={() => handleManualClock(s.id, w?.id, 'in')} disabled={isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                    <Play size={12} /> Pointer IN
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Location cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {locations.map((loc: any) => {
          const locShifts = shifts.filter((s: any) => s.location_id === loc.id);
          const locEntries = entries.filter((e: any) => locShifts.some((s: any) => s.id === e.shift_id));
          const activeEntries = locEntries.filter((e: any) => e.clock_in && !e.clock_out);

          return (
            <div key={loc.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                {activeEntries.length > 0 && <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />}
                <h3 className="font-bold text-gray-900">{loc.name}</h3>
                <span className="ml-auto text-xs text-gray-400">{activeEntries.length} sur site</span>
              </div>

              {locShifts.length > 0 ? (
                <div className="space-y-2">
                  {locShifts.map((s: any) => {
                    const w = s.flexi_workers;
                    const entry = locEntries.find((e: any) => e.shift_id === s.id && !e.clock_out);
                    const doneEntry = locEntries.find((e: any) => e.shift_id === s.id && e.clock_out);
                    const isActive = !!entry;
                    const isDone = !!doneEntry;

                    const elapsed = isActive && entry?.clock_in
                      ? Math.floor((currentTime.getTime() - new Date(entry.clock_in).getTime()) / 60000)
                      : 0;

                    return (
                      <div key={s.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs ${
                          isActive ? 'bg-gradient-to-br from-orange-400 to-red-500'
                          : isDone ? 'bg-blue-400'
                          : 'bg-gray-300'
                        }`}>
                          {w?.first_name?.[0]}{w?.last_name?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800">{w?.first_name} {w?.last_name}</div>
                          <div className="text-xs text-gray-400">
                            {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                            {entry?.clock_in && ` · IN ${new Date(entry.clock_in).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`}
                            {doneEntry?.clock_out && ` · OUT ${new Date(doneEntry.clock_out).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}`}
                          </div>
                        </div>

                        {/* Status + manual actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            isActive ? 'bg-emerald-100 text-emerald-700'
                            : isDone ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-400'
                          }`}>
                            {isActive ? `${Math.floor(elapsed / 60)}h${String(elapsed % 60).padStart(2, '0')}` : isDone ? `${doneEntry.actual_hours?.toFixed(1) || '?'}h` : 'Absent'}
                          </span>

                          {/* Manual clock buttons */}
                          {!isActive && !isDone && (
                            <button onClick={() => handleManualClock(s.id, w?.id, 'in')} disabled={isPending}
                              className="p-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-600 transition-colors" title="Pointer IN manuellement">
                              <Play size={14} />
                            </button>
                          )}
                          {isActive && (
                            <button onClick={() => handleManualClock(s.id, w?.id, 'out')} disabled={isPending}
                              className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 transition-colors" title="Pointer OUT manuellement">
                              <Square size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucun shift aujourd&apos;hui</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
