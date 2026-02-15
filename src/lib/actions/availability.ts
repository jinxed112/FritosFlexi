'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { AvailabilityType } from '@/types';

/**
 * Set availability for a specific date (flexi action)
 * Replaces all existing availabilities for that date
 */
export async function setAvailability(
  date: string,
  types: AvailabilityType[]
) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!worker) return { error: 'Profil worker introuvable' };

  // Check if there's an accepted shift on this date (cannot modify)
  const { data: acceptedShifts } = await supabase
    .from('shifts')
    .select('id')
    .eq('worker_id', worker.id)
    .eq('date', date)
    .in('status', ['accepted', 'completed']);

  if (acceptedShifts && acceptedShifts.length > 0) {
    return { error: 'Impossible de modifier la disponibilité : un shift est déjà accepté ce jour' };
  }

  // Delete existing availabilities for this date
  await supabase
    .from('flexi_availabilities')
    .delete()
    .eq('worker_id', worker.id)
    .eq('date', date);

  // Insert new availabilities
  if (types.length > 0) {
    const rows = types.map((type) => ({
      worker_id: worker.id,
      date,
      type,
    }));

    const { error } = await supabase
      .from('flexi_availabilities')
      .insert(rows);

    if (error) return { error: error.message };
  }

  revalidatePath('/flexi/availability');
  revalidatePath('/dashboard/flexis/planning');
  return { success: true };
}

/**
 * Get availabilities for a date range (used by manager planning)
 */
export async function getAvailabilities(startDate: string, endDate: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('flexi_availabilities')
    .select(`
      *,
      flexi_workers(id, first_name, last_name)
    `)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');

  if (error) return { error: error.message };
  return { data };
}
