// src/lib/dimona/actions.ts
'use server';

import { createClient } from '@supabase/supabase-js';
import { sendDimonaIn, sendDimonaCancel, sendDimonaUpdate } from './service';
import type { DimonaResult } from './types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ============================================================
// 1. DIMONA-IN
// ============================================================
export async function declareDimonaIn(shiftId: string): Promise<DimonaResult> {
  const { data: shift, error: shiftErr } = await supabase
    .from('shifts')
    .select(`
      id, date, start_time, end_time, location_id, worker_id, status,
      flexi_workers!inner(id, niss, first_name, last_name, status),
      locations!inner(id, name)
    `)
    .eq('id', shiftId)
    .single();

  if (shiftErr || !shift) return { success: false, error: `Shift not found: ${shiftErr?.message}` };
  if (!shift.flexi_workers?.niss) return { success: false, error: `Worker ${shift.flexi_workers?.first_name} ${shift.flexi_workers?.last_name} has no NISS` };
  if (shift.status !== 'accepted') return { success: false, error: `Shift status is "${shift.status}", expected "accepted"` };

  // ✅ Fix: vérifier TOUS les statuts existants, pas seulement sent/ok
  const { data: existing } = await supabase
    .from('dimona_declarations')
    .select('id, status, dimona_period_id')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Si déjà OK ou envoyée → ne pas réenvoyer
  if (existing && ['ok', 'sent'].includes(existing.status)) {
    return { success: false, error: `Dimona-In already exists for this shift (status: ${existing.status})` };
  }

  const workerType: 'FLX' | 'STU' = shift.flexi_workers.status === 'student' ? 'STU' : 'FLX';

  // Réutiliser le record existant (nok/error) ou en créer un nouveau
  let dimonaId: string;
  if (existing && ['nok', 'error', 'pending'].includes(existing.status)) {
    dimonaId = existing.id;
    await supabase.from('dimona_declarations').update({ status: 'pending', sent_at: null, notes: 'Retry' }).eq('id', dimonaId);
  } else {
    const { data: newRecord, error: insertErr } = await supabase
      .from('dimona_declarations')
      .insert({
        shift_id: shiftId,
        worker_id: shift.worker_id,
        location_id: shift.location_id,
        declaration_type: 'IN',
        worker_type: workerType,
        joint_committee: workerType === 'FLX' ? 'XXX' : '',
        employer_noss: process.env.DIMONA_ENTERPRISE_NUMBER || '1009237290',
        worker_niss: shift.flexi_workers.niss.replace(/[\.\-\s]/g, ''),
        planned_start: `${shift.date}T${shift.start_time}`,
        planned_end: `${shift.date}T${shift.end_time}`,
        status: 'pending',
        sent_method: 'api',
      })
      .select()
      .single();
    if (insertErr || !newRecord) return { success: false, error: `Failed to create dimona record: ${insertErr?.message}` };
    dimonaId = newRecord.id;
  }

  // Send to ONSS
  const result = await sendDimonaIn(
    shift.flexi_workers.niss,
    shift.date,
    shift.start_time,
    shift.end_time,
    workerType,
  );

  const updateData: Record<string, any> = {
    sent_at: new Date().toISOString(),
    onss_response: result,
    worker_type: workerType,
  };

  if (result.success) {
    updateData.status = 'ok';
    updateData.dimona_period_id = result.periodId?.toString();
    updateData.responded_at = new Date().toISOString();
    if (result.anomalies?.length) {
      updateData.notes = `Warnings: ${result.anomalies.map((a: any) => a.descriptionFr).join('; ')}`;
    }
  } else {
    updateData.status = result.result === 'B' ? 'nok' : 'error';
    updateData.notes = result.error || result.anomalies?.map((a: any) => a.descriptionFr).join('; ');
  }

  await supabase.from('dimona_declarations').update(updateData).eq('id', dimonaId);
  return result;
}

