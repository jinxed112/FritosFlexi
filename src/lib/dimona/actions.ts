// ============================================================
// Dimona Actions - Server-side logic for FritOS Flexi
// Manages the full Dimona lifecycle integrated with Supabase
// ============================================================

'use server';

import { createClient } from '@supabase/supabase-js';
import { sendDimonaIn, sendDimonaCancel, sendDimonaUpdate } from './service';
import type { DimonaResult } from './types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ============================================================
// 1. DIMONA-IN : Déclarer un shift confirmé
//    Appelé la veille ou le jour même quand le shift est maintenu
// ============================================================

export async function declareDimonaIn(shiftId: string): Promise<DimonaResult> {
  // Fetch shift + worker data
  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .select(`
      id, date, start_time, end_time, location_id, worker_id,
      flexi_workers!inner(id, niss, first_name, last_name),
      locations!inner(id, name)
    `)
    .eq('id', shiftId)
    .single();

  if (shiftErr || !shift) {
    return { success: false, error: `Shift not found: ${shiftErr?.message}` };
  }

  if (!shift.flexi_workers?.niss) {
    return { success: false, error: `Worker ${shift.flexi_workers?.first_name} ${shift.flexi_workers?.last_name} has no NISS` };
  }

  if (shift.status !== 'accepted') {
    return { success: false, error: `Shift status is "${shift.status}", expected "accepted"` };
  }

  // Check if Dimona already exists for this shift
  const { data: existing } = await supabase
    .from('dimona_declarations')
    .select('id, status, dimona_period_id')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN')
    .in('status', ['sent', 'ok'])
    .maybeSingle();

  if (existing) {
    return { success: false, error: `Dimona-In already exists for this shift (status: ${existing.status})` };
  }

  // Create dimona record as "pending"
  const { data: dimonaRecord, error: insertErr } = await supabase
    .from('dimona_declarations')
    .insert({
      shift_id: shiftId,
      worker_id: shift.worker_id,
      location_id: shift.location_id,
      declaration_type: 'IN',
      worker_type: 'FLX',
      joint_committee: '302',
      employer_noss: process.env.DIMONA_ENTERPRISE_NUMBER || '1009237290',
      worker_niss: shift.flexi_workers.niss.replace(/[\.\-\s]/g, ''),
      planned_start: `${shift.date}T${shift.start_time}`,
      planned_end: `${shift.date}T${shift.end_time}`,
      status: 'pending',
      sent_method: 'api',
    })
    .select()
    .single();

  if (insertErr || !dimonaRecord) {
    return { success: false, error: `Failed to create dimona record: ${insertErr?.message}` };
  }

  // Send to ONSS API
  const result = await sendDimonaIn(
    shift.flexi_workers.niss,
    shift.date,
    shift.start_time,
    shift.end_time,
  );

  // Update dimona record with result
  const updateData: Record<string, any> = {
    sent_at: new Date().toISOString(),
    onss_response: result,
  };

  if (result.success) {
    updateData.status = result.result === 'A' ? 'ok' : 'ok'; // 'W' is also OK
    updateData.dimona_period_id = result.periodId?.toString();
    updateData.responded_at = new Date().toISOString();

    if (result.anomalies?.length) {
      updateData.notes = `Warnings: ${result.anomalies.map(a => a.descriptionFr).join('; ')}`;
    }
  } else {
    updateData.status = result.result === 'B' ? 'nok' : 'error';
    updateData.notes = result.error || result.anomalies?.map(a => a.descriptionFr).join('; ');
  }

  await supabase
    .from('dimona_declarations')
    .update(updateData)
    .eq('id', dimonaRecord.id);

  return result;
}


// ============================================================
// 2. DIMONA-CANCEL : Annuler une Dimona
//    Cas 1: Le worker annule le shift avant la prestation
//    Cas 2: Le worker ne se présente pas (no-show)
// ============================================================

