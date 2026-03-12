'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { verifyPin } from '@/lib/actions/verify-pin';

/**
 * Clock IN — authenticated user (from flexi portal)
 */
export async function clockIn(input: {
  shift_id: string;
  latitude?: number;
  longitude?: number;
}) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!worker) return { error: 'Profil worker introuvable' };

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
 * Clock OUT — authenticated user (from flexi portal)
 * Uses adminClient to bypass RLS — workers have INSERT/SELECT only on time_entries
 */
export async function clockOut(input: {
  shift_id: string;
  latitude?: number;
  longitude?: number;
}) {
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!worker) return { error: 'Profil worker introuvable' };

  const { data: entry } = await admin
    .from('time_entries')
    .select('*')
    .eq('shift_id', input.shift_id)
    .eq('worker_id', worker.id)
    .is('clock_out', null)
    .single();

  if (!entry) return { error: 'Aucun pointage actif trouvé' };

  const clockOut = new Date();
  const clockIn = new Date(entry.clock_in);
  const hoursWorked = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

  const { data, error } = await admin
    .from('time_entries')
    .update({
      clock_out: clockOut.toISOString(),
      geo_lat_out: input.latitude,
      geo_lng_out: input.longitude,
      geo_valid_out: true,
      actual_hours: Math.round(hoursWorked * 100) / 100,
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
 */
export async function kioskClockIn(input: {
  worker_id: string;
  shift_id: string;
  pin: string;
  location_token: string;
}) {
  const admin = createAdminClient();

  const { data: location } = await admin
    .from('locations')
    .select('id, name')
    .eq('qr_code_token', input.location_token)
    .eq('is_active', true)
    .single();

  if (!location) return { error: 'Location invalide' };

  const pinResult = await verifyPin(input.worker_id, input.pin);
  if (!pinResult.success) return { error: pinResult.error };

  const { data: shift } = await admin
    .from('shifts')
    .select('id, location_id')
    .eq('id', input.shift_id)
    .eq('worker_id', input.worker_id)
    .eq('location_id', location.id)
    .eq('status', 'accepted')
    .single();

  if (!shift) return { error: 'Shift introuvable pour cette location' };

  const { data: existing } = await admin
    .from('time_entries')
    .select('id')
    .eq('shift_id', input.shift_id)
    .eq('worker_id', input.worker_id)
    .is('clock_out', null)
    .maybeSingle();

  if (existing) return { error: 'Déjà pointé pour ce shift' };

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
  return { data, worker_name: `${pinResult.worker.first_name} ${pinResult.worker.last_name}` };
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

  const { data: location } = await admin
    .from('locations')
    .select('id')
    .eq('qr_code_token', input.location_token)
    .eq('is_active', true)
    .single();

  if (!location) return { error: 'Location invalide' };

  const pinResult = await verifyPin(input.worker_id, input.pin);
  if (!pinResult.success) return { error: pinResult.error };

  const { data: entry } = await admin
    .from('time_entries')
    .select('id, clock_in')
    .eq('shift_id', input.shift_id)
    .eq('worker_id', input.worker_id)
    .is('clock_out', null)
    .maybeSingle();

  if (!entry) return { error: 'Aucun pointage actif trouvé' };

  const clockOut = new Date();
  const clockIn = new Date(entry.clock_in);
  const hoursWorked = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

  const { data, error } = await admin
    .from('time_entries')
    .update({
      clock_out: clockOut.toISOString(),
      geo_valid_out: true,
      actual_hours: Math.round(hoursWorked * 100) / 100,
    })
    .eq('id', entry.id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/live');
  revalidatePath('/dashboard/flexis/validation');
  return { data, worker_name: `${pinResult.worker.first_name} ${pinResult.worker.last_name}`, hours: hoursWorked };
}

/**
 * Créer un pointage manuel (manager) — pour les shifts sans pointage
 * Utilisé depuis la page de validation quand le worker n'a pas pointé sur place
 */
export async function createManualTimeEntry(input: {
  shift_id: string;
  worker_id: string;
  clock_in: string;  // ISO string
  clock_out: string; // ISO string
}) {
  const admin = createAdminClient();

  // Vérifier qu'il n'y a pas déjà un pointage pour ce shift
  const { data: existing } = await admin
    .from('time_entries')
    .select('id')
    .eq('shift_id', input.shift_id)
    .maybeSingle();

  if (existing) return { error: 'Un pointage existe déjà pour ce shift' };

  const clockIn = new Date(input.clock_in);
  const clockOut = new Date(input.clock_out);

  if (clockOut <= clockIn) return { error: 'L\'heure de fin doit être après l\'heure de début' };

  const hoursWorked = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);

  const { data, error } = await admin
    .from('time_entries')
    .insert({
      shift_id: input.shift_id,
      worker_id: input.worker_id,
      clock_in: clockIn.toISOString(),
      clock_out: clockOut.toISOString(),
      geo_valid_in: false,
      geo_valid_out: false,
      actual_hours: Math.round(hoursWorked * 100) / 100,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/validation');
  return { data };
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
 * Validate a time entry (manager action) — uses admin client to bypass RLS
 */
export async function validateTimeEntry(entryId: string) {
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { error } = await admin
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
 * Correct hours on a time entry (manager action) — uses admin client to bypass RLS
 */
export async function correctTimeEntry(
  entryId: string,
  clockIn: string,
  clockOut: string
) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('time_entries')
    .update({ clock_in: clockIn, clock_out: clockOut })
    .eq('id', entryId)
    .select('clock_in, clock_out')
    .single();

  if (error) return { error: error.message };

  // Recalcul actual_hours
  const ci = new Date(data.clock_in);
  const co = new Date(data.clock_out);
  const hoursWorked = (co.getTime() - ci.getTime()) / (1000 * 60 * 60);

  await admin
    .from('time_entries')
    .update({ actual_hours: Math.round(hoursWorked * 100) / 100 })
    .eq('id', entryId);

  revalidatePath('/dashboard/flexis/validation');
  return { success: true };
}
