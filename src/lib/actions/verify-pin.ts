'use server';

import { createAdminClient } from '@/lib/supabase/server';

const MAX_PIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 5;

/**
 * Verify a worker's PIN with rate limiting.
 * - Blocks after MAX_PIN_ATTEMPTS failed attempts for LOCK_DURATION_MINUTES
 * - Resets counter on success
 * - Returns the worker data (without pin_code) on success, or an error message
 */
export async function verifyPin(
  workerId: string,
  pin: string
): Promise<{ 
  success: true; 
  worker: { id: string; first_name: string; last_name: string }; 
} | { 
  success: false; 
  error: string;
  locked?: boolean;
}> {
  const admin = createAdminClient();

  // Fetch worker with security fields
  const { data: worker } = await admin
    .from('flexi_workers')
    .select('id, first_name, last_name, pin_code, pin_attempts, pin_locked_until, is_active')
    .eq('id', workerId)
    .single();

  if (!worker) return { success: false, error: 'Travailleur introuvable' };
  if (!worker.is_active) return { success: false, error: 'Compte désactivé' };
  if (!worker.pin_code) return { success: false, error: 'Aucun PIN configuré. Configurez votre PIN dans votre profil.' };

  // Check if locked
  if (worker.pin_locked_until) {
    const lockExpiry = new Date(worker.pin_locked_until);
    if (lockExpiry > new Date()) {
      const remainingMin = Math.ceil((lockExpiry.getTime() - Date.now()) / 60000);
      return { 
        success: false, 
        error: `Trop de tentatives. Réessayez dans ${remainingMin} minute${remainingMin > 1 ? 's' : ''}.`,
        locked: true,
      };
    }
    // Lock expired — reset
    await admin
      .from('flexi_workers')
      .update({ pin_attempts: 0, pin_locked_until: null })
      .eq('id', workerId);
  }

  // Verify PIN
  if (worker.pin_code !== pin) {
    const newAttempts = (worker.pin_attempts || 0) + 1;
    const updates: any = { pin_attempts: newAttempts };

    // Lock if too many attempts
    if (newAttempts >= MAX_PIN_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
      updates.pin_locked_until = lockUntil.toISOString();
    }

    await admin
      .from('flexi_workers')
      .update(updates)
      .eq('id', workerId);

    const remaining = MAX_PIN_ATTEMPTS - newAttempts;
    if (remaining <= 0) {
      return { 
        success: false, 
        error: `PIN incorrect. Compte bloqué pour ${LOCK_DURATION_MINUTES} minutes.`,
        locked: true,
      };
    }

    return { 
      success: false, 
      error: remaining <= 2 
        ? `PIN incorrect. ${remaining} tentative${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`
        : 'PIN incorrect',
    };
  }

  // Success — reset attempts
  if (worker.pin_attempts > 0) {
    await admin
      .from('flexi_workers')
      .update({ pin_attempts: 0, pin_locked_until: null })
      .eq('id', workerId);
  }

  return {
    success: true,
    worker: {
      id: worker.id,
      first_name: worker.first_name,
      last_name: worker.last_name,
    },
  };
}