export async function cancelDimona(
  shiftId: string,
  reason: 'worker_cancelled' | 'no_show' | 'manager_cancelled'
): Promise<DimonaResult> {
  // Find the accepted Dimona-In for this shift
  const { data: dimonaIn, error } = await supabase
    .from('dimona_declarations')
    .select('id, dimona_period_id, status')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN')
    .in('status', ['ok'])
    .maybeSingle();

  if (error || !dimonaIn) {
    return { success: false, error: 'No accepted Dimona-In found for this shift' };
  }

  if (!dimonaIn.dimona_period_id) {
    return { success: false, error: 'Dimona-In has no periodId - cannot cancel' };
  }

  const periodId = parseInt(dimonaIn.dimona_period_id);

  // Fetch shift info for the record
  const { data: shift } = await supabase
    .from('shifts')
    .select('worker_id, location_id, date, start_time, end_time')
    .eq('id', shiftId)
    .single();

  // Create cancel record
  const { data: cancelRecord } = await supabase
    .from('dimona_declarations')
    .insert({
      shift_id: shiftId,
      worker_id: shift?.worker_id,
      location_id: shift?.location_id,
      declaration_type: 'CANCEL',
      worker_type: 'FLX',
      joint_committee: '302',
      employer_noss: process.env.DIMONA_ENTERPRISE_NUMBER || '1009237290',
      worker_niss: '', // Not needed for cancel
      planned_start: shift ? `${shift.date}T${shift.start_time}` : new Date().toISOString(),
      planned_end: shift ? `${shift.date}T${shift.end_time}` : new Date().toISOString(),
      status: 'pending',
      sent_method: 'api',
      notes: `Reason: ${reason}`,
    })
    .select()
    .single();

  // Send cancel to ONSS
  const result = await sendDimonaCancel(periodId);

  // Update cancel record
  const updateData: Record<string, any> = {
    sent_at: new Date().toISOString(),
    onss_response: result,
    responded_at: new Date().toISOString(),
  };

  if (result.success) {
    updateData.status = 'ok';
    // Also update the original Dimona-In status
    await supabase
      .from('dimona_declarations')
      .update({ status: 'cancelled', notes: `Cancelled: ${reason}` })
      .eq('id', dimonaIn.id);
  } else {
    updateData.status = result.result === 'B' ? 'nok' : 'error';
    updateData.notes = `Cancel failed: ${result.error || result.anomalies?.map(a => a.descriptionFr).join('; ')}`;
  }

  if (cancelRecord) {
    await supabase
      .from('dimona_declarations')
      .update(updateData)
      .eq('id', cancelRecord.id);
  }

  // Update shift status
  if (result.success) {
    await supabase
      .from('shifts')
      .update({ status: 'cancelled', notes: `Dimona cancelled: ${reason}` })
      .eq('id', shiftId);
  }

  return result;
}


// ============================================================
// 3. DIMONA-UPDATE : Modifier les horaires
//    Ex: le worker reste plus longtemps ou part plus tôt
// ============================================================

export async function updateDimona(
  shiftId: string,
  newStartTime: string,
  newEndTime: string,
): Promise<DimonaResult> {
  // Find the accepted Dimona-In for this shift
  const { data: dimonaIn, error } = await supabase
    .from('dimona_declarations')
    .select('id, dimona_period_id')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN')
    .eq('status', 'ok')
    .maybeSingle();

  if (error || !dimonaIn?.dimona_period_id) {
    return { success: false, error: 'No accepted Dimona-In with periodId found for this shift' };
  }

  const periodId = parseInt(dimonaIn.dimona_period_id);

  // Fetch shift date
  const { data: shift } = await supabase
    .from('shifts')
    .select('date, worker_id, location_id')
    .eq('id', shiftId)
    .single();

  if (!shift) {
    return { success: false, error: 'Shift not found' };
  }

  // Create update record
  const { data: updateRecord } = await supabase
    .from('dimona_declarations')
    .insert({
      shift_id: shiftId,
      worker_id: shift.worker_id,
      location_id: shift.location_id,
      declaration_type: 'UPDATE',
      worker_type: 'FLX',
      joint_committee: '302',
      employer_noss: process.env.DIMONA_ENTERPRISE_NUMBER || '1009237290',
      worker_niss: '',
      planned_start: `${shift.date}T${newStartTime}`,
      planned_end: `${shift.date}T${newEndTime}`,
      status: 'pending',
      sent_method: 'api',
      notes: `Update hours: ${newStartTime}-${newEndTime}`,
    })
    .select()
    .single();

  // Send update to ONSS
  const result = await sendDimonaUpdate(periodId, shift.date, newStartTime, newEndTime);

  // Update record
  if (updateRecord) {
    await supabase
      .from('dimona_declarations')
      .update({
        sent_at: new Date().toISOString(),
        onss_response: result,
        responded_at: new Date().toISOString(),
        status: result.success ? 'ok' : (result.result === 'B' ? 'nok' : 'error'),
      })
      .eq('id', updateRecord.id);
  }

  return result;
}