// ============================================================
// 2. DIMONA-CANCEL
// ============================================================
export async function cancelDimona(
  shiftId: string,
  reason: 'worker_cancelled' | 'no_show' | 'manager_cancelled'
): Promise<DimonaResult> {
  const { data: dimonaIn, error } = await supabase
    .from('dimona_declarations')
    .select('id, dimona_period_id, status, worker_type')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN')
    .eq('status', 'ok')
    .maybeSingle();

  if (error || !dimonaIn) return { success: false, error: 'No accepted Dimona-In found for this shift' };
  if (!dimonaIn.dimona_period_id) return { success: false, error: 'Dimona-In has no periodId - cannot cancel' };

  const periodId = parseInt(dimonaIn.dimona_period_id);

  const { data: shift } = await supabase
    .from('shifts')
    .select('worker_id, location_id, date, start_time, end_time, flexi_workers!inner(status)')
    .eq('id', shiftId)
    .single();

  // ✅ Fix: utiliser le worker_type du shift, pas hardcoder FLX
  const workerType = (shift?.flexi_workers as any)?.status === 'student' ? 'STU' : 'FLX';

  const { data: cancelRecord } = await supabase
    .from('dimona_declarations')
    .insert({
      shift_id: shiftId,
      worker_id: shift?.worker_id,
      location_id: shift?.location_id,
      declaration_type: 'CANCEL',
      worker_type: workerType,
      joint_committee: workerType === 'FLX' ? 'XXX' : '',
      employer_noss: process.env.DIMONA_ENTERPRISE_NUMBER || '1009237290',
      worker_niss: '',
      planned_start: shift ? `${shift.date}T${shift.start_time}` : new Date().toISOString(),
      planned_end: shift ? `${shift.date}T${shift.end_time}` : new Date().toISOString(),
      status: 'pending',
      sent_method: 'api',
      notes: `Reason: ${reason}`,
    })
    .select()
    .single();

  const result = await sendDimonaCancel(periodId);

  const updateData: Record<string, any> = {
    sent_at: new Date().toISOString(),
    onss_response: result,
    responded_at: new Date().toISOString(),
  };

  if (result.success) {
    updateData.status = 'ok';
    await supabase.from('dimona_declarations').update({ status: 'cancelled', notes: `Cancelled: ${reason}` }).eq('id', dimonaIn.id);
    await supabase.from('shifts').update({ status: 'cancelled', notes: `Dimona cancelled: ${reason}` }).eq('id', shiftId);
  } else {
    updateData.status = result.result === 'B' ? 'nok' : 'error';
    updateData.notes = `Cancel failed: ${result.error || result.anomalies?.map((a: any) => a.descriptionFr).join('; ')}`;
  }

  if (cancelRecord) {
    await supabase.from('dimona_declarations').update(updateData).eq('id', cancelRecord.id);
  }

  return result;
}

// ============================================================
// 3. DIMONA-UPDATE
// ============================================================
export async function updateDimona(shiftId: string, newStartTime: string, newEndTime: string): Promise<DimonaResult> {
  const { data: dimonaIn } = await supabase
    .from('dimona_declarations')
    .select('id, dimona_period_id')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN')
    .eq('status', 'ok')
    .maybeSingle();

  if (!dimonaIn?.dimona_period_id) return { success: false, error: 'No accepted Dimona-In with periodId found for this shift' };

  const periodId = parseInt(dimonaIn.dimona_period_id);

  const { data: shift } = await supabase
    .from('shifts')
    .select('date, worker_id, location_id, flexi_workers!inner(status)')
    .eq('id', shiftId)
    .single();

  if (!shift) return { success: false, error: 'Shift not found' };

  // ✅ Fix: worker_type correct
  const workerType = (shift.flexi_workers as any)?.status === 'student' ? 'STU' : 'FLX';

  const { data: updateRecord } = await supabase
    .from('dimona_declarations')
    .insert({
      shift_id: shiftId,
      worker_id: shift.worker_id,
      location_id: shift.location_id,
      declaration_type: 'UPDATE',
      worker_type: workerType,
      joint_committee: workerType === 'FLX' ? 'XXX' : '',
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

  const result = await sendDimonaUpdate(periodId, shift.date, newStartTime, newEndTime);

  if (updateRecord) {
    await supabase.from('dimona_declarations').update({
      sent_at: new Date().toISOString(),
      onss_response: result,
      responded_at: new Date().toISOString(),
      status: result.success ? 'ok' : (result.result === 'B' ? 'nok' : 'error'),
    }).eq('id', updateRecord.id);
  }

  return result;
}

// ============================================================
// 4. CRON : Dimona pour demain
// ============================================================
export async function sendDimonaForTomorrow(): Promise<{
  sent: number; failed: number;
  results: Array<{ shiftId: string; workerName: string; result: DimonaResult }>;
}> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { data: shifts } = await supabase
    .from('shifts')
    .select(`id, date, start_time, end_time, worker_id, flexi_workers!inner(first_name, last_name, niss)`)
    .eq('date', tomorrowStr)
    .eq('status', 'accepted');

  if (!shifts?.length) return { sent: 0, failed: 0, results: [] };

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
  let sent = 0, failed = 0;

  for (const shift of toDeclare) {
    const workerName = `${(shift.flexi_workers as any)?.first_name} ${(shift.flexi_workers as any)?.last_name}`;
    const result = await declareDimonaIn(shift.id);
    results.push({ shiftId: shift.id, workerName, result });
    result.success ? sent++ : failed++;
    await new Promise(r => setTimeout(r, 500));
  }

  return { sent, failed, results };
}

// ============================================================
// 5. NO-SHOW
// ============================================================
export async function handleNoShow(shiftId: string): Promise<DimonaResult> {
  await supabase.from('shifts').update({ notes: 'No-show - worker did not clock in' }).eq('id', shiftId);
  return cancelDimona(shiftId, 'no_show');
}

// ============================================================
// 6. CHECK STATUS
// ============================================================
export async function checkDimonaStatus(shiftId: string): Promise<{
  hasDimona: boolean; status: string; periodId?: string; canCancel: boolean; canUpdate: boolean;
}> {
  const { data } = await supabase
    .from('dimona_declarations')
    .select('*')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { hasDimona: false, status: 'none', canCancel: false, canUpdate: false };

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
