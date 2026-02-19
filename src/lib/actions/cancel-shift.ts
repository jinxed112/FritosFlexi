'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Cancel a shift from the validation page
 * - Deletes the time_entry
 * - Sets the shift status to 'cancelled'
 * - Cancels the associated Dimona if exists
 */
export async function cancelShiftFromValidation(timeEntryId: string) {
  const supabase = createClient();
  const admin = createAdminClient();

  // Auth check: only managers can cancel
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };
  if (user.user_metadata?.role !== 'manager') return { error: 'Accès refusé' };

  // Get the time entry + shift info
  const { data: entry, error: fetchError } = await supabase
    .from('time_entries')
    .select('id, shift_id, worker_id')
    .eq('id', timeEntryId)
    .single();

  if (fetchError || !entry) {
    return { error: 'Entrée introuvable' };
  }

  // 1. Delete time entry
  const { error: deleteError } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', timeEntryId);

  if (deleteError) {
    return { error: `Erreur suppression pointage : ${deleteError.message}` };
  }

  // 2. Set shift to cancelled
  const { error: shiftError } = await supabase
    .from('shifts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', entry.shift_id);

  if (shiftError) {
    return { error: `Erreur annulation shift : ${shiftError.message}` };
  }

  // 3. Delete student contract if exists (shift not worked = contract void)
  await admin
    .from('student_contracts')
    .delete()
    .eq('shift_id', entry.shift_id);

  // 4. Handle associated Dimona
  // If not yet sent to ONSS → delete it
  await admin
    .from('dimona_declarations')
    .delete()
    .eq('shift_id', entry.shift_id)
    .in('status', ['pending', 'ready']);

  // If already sent/accepted by ONSS → mark for cancellation
  await admin
    .from('dimona_declarations')
    .update({ declaration_type: 'CANCEL', notes: 'Shift annulé depuis validation' })
    .eq('shift_id', entry.shift_id)
    .in('status', ['sent', 'ok']);

  revalidatePath('/dashboard/flexis/validation');
  revalidatePath('/dashboard/flexis/planning');
  revalidatePath('/dashboard/flexis/dimona');

  return { success: true };
}
