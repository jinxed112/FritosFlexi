'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { CreateShiftInput } from '@/types';
import { apiCancelDimona } from './dimona';

/**
 * SECURITY: vérifie que l'utilisateur courant est un manager.
 * À utiliser en tête des Server Actions de mutation côté admin
 * (cancelShift, updateShift, deleteShift) — sans ça, n'importe quel worker
 * authentifié pouvait techniquement les appeler et muter des shifts
 * (planning d'autres workers, déclenchement cancel Dimona ONSS, etc.).
 *
 * Pattern aligné avec contract.ts:859-860 qui fait déjà cette vérif.
 */
async function assertManager() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };
  // Pattern défensif : check role ou fallback email admin (cf. api/dimona/route.ts:29
  // qui utilise le même fallback). Évite de bloquer Michele si user_metadata vide.
  const isManager = user.user_metadata?.role === 'manager' || user.email === 'admin@mdjambo.be';
  if (!isManager) return { error: 'Accès refusé : action réservée aux managers' };
  return null;
}

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
  status?: string;
}) {
  const authError = await assertManager();
  if (authError) return authError;

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
 *
 * Bloque le delete si une Dimona déclarée OK existe pour préserver la cohérence
 * avec ONSS (on ne peut pas supprimer en silence un shift dont l'ONSS a accepté
 * l'IN — il faut d'abord cancel). L'utilisateur doit passer par cancelShift().
 */
export async function deleteShift(shiftId: string) {
  const authError = await assertManager();
  if (authError) return authError;

  const supabase = createClient();

  const { data: dimonaOk } = await supabase
    .from('dimona_declarations')
    .select('id')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN')
    .eq('status', 'ok')
    .not('dimona_period_id', 'is', null)
    .maybeSingle();

  if (dimonaOk) {
    return {
      error: 'Impossible de supprimer ce shift : une Dimona a déjà été déclarée à l\'ONSS. Utilise "Annuler" pour annuler la Dimona côté ONSS d\'abord.',
    };
  }

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
 * Cancel a shift (manager action) — cascade automatique sur Dimona
 *
 * Comportement selon l'état des `dimona_declarations` liées :
 * - Dimona `ok` avec periodId : POST CANCEL ONSS via `apiCancelDimona`
 *   (qui met aussi `shifts.status='cancelled'` en cas de succès)
 * - Dimona `pending`/`ready`/`sent` sans periodId (pas encore acceptée ONSS) :
 *   soft-cancel en DB → empêche le batch declaration de la POST plus tard
 * - Pas de Dimona : juste update `shifts.status='cancelled'`
 *
 * Si une cancel ONSS échoue, le shift n'est PAS marqué cancelled (préserve
 * la cohérence ONSS ↔ DB). Le manager est notifié + doit régulariser via
 * portail ONSS avant de réessayer.
 */
export async function cancelShift(
  shiftId: string,
  reason: 'worker_cancelled' | 'no_show' | 'manager_cancelled' = 'worker_cancelled',
) {
  const authError = await assertManager();
  if (authError) return authError;

  const supabase = createClient();

  const { data: dimonas } = await supabase
    .from('dimona_declarations')
    .select('id, status, dimona_period_id')
    .eq('shift_id', shiftId)
    .eq('declaration_type', 'IN');

  let dimonaCancelledOnss = false;
  let dimonaPendingCleared = 0;

  for (const dimona of dimonas || []) {
    if (dimona.status === 'ok' && dimona.dimona_period_id) {
      // Dimona déclarée à l'ONSS → cancel API
      const cancelResult = await apiCancelDimona(dimona.id, reason);
      if (!cancelResult.success) {
        return {
          error: `Annulation Dimona ONSS échouée : ${cancelResult.error}. Shift NON annulé pour préserver la cohérence ONSS. Régularise via le portail ONSS puis réessaie.`,
        };
      }
      dimonaCancelledOnss = true;
      // apiCancelDimona met déjà shifts.status='cancelled' en cas de succès
    } else if (['pending', 'ready', 'sent'].includes(dimona.status)) {
      // Dimona pas encore acceptée par l'ONSS → soft-cancel en DB
      // (le batch declaration ne la POSTera pas si status='cancelled')
      await supabase
        .from('dimona_declarations')
        .update({
          status: 'cancelled',
          notes: `Pré-annulée (shift annulé avant déclaration ONSS) : ${reason}`,
        })
        .eq('id', dimona.id);
      dimonaPendingCleared++;
    }
  }

  // Si apiCancelDimona n'a pas mis le shift à 'cancelled', on le fait nous-mêmes
  if (!dimonaCancelledOnss) {
    const { error } = await supabase
      .from('shifts')
      .update({ status: 'cancelled' })
      .eq('id', shiftId);

    if (error) return { error: error.message };
  }

  revalidatePath('/dashboard/flexis/planning');
  revalidatePath('/dashboard/flexis/dimona');
  revalidatePath('/flexi/missions');
  revalidatePath('/flexi/planning');

  return {
    success: true,
    dimonaCancelledOnss,
    dimonaPendingCleared,
  };
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