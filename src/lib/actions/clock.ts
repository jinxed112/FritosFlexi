'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ClockInput } from '@/types';

/**
 * Clock IN for a shift (authenticated flexi — original)
 */
export async function clockIn(input: ClockInput) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!worker) return { error: 'Profil worker introuvable' };

  const { data: shift } = await supabase
    .from('shifts')
    .select('*, locations(*)')
    .eq('id', input.shift_id)
    .eq('worker_id', worker.id)
    .eq('status', 'accepted')
    .single();

  if (!shift) return { error: 'Shift introuvable ou non accepté' };

  const { data: existing } = await supabase
    .from('time_entries')
    .select('id')
    .eq('shift_id', input.shift_id)
    .eq('worker_id', worker.id)
    .is('clock_out', null)
    .maybeSingle();

  if (existing) return { error: 'Vous êtes déjà pointé pour ce shift' };

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      shift_id: input.shift_id,
      worker_id: worker.id,
      clock_in: new Date().toISOString(),
      geo_lat_in: input.latitude,
      geo_lng_in: input.longitude,
      geo_valid_in: true,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/flexi/clock');
  revalidatePath('/dashboard/flexis/live');
  return { data };
}

/**
 * Clock OUT for a shift (authenticated flexi — original)
 */
export async function clockOut(input: ClockInput) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!worker) return { error: 'Profil worker introuvable' };

  const { data: entry } = await supabase
    .from('time_entries')
    .select('*')
    .eq('shift_id', input.shift_id)
    .eq('worker_id', worker.id)
    .is('clock_out', null)
    .single();

  if (!entry) return { error: 'Aucun pointage actif trouvé' };

  const { data, error } = await supabase
    .from('time_entries')
    .update({
      clock_out: new Date().toISOString(),
      geo_lat_out: input.latitude,
      geo_lng_out: input.longitude,
      geo_valid_out: true,
    })
    .eq('id', entry.id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/flexi/clock');
  revalidatePath('/dashboard/flexis/live');
  revalidatePath('/dashboard/flexis/validation');
  return { data };
}

/**
 * KIOSK Clock IN — PIN-based, no auth required
 * Used from /pointage/:token page
 */
