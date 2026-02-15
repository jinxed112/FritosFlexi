'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { CreateShiftInput } from '@/types';

/**
 * Create shifts on multiple days at once (manager action)
 */
export async function createMultiShifts(input: {
  worker_id: string;
  location_id: string;
  role: string;
  days: { date: string; start_time: string; end_time: string }[];
}) {
  const supabase = createClient();

  const rows = input.days.map((d) => ({
    location_id: input.location_id,
    worker_id: input.worker_id,
    date: d.date,
    start_time: d.start_time,
    end_time: d.end_time,
    role: input.role || 'polyvalent',
    status: 'proposed' as const,
  }));

  const { data, error } = await supabase
    .from('shifts')
    .insert(rows)
    .select();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/planning');
  revalidatePath('/flexi/missions');
  return { data };
}

/**
 * Create a new shift (manager action)
 */
export async function createShift(input: CreateShiftInput) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('shifts')
    .insert({
      location_id: input.location_id,
      worker_id: input.worker_id || null,
      date: input.date,
      start_time: input.start_time,
      end_time: input.end_time,
      role: input.role ?? 'polyvalent',
      notes: input.notes || null,
      status: 'draft',
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/planning');
  return { data };
}

/**
 * Propose a shift to a flexi worker (manager action)
 */
export async function proposeShift(shiftId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('shifts')
    .update({ status: 'proposed' })
    .eq('id', shiftId)
    .eq('status', 'draft');

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/planning');
  revalidatePath('/flexi/missions');
  return { success: true };
}

/**
 * Accept a proposed shift (flexi action)
 * Also triggers automatic Dimona creation via DB trigger
 */
export async function acceptShift(shiftId: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  // Verify this shift is assigned to the current worker
  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!worker) return { error: 'Profil worker introuvable' };

  const { error } = await supabase
    .from('shifts')
    .update({ status: 'accepted' })
    .eq('id', shiftId)
    .eq('worker_id', worker.id)
    .eq('status', 'proposed');

  if (error) return { error: error.message };

  revalidatePath('/flexi/missions');
  revalidatePath('/flexi/planning');
  revalidatePath('/dashboard/flexis/planning');
  revalidatePath('/dashboard/flexis/dimona');
  return { success: true };
}

/**
 * Refuse a proposed shift (flexi action)
 */
export async function refuseShift(shiftId: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!worker) return { error: 'Profil worker introuvable' };

  const { error } = await supabase
    .from('shifts')
    .update({ status: 'refused' })
    .eq('id', shiftId)
    .eq('worker_id', worker.id)
    .eq('status', 'proposed');

  if (error) return { error: error.message };

  revalidatePath('/flexi/missions');
  revalidatePath('/dashboard/flexis/planning');
  return { success: true };
}

/**
 * Update a shift (manager action)
 */
export async function updateShift(shiftId: string, input: {
  start_time?: string;
  end_time?: string;
  role?: string;
  location_id?: string;
  notes?: string;
}) {
  const supabase = createClient();

  const { error } = await supabase
    .from('shifts')
    .update(input)
    .eq('id', shiftId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/planning');
  revalidatePath('/flexi/missions');
  revalidatePath('/flexi/planning');
  return { success: true };
}

/**
 * Delete a shift permanently (manager action)
 */
export async function deleteShift(shiftId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', shiftId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/planning');
  revalidatePath('/flexi/missions');
  return { success: true };
}

/**
 * Cancel a shift (manager action)
 */
export async function cancelShift(shiftId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('shifts')
    .update({ status: 'cancelled' })
    .eq('id', shiftId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/planning');
  return { success: true };
}

/**
 * Assign a worker to a draft shift (manager action)
 */
export async function assignWorkerToShift(shiftId: string, workerId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from('shifts')
    .update({ worker_id: workerId })
    .eq('id', shiftId)
    .eq('status', 'draft');

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/planning');
  return { success: true };
}