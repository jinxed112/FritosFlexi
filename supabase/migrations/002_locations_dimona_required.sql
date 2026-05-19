-- ============================================================
-- Migration: locations.dimona_required + MDjambo Événements
-- Date: 2026-05-19
-- ============================================================
-- Contexte : permet de désactiver la déclaration Dimona auto pour
-- certaines locations (stands événementiels, food trucks ponctuels,
-- ducasses, etc.). La gestion administrative passe alors par
-- Emilie/Partena en mode manuel hors flux FritosFlexi.
-- ============================================================

-- 1. Ajouter la colonne dimona_required (par défaut true = comportement actuel)
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS dimona_required BOOLEAN NOT NULL DEFAULT true;

-- 2. Index utile pour le cron sendDimonaForTomorrow (filtre WHERE dimona_required=true)
CREATE INDEX IF NOT EXISTS idx_locations_dimona_required
  ON locations (dimona_required)
  WHERE dimona_required = false;
-- Index partiel : on optimise la recherche des locations exceptionnelles (peu nombreuses)

-- 3. Créer la location "MDjambo Événements" (cohérent avec establishments.id ...0003 côté FritOS main)
-- ATTENTION : adapter le UUID si nécessaire pour matcher le pattern Flexi.
-- Si pas de FK avec establishments, garder une location autonome.
INSERT INTO locations (
  id,
  name,
  address,
  city,
  postal_code,
  is_active,
  dimona_required,
  created_at
) VALUES (
  gen_random_uuid(),
  'MDjambo Événements',
  'Stand mobile (adresse variable selon event)',
  'Mons',
  '7000',
  true,
  false,  -- ← clé : pas de Dimona auto sur les missions de cette location
  NOW()
)
ON CONFLICT DO NOTHING;

-- 4. Smoke test : vérifier que la migration a bien appliqué
-- SELECT id, name, dimona_required FROM locations ORDER BY created_at;
-- → 'MDjambo Événements' doit apparaître avec dimona_required=false
-- → toutes les autres locations (Boussu, Jurbise) doivent avoir dimona_required=true (default)