export async function kioskClockIn(input: {
  worker_id: string;
  shift_id: string;
  pin: string;
  location_token: string;
}) {
  const admin = createAdminClient();

  // Verify location exists
  const { data: location } = await admin
    .from('locations')
    .select('id, name')
    .eq('qr_code_token', input.location_token)
    .eq('is_active', true)
    .single();

  if (!location) return { error: 'Location invalide' };

  // Verify worker and PIN
  const { data: worker } = await admin
    .from('flexi_workers')
    .select('id, first_name, last_name, pin_code')
    .eq('id', input.worker_id)
    .eq('is_active', true)
    .single();

  if (!worker) return { error: 'Worker introuvable' };
  if (!worker.pin_code) return { error: 'Aucun PIN configuré. Configurez votre PIN dans votre profil.' };
  if (worker.pin_code !== input.pin) return { error: 'PIN incorrect' };

  // Verify shift
  const { data: shift } = await admin
    .from('shifts')
    .select('id, location_id')
    .eq('id', input.shift_id)
    .eq('worker_id', input.worker_id)
    .eq('location_id', location.id)
    .eq('status', 'accepted')
    .single();

  if (!shift) return { error: 'Shift introuvable pour cette location' };

  // Check not already clocked in
  const { data: existing } = await admin
    .from('time_entries')
    .select('id')
    .eq('shift_id', input.shift_id)
    .eq('worker_id', input.worker_id)
    .is('clock_out', null)
    .maybeSingle();

  if (existing) return { error: 'Déjà pointé pour ce shift' };

  // Clock in
  const { data, error } = await admin
    .from('time_entries')
    .insert({
      shift_id: input.shift_id,
      worker_id: input.worker_id,
      clock_in: new Date().toISOString(),
      geo_valid_in: true,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/live');
  return { data, worker_name: `${worker.first_name} ${worker.last_name}` };
}

/**
 * KIOSK Clock OUT — PIN-based, no auth required
 */
export async function kioskClockOut(input: {
  worker_id: string;
  shift_id: string;
  pin: string;
  location_token: string;
}) {
  const admin = createAdminClient();

  // Verify location
  const { data: location } = await admin
    .from('locations')
    .select('id')
    .eq('qr_code_token', input.location_token)
    .eq('is_active', true)
    .single();

  if (!location) return { error: 'Location invalide' };

  // Verify worker and PIN
  const { data: worker } = await admin
    .from('flexi_workers')
    .select('id, first_name, last_name, pin_code')
    .eq('id', input.worker_id)
    .single();

  if (!worker) return { error: 'Worker introuvable' };
  if (worker.pin_code !== input.pin) return { error: 'PIN incorrect' };

  // Find active entry
  const { data: entry } = await admin
    .from('time_entries')
    .select('id, clock_in')
    .eq('shift_id', input.shift_id)
    .eq('worker_id', input.worker_id)
    .is('clock_out', null)
    .single();

  if (!entry) return { error: 'Aucun pointage actif' };

  const clockOut = new Date().toISOString();
  const clockInTime = new Date(entry.clock_in).getTime();
  const clockOutTime = new Date(clockOut).getTime();
  const actualHours = Math.round(((clockOutTime - clockInTime) / 3600000) * 100) / 100;

  const { data, error } = await admin
    .from('time_entries')
    .update({
      clock_out: clockOut,
      geo_valid_out: true,
      actual_hours: actualHours,
    })
    .eq('id', entry.id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/live');
  revalidatePath('/dashboard/flexis/validation');
  return { data, worker_name: `${worker.first_name} ${worker.last_name}`, hours: actualHours };
}

/**
 * Manual clock by manager (override)
 */
export async function manualClock(
  shiftId: string,
  workerId: string,
  type: 'in' | 'out'
) {
  const supabase = createClient();

  if (type === 'in') {
    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        shift_id: shiftId,
        worker_id: workerId,
        clock_in: new Date().toISOString(),
        geo_valid_in: true,
      })
      .select()
      .single();

    if (error) return { error: error.message };
    revalidatePath('/dashboard/flexis/live');
    return { data };
  } else {
    const { data: entry } = await supabase
      .from('time_entries')
      .select('id, clock_in')
      .eq('shift_id', shiftId)
      .eq('worker_id', workerId)
      .is('clock_out', null)
      .single();

    if (!entry) return { error: 'Aucun pointage actif' };

    const clockOut = new Date().toISOString();
    const actualHours = Math.round(((new Date(clockOut).getTime() - new Date(entry.clock_in).getTime()) / 3600000) * 100) / 100;

    const { data, error } = await supabase
      .from('time_entries')
      .update({
        clock_out: clockOut,
        geo_valid_out: true,
        actual_hours: actualHours,
      })
      .eq('id', entry.id)
      .select()
      .single();

    if (error) return { error: error.message };
    revalidatePath('/dashboard/flexis/live');
    revalidatePath('/dashboard/flexis/validation');
    return { data };
  }
}

/**
 * Update worker PIN code
 */
export async function updatePinCode(pin: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  if (!/^\d{4}$/.test(pin)) return { error: 'Le PIN doit contenir exactement 4 chiffres' };

  const { error } = await supabase
    .from('flexi_workers')
    .update({ pin_code: pin })
    .eq('user_id', user.id);

  if (error) return { error: error.message };

  revalidatePath('/flexi/account');
  return { success: true };
}

/**
 * Validate a time entry (manager action)
 */
export async function validateTimeEntry(entryId: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { error } = await supabase
    .from('time_entries')
    .update({
      validated: true,
      validated_by: user.id,
      validated_at: new Date().toISOString(),
    })
    .eq('id', entryId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/validation');
  revalidatePath('/dashboard/flexis/export');
  return { success: true };
}

/**
 * Correct hours on a time entry (manager action)
 */
export async function correctTimeEntry(
  entryId: string,
  clockIn: string,
  clockOut: string
) {
  const supabase = createClient();

  const { error } = await supabase
    .from('time_entries')
    .update({ clock_in: clockIn, clock_out: clockOut })
    .eq('id', entryId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/validation');
  return { success: true };
}
