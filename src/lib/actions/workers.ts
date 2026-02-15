'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { CreateWorkerInput, UpdateProfileInput } from '@/types';

/**
 * Create a new flexi worker (manager action)
 * Creates both the Supabase Auth account and the worker record
 */
export async function createWorker(input: CreateWorkerInput) {
  const supabase = createClient();
  const admin = createAdminClient();

  // Verify caller is manager
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') {
    return { error: 'Non autorisé' };
  }

  // Generate temporary password
  const tempPassword = generateTempPassword();

  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { role: 'flexi' },
  });

  if (authError) {
    return { error: `Erreur création compte : ${authError.message}` };
  }

  // Create worker record
  const { data: workerData, error: workerError } = await supabase
    .from('flexi_workers')
    .insert({
      user_id: authData.user.id,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      hourly_rate: input.hourly_rate ?? 12.53,
      status: input.status ?? 'student',
    })
    .select()
    .single();

  if (workerError) {
    // Cleanup: delete auth user if worker creation fails
    await admin.auth.admin.deleteUser(authData.user.id);
    return { error: `Erreur création worker : ${workerError.message}` };
  }

  revalidatePath('/dashboard/flexis/workers');

  return {
    data: workerData,
    tempPassword,
    message: `Compte créé pour ${input.first_name} ${input.last_name}. Mot de passe temporaire : ${tempPassword}`,
  };
}

/**
 * Update flexi worker profile (flexi self-service)
 */
export async function updateProfile(input: UpdateProfileInput) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  const { data, error } = await supabase
    .from('flexi_workers')
    .update(input)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/flexi/account');
  return { data };
}

/**
 * Toggle worker active status (manager action)
 */
export async function toggleWorkerActive(workerId: string, active: boolean) {
  const supabase = createClient();

  const { error } = await supabase
    .from('flexi_workers')
    .update({ is_active: active })
    .eq('id', workerId);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/workers');
  return { success: true };
}

/**
 * Delete a worker completely (manager action)
 * Removes the worker record and the auth account
 */
export async function deleteWorker(workerId: string) {
  const supabase = createClient();
  const admin = createAdminClient();

  // Verify caller is manager
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') {
    return { error: 'Non autorisé' };
  }

  // Get worker's auth user_id
  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('user_id, first_name, last_name')
    .eq('id', workerId)
    .single();

  if (!worker) return { error: 'Worker introuvable' };

  // Delete worker record first (cascades to availabilities)
  const { error: deleteError } = await supabase
    .from('flexi_workers')
    .delete()
    .eq('id', workerId);

  if (deleteError) return { error: `Erreur suppression : ${deleteError.message}` };

  // Delete auth user
  if (worker.user_id) {
    await admin.auth.admin.deleteUser(worker.user_id);
  }

  revalidatePath('/dashboard/flexis/workers');
  return { success: true };
}

/**
 * Reset a worker's password (manager action)
 * Returns a new temporary password
 */
export async function resetWorkerPassword(workerId: string) {
  const supabase = createClient();
  const admin = createAdminClient();

  // Verify caller is manager
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') {
    return { error: 'Non autorisé' };
  }

  // Get worker's auth user_id
  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('user_id, first_name, last_name')
    .eq('id', workerId)
    .single();

  if (!worker?.user_id) return { error: 'Worker introuvable' };

  const newPassword = generateTempPassword();

  const { error } = await admin.auth.admin.updateUserById(worker.user_id, {
    password: newPassword,
  });

  if (error) return { error: `Erreur reset : ${error.message}` };

  return {
    newPassword,
    message: `Mot de passe réinitialisé pour ${(worker as any).first_name} ${(worker as any).last_name}`,
  };
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
