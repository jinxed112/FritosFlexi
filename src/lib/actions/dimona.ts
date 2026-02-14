'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { DimonaStatus } from '@/types';

/**
 * Update Dimona status after manual ONSS declaration (manager action)
 */
export async function updateDimonaStatus(
  dimonaId: string,
  status: DimonaStatus,
  periodId?: string,
  notes?: string
) {
  const supabase = createClient();

  const updateData: Record<string, unknown> = {
    status,
    responded_at: new Date().toISOString(),
    sent_method: 'manual',
  };

  if (periodId) updateData.dimona_period_id = periodId;
  if (notes) updateData.notes = notes;
  if (status === 'sent') updateData.sent_at = new Date().toISOString();

  const { error } = await supabase
    .from('dimona_declarations')
    .update(updateData)
    .eq('id', dimonaId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/dimona');
  return { success: true };
}

/**
 * Get Dimona data formatted for ONSS portal copy
 */
export async function getDimonaForCopy(dimonaId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('dimona_declarations')
    .select(`
      *,
      flexi_workers(first_name, last_name, niss, date_of_birth),
      locations(name, address)
    `)
    .eq('id', dimonaId)
    .single();

  if (error) return { error: error.message };

  const d = data as any;
  return {
    data: {
      // Employer
      employer_noss: process.env.NEXT_PUBLIC_EMPLOYER_NOSS || 'À configurer',
      // Worker
      worker_niss: d.worker_niss,
      worker_name: `${d.flexi_workers.last_name} ${d.flexi_workers.first_name}`,
      worker_dob: d.flexi_workers.date_of_birth,
      // Declaration
      type: 'FLX',
      joint_committee: '302',
      planned_start: d.planned_start,
      planned_end: d.planned_end,
      planned_hours: d.planned_hours,
      // Location
      location: d.locations.name,
    },
  };
}
