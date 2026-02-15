'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ClockInput } from '@/types';

/**
 * Clock IN for a shift
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

  // Verify shift exists, is accepted, and belongs to this worker
  const { data: shift } = await supabase
    .from('shifts')
    .select('*, locations(*)')
    .eq('id', input.shift_id)
    .eq('worker_id', worker.id)
    .eq('status', 'accepted')
    .single();

  if (!shift) return { error: 'Shift introuvable ou non accepté' };

  // Verify geolocation
  const location = (shift as any).locations;
  const { data: geoCheck } = await supabase.rpc('haversine_distance', {
    lat1: input.latitude,
    lng1: input.longitude,
    lat2: location.latitude,
    lng2: location.longitude,
  });

  const geoValid = (geoCheck as number) <= location.geo_radius_meters;

  if (!geoValid) {
    return { error: 'Vous devez être sur place pour pointer. Rapprochez-vous de la friterie.' };
  }

  // Check if already clocked in
  const { data: existing } = await supabase
    .from('time_entries')
    .select('id')
    .eq('shift_id', input.shift_id)
    .eq('worker_id', worker.id)
    .is('clock_out', null)
    .maybeSingle();

  if (existing) return { error: 'Vous êtes déjà pointé pour ce shift' };

  // Create time entry
  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      shift_id: input.shift_id,
      worker_id: worker.id,
      clock_in: new Date().toISOString(),
      geo_lat_in: input.latitude,
      geo_lng_in: input.longitude,
      geo_valid_in: geoValid,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/flexi/clock');
  revalidatePath('/dashboard/flexis/live');
  return { data };
}

/**
 * Clock OUT for a shift
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

  // Find active time entry
  const { data: entry } = await supabase
    .from('time_entries')
    .select('*, shifts(locations(*))')
    .eq('shift_id', input.shift_id)
    .eq('worker_id', worker.id)
    .is('clock_out', null)
    .single();

  if (!entry) return { error: 'Aucun pointage actif trouvé' };

  // Verify geolocation
  const location = (entry as any).shifts.locations;
  const { data: geoCheck } = await supabase.rpc('haversine_distance', {
    lat1: input.latitude,
    lng1: input.longitude,
    lat2: location.latitude,
    lng2: location.longitude,
  });

  const geoValid = (geoCheck as number) <= location.geo_radius_meters;

  if (!geoValid) {
    return { error: 'Vous devez être sur place pour pointer votre départ.' };
  }

  // Update time entry
  const { data, error } = await supabase
    .from('time_entries')
    .update({
      clock_out: new Date().toISOString(),
      geo_lat_out: input.latitude,
      geo_lng_out: input.longitude,
      geo_valid_out: geoValid,
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
        geo_valid_in: true, // Manual override
      })
      .select()
      .single();

    if (error) return { error: error.message };
    revalidatePath('/dashboard/flexis/live');
    return { data };
  } else {
    const { data: entry } = await supabase
      .from('time_entries')
      .select('id')
      .eq('shift_id', shiftId)
      .eq('worker_id', workerId)
      .is('clock_out', null)
      .single();

    if (!entry) return { error: 'Aucun pointage actif' };

    const { data, error } = await supabase
      .from('time_entries')
      .update({
        clock_out: new Date().toISOString(),
        geo_valid_out: true,
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
 * Validate a time entry (manager action)
 * Triggers automatic cost_line generation via DB trigger
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