// ============================================================
// 4. WORKFLOW AUTOMATIQUE : Envoyer les Dimona pour demain
//    À appeler via cron (Vercel Cron) chaque soir à 20h
// ============================================================

export async function sendDimonaForTomorrow(): Promise<{
  sent: number;
  failed: number;
  results: Array<{ shiftId: string; workerName: string; result: DimonaResult }>;
}> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Find accepted shifts for tomorrow without a Dimona-In OK
  const { data: shifts } = await supabase
    .from('shifts')
    .select(`
      id, date, start_time, end_time, worker_id,
      flexi_workers!inner(first_name, last_name, niss)
    `)
    .eq('date', tomorrowStr)
    .eq('status', 'accepted');

  if (!shifts?.length) {
    return { sent: 0, failed: 0, results: [] };
  }

  // Filter out shifts that already have an accepted Dimona
  const shiftIds = shifts.map(s => s.id);
  const { data: existingDimonas } = await supabase
    .from('dimona_declarations')
    .select('shift_id')
    .in('shift_id', shiftIds)
    .eq('declaration_type', 'IN')
    .in('status', ['ok', 'sent', 'pending']);

  const alreadyDeclared = new Set(existingDimonas?.map(d => d.shift_id) || []);
  const toDeclare = shifts.filter(s => !alreadyDeclared.has(s.id));

  const results: Array<{ shiftId: string; workerName: string; result: DimonaResult }> = [];
  let sent = 0;
  let failed = 0;

  for (const shift of toDeclare) {
    const workerName = `${shift.flexi_workers?.first_name} ${shift.flexi_workers?.last_name}`;
    const result = await declareDimonaIn(shift.id);

    results.push({ shiftId: shift.id, workerName, result });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }

    // Small delay between declarations to not hammer the API
    await new Promise(r => setTimeout(r, 500));
  }

  return { sent, failed, results };
}


// ============================================================
// 5. HANDLE NO-SHOW : Détection et annulation automatique
//    À appeler quand un worker ne pointe pas dans les 30 min
// ============================================================

export async function handleNoShow(shiftId: string): Promise<DimonaResult> {
  // Mark shift as no-show
  await supabase
    .from('shifts')
    .update({ notes: 'No-show - worker did not clock in' })
    .eq('id', shiftId);

  // Cancel the Dimona
  return cancelDimona(shiftId, 'no_show');
}


// ============================================================
// 6. CHECK DIMONA STATUS : Vérifier le statut d'une déclaration
// ============================================================

export async function checkDimonaStatus(shiftId: string): Promise<{
  hasDimona: boolean;
  status: string;
  periodId?: string;
  canCancel: boolean;
  canUpdate: boolean;
}> {
  const { data } = await supabase
    .from('dimona_declarations')
    .select('*')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { hasDimona: false, status: 'none', canCancel: false, canUpdate: false };
  }

  // Check if there's been a cancel after
  const { data: cancelData } = await supabase
    .from('dimona_declarations')
    .select('status')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'CANCEL')
    .eq('status', 'ok')
    .maybeSingle();

  const isCancelled = !!cancelData;

  return {
    hasDimona: true,
    status: isCancelled ? 'cancelled' : data.status,
    periodId: data.dimona_period_id,
    canCancel: data.status === 'ok' && !isCancelled,
    canUpdate: data.status === 'ok' && !isCancelled,
  };
}
