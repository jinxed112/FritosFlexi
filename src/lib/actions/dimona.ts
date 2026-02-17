'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { DimonaStatus } from '@/types';
import { sendDimonaIn, sendDimonaCancel, sendDimonaUpdate } from '@/lib/dimona/service';

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

// ============================================================
// API DIMONA ACTIONS (Phase 2 - Automated via ONSS REST API)
// ============================================================

/**
 * Send Dimona-In via ONSS API for a specific dimona_declaration record
 */
export async function apiDeclareDimona(dimonaId: string) {
  const supabase = createClient();

  // Fetch the dimona record with related data
  const { data: dimona, error } = await supabase
    .from('dimona_declarations')
    .select(`
      *,
      flexi_workers(niss, first_name, last_name),
      shifts(date, start_time, end_time)
    `)
    .eq('id', dimonaId)
    .single();

  if (error || !dimona) {
    return { error: `Dimona not found: ${error?.message}` };
  }

  if (!dimona.flexi_workers?.niss) {
    return { error: `Worker ${dimona.flexi_workers?.first_name} ${dimona.flexi_workers?.last_name} n'a pas de NISS` };
  }

  const shift = dimona.shifts;
  if (!shift) {
    return { error: 'Shift non trouvé' };
  }

  // Update status to "sent"
  await supabase
    .from('dimona_declarations')
    .update({ status: 'sent', sent_at: new Date().toISOString(), sent_method: 'api' })
    .eq('id', dimonaId);

  // Call ONSS API
  const result = await sendDimonaIn(
    dimona.flexi_workers.niss,
    shift.date,
    shift.start_time,
    shift.end_time,
  );

  // Update with result
  const updateData: Record<string, unknown> = {
    onss_response: result,
    responded_at: new Date().toISOString(),
  };

  if (result.success) {
    updateData.status = 'ok';
    updateData.dimona_period_id = result.periodId?.toString();
    updateData.onss_declaration_id = result.declarationId;
    if (result.anomalies?.length) {
      updateData.notes = `API OK - Warnings: ${result.anomalies.map(a => a.descriptionFr).join('; ')}`;
    } else {
      updateData.notes = `API OK - Déclaration ${result.declarationId}, Période ${result.periodId}`;
    }
  } else {
    updateData.status = result.result === 'B' ? 'nok' : 'error';
    updateData.notes = `API ${result.result || 'ERROR'}: ${result.error || result.anomalies?.map(a => a.descriptionFr).join('; ')}`;
  }

  await supabase
    .from('dimona_declarations')
    .update(updateData)
    .eq('id', dimonaId);

  revalidatePath('/dashboard/flexis/dimona');

  if (result.success) {
    return { success: true, periodId: result.periodId, declarationId: result.declarationId };
  }
  return { error: updateData.notes as string };
}

/**
 * Cancel a Dimona via ONSS API
 * Uses the periodId from a previously accepted Dimona-In
 */
export async function apiCancelDimona(
  dimonaId: string,
  reason: 'worker_cancelled' | 'no_show' | 'manager_cancelled' = 'manager_cancelled'
) {
  const supabase = createClient();

  // Fetch the dimona record
  const { data: dimona, error } = await supabase
    .from('dimona_declarations')
    .select('*, shifts(id, date, start_time, end_time)')
    .eq('id', dimonaId)
    .single();

  if (error || !dimona) {
    return { error: `Dimona not found: ${error?.message}` };
  }

  if (!dimona.dimona_period_id) {
    return { error: 'Pas de periodId — impossible d\'annuler (la Dimona n\'a pas encore été acceptée par l\'ONSS)' };
  }

  const periodId = parseInt(dimona.dimona_period_id);

  // Create a CANCEL record
  const { data: cancelRecord } = await supabase
    .from('dimona_declarations')
    .insert({
      shift_id: dimona.shift_id,
      worker_id: dimona.worker_id,
      location_id: dimona.location_id,
      declaration_type: 'CANCEL',
      worker_type: 'FLX',
      joint_committee: '302',
      employer_noss: dimona.employer_noss,
      worker_niss: dimona.worker_niss,
      planned_start: dimona.planned_start,
      planned_end: dimona.planned_end,
      status: 'sent',
      sent_method: 'api',
      sent_at: new Date().toISOString(),
      notes: `Annulation: ${reason}`,
    })
    .select()
    .single();

  // Call ONSS API
  const result = await sendDimonaCancel(periodId);

  // Update cancel record
  if (cancelRecord) {
    await supabase
      .from('dimona_declarations')
      .update({
        status: result.success ? 'ok' : (result.result === 'B' ? 'nok' : 'error'),
        onss_response: result,
        onss_declaration_id: result.declarationId,
        responded_at: new Date().toISOString(),
        notes: result.success
          ? `Annulée (${reason}) - Déclaration ${result.declarationId}`
          : `Erreur annulation: ${result.error || result.anomalies?.map(a => a.descriptionFr).join('; ')}`,
      })
      .eq('id', cancelRecord.id);
  }

  // Update original Dimona-In as cancelled
  if (result.success) {
    await supabase
      .from('dimona_declarations')
      .update({ status: 'cancelled', notes: `Annulée: ${reason}` })
      .eq('id', dimonaId);

    // Update shift status
    await supabase
      .from('shifts')
      .update({ status: 'cancelled' })
      .eq('id', dimona.shift_id);
  }

  revalidatePath('/dashboard/flexis/dimona');

  if (result.success) {
    return { success: true };
  }
  return { error: result.error || 'Erreur lors de l\'annulation' };
}

/**
 * Declare all pending/ready Dimona-In records via API (batch)
 */
export async function apiBatchDeclareDimona() {
  const supabase = createClient();

  const { data: pending } = await supabase
    .from('dimona_declarations')
    .select('id')
    .eq('declaration_type', 'IN')
    .in('status', ['ready', 'pending'])
    .order('created_at', { ascending: true });

  if (!pending?.length) {
    return { success: true, count: 0, message: 'Aucune Dimona à déclarer' };
  }

  let ok = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const d of pending) {
    const result = await apiDeclareDimona(d.id);
    if (result.success) {
      ok++;
    } else {
      failed++;
      errors.push(result.error || 'Unknown error');
    }
    // Small delay to not overload ONSS
    await new Promise(r => setTimeout(r, 500));
  }

  revalidatePath('/dashboard/flexis/dimona');
  return { success: true, count: ok, failed, errors };
}
