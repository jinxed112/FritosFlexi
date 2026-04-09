'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================================
// Manager: Get all uploads history
// ============================================================
export async function getPayslipUploads() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') {
    return { error: 'Non autorisé', data: [] };
  }

  const { data, error } = await supabase
    .from('payslip_uploads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data: data || [] };
}

// ============================================================
// Manager: Get payslips for a period (with worker info)
// ============================================================
export async function getPayslipsForPeriod(periodStart: string, periodEnd: string) {
  const admin = createAdminClient();
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') {
    return { error: 'Non autorisé', data: [] };
  }

  const { data, error } = await admin
    .from('payslips')
    .select(`
      id, worker_id, period_start, period_end, file_path,
      gross_salary, net_salary, employer_onss, hours_worked,
      establishment, viewed_at, created_at,
      flexi_workers!inner(first_name, last_name, niss, status)
    `)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .order('created_at', { ascending: true });

  if (error) return { error: error.message, data: [] };
  return { data: data || [] };
}

// ============================================================
// Manager: Delete an upload and all associated payslips + files
// ============================================================
export async function deletePayslipUpload(uploadId: string) {
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') {
    return { error: 'Non autorisé' };
  }

  // Get all payslips for this upload
  const { data: payslips } = await admin
    .from('payslips')
    .select('id, file_path')
    .eq('upload_id', uploadId);

  // Delete files from storage
  if (payslips && payslips.length > 0) {
    const paths = payslips.map(p => p.file_path);
    await admin.storage.from('payslips').remove(paths);
  }

  // Delete payslip records
  await admin.from('payslips').delete().eq('upload_id', uploadId);

  // Delete upload record
  const { error } = await admin.from('payslip_uploads').delete().eq('id', uploadId);
  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/payslips');
  return { success: true };
}

// ============================================================
// Worker: Get own payslips
// ============================================================
export async function getMyPayslips() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté', data: [] };

  // Get worker ID
  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!worker) return { error: 'Profil introuvable', data: [] };

  const { data, error } = await supabase
    .from('payslips')
    .select('id, period_start, period_end, net_salary, gross_salary, hours_worked, establishment, viewed_at, created_at')
    .eq('worker_id', worker.id)
    .order('period_start', { ascending: false });

  if (error) return { error: error.message, data: [] };
  return { data: data || [] };
}

// ============================================================
// Worker: Mark payslip as viewed
// ============================================================
export async function markPayslipViewed(payslipId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  // RLS ensures only own payslips can be updated
  await supabase
    .from('payslips')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', payslipId)
    .is('viewed_at', null);

  return { success: true };
}
