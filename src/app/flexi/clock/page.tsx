'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { clockIn, clockOut } from '@/lib/actions/clock';
import { signIndependentConvention } from '@/lib/actions/convention';
import { getCurrentPosition } from '@/utils/geo';
import { MapPin, AlertCircle } from 'lucide-react';

export default function FlexiClockPage() {
  const [shift, setShift] = useState<any>(null);
  const [timeEntry, setTimeEntry] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [error, setError] = useState('');
  const [worker, setWorker] = useState<any>(null);

  const supabase = createClient();

  const fetchTodayShift = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: w } = await supabase
      .from('flexi_workers')
      .select('id, status, hourly_rate, vat_applicable, vat_rate, vat_number, signature_url')
      .eq('user_id', user.id)
      .single();

    if (!w) return;
    setWorker(w);

    const today = new Date().toISOString().split('T')[0];
    const { data: shifts } = await supabase
      .from('shifts')
      .select('*, locations(id, name, address, latitude, longitude, geo_radius_meters)')
      .eq('worker_id', w.id)
      .eq('date', today)
      .eq('status', 'accepted')
      .limit(1);

    if (shifts && shifts.length > 0) {
      setShift(shifts[0]);
      const { data: entries } = await supabase
        .from('time_entries')
        .select('*')
        .eq('shift_id', shifts[0].id)
        .eq('worker_id', w.id)
        .is('clock_out', null)
        .limit(1);
      if (entries && entries.length > 0) {
        setTimeEntry(entries[0]);
      }
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchTodayShift(); }, [fetchTodayShift]);

  useEffect(() => {
    if (!timeEntry?.clock_in) return;
    const start = new Date(timeEntry.clock_in).getTime();
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [timeEntry]);

  const formatElapsed = (s: number) => {
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  };

  const doClockIn = async (latitude: number, longitude: number) => {
    const result = await clockIn({ shift_id: shift.id, latitude, longitude });
    if ('error' in result && result.error) {
      setError(result.error);
    } else {
      setTimeEntry(result.data);
    }
  };

  const generateConventionInBackground = async (latitude: number, longitude: number) => {
    if (!worker || !shift) return;

    // Verifier si convention deja generee
    const { data: existing } = await supabase
      .from('independent_conventions')
      .select('id')
      .eq('shift_id', shift.id)
      .maybeSingle();

    if (existing) return;

    const [sh, sm] = shift.start_time.split(':').map(Number);
    const [eh, em] = shift.end_time.split(':').map(Number);
    const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    const hourlyRate = worker.hourly_rate || 18;
    const amountHtva = Math.round(hours * hourlyRate * 100) / 100;
    const vatRate = worker.vat_applicable ? (worker.vat_rate || 21) : 0;
    const vatAmount = Math.round(amountHtva * vatRate / 100 * 100) / 100;
    const amountTtc = Math.round((amountHtva + vatAmount) * 100) / 100;

    // Generation en arriere-plan, sans bloquer le pointage
    signIndependentConvention({
      shiftId: shift.id,
      workerId: worker.id,
      locationId: shift.location_id,
      conventionDate: shift.date,
      startTime: shift.start_time.slice(0, 5),
      endTime: shift.end_time.slice(0, 5),
      hourlyRate,
      amountHtva,
      vatRate,
      vatAmount,
      amountTtc,
      geoLat: latitude,
      geoLng: longitude,
      userAgent: navigator.userAgent,
    }).catch(console.error);
  };

  const handleClock = async () => {
    if (!shift) return;
    setClocking(true);
    setError('');

    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;

      if (timeEntry) {
        const result = await clockOut({ shift_id: shift.id, latitude, longitude });
        if ('error' in result && result.error) {
          setError(result.error);
        } else {
          setTimeEntry(null);
          setElapsed(0);
        }
      } else {
        // Pour les independants : generer convention en arriere-plan si signature existe
        if (worker?.status === 'independent' && worker?.signature_url) {
          generateConventionInBackground(latitude, longitude);
        }
        await doClockIn(latitude, longitude);
      }
    } catch (err: any) {
      setError(err.message || 'Erreur de geolocalisation');
    }
    setClocking(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!shift) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <div className="text-4xl mb-3">🏠</div>
        <p className="font-medium">Aucun shift prevu aujourd&apos;hui</p>
        <p className="text-xs mt-1">Revenez quand un shift sera planifie</p>
      </div>
    );
  }

  const isClockedIn = !!timeEntry;

  return (
    <div className="flex flex-col items-center pt-6">
      <div className="text-sm font-medium text-gray-500 mb-1">
        {shift.locations?.name}
      </div>
      <div className="text-xs text-gray-400 mb-8">
        Shift : {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
      </div>

      <button
        onClick={handleClock}
        disabled={clocking}
        className={`w-48 h-48 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-lg active:scale-95 disabled:opacity-50 ${
          isClockedIn
            ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-200 text-white'
            : 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-200 text-white'
        }`}
      >
        <span className="text-4xl mb-1">{isClockedIn ? '👋' : '✅'}</span>
        <span className="text-lg font-bold">
          {clocking ? '...' : isClockedIn ? 'DEPART' : 'ARRIVEE'}
        </span>
      </button>

      {error && (
        <div className="mt-6 flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm max-w-xs text-center">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {isClockedIn && (
        <div className="mt-8 text-center">
          <div className="text-3xl font-mono font-bold text-gray-800 tracking-wider">
            {formatElapsed(elapsed)}
          </div>
          <p className="text-xs text-gray-400 mt-1">Temps de travail en cours</p>
          <div className="mt-4 flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-700 font-medium">Geoloc. verifiee - sur site</span>
          </div>
        </div>
      )}

      {!isClockedIn && (
        <div className="mt-8 text-center">
          <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-full">
            <MapPin size={14} className="text-blue-500" />
            <span className="text-xs text-blue-600 font-medium">La geolocalisation sera verifiee</span>
          </div>
        </div>
      )}
    </div>
  );
}
