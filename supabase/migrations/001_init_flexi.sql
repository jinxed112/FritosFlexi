-- ============================================================
-- FritOS Module Flexi — Migration Supabase Complète
-- Projet: krjqrdqawkjjvvtoydxb.supabase.co
-- CP 302 Horeca — Belgique
-- ============================================================

-- 0. Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. TABLES
-- ============================================================

-- 1.1 Locations (friteries)
CREATE TABLE locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  geo_radius_meters INTEGER DEFAULT 100,
  qr_code_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Flexi Workers
CREATE TABLE flexi_workers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  niss TEXT,
  address_street TEXT,
  address_city TEXT,
  address_zip TEXT,
  address_country TEXT DEFAULT 'BE',
  phone TEXT,
  email TEXT NOT NULL,
  iban TEXT,
  status TEXT DEFAULT 'student' CHECK (status IN ('student', 'pensioner', 'employee', 'other')),
  hourly_rate DECIMAL(5,2) DEFAULT 12.53,
  ytd_earnings DECIMAL(10,2) DEFAULT 0,
  id_card_url TEXT,
  framework_contract_date DATE,
  profile_complete BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flexi_workers_niss ON flexi_workers(niss);
CREATE INDEX idx_flexi_workers_user_id ON flexi_workers(user_id);
CREATE INDEX idx_flexi_workers_email ON flexi_workers(email);

-- 1.3 Disponibilités
CREATE TABLE flexi_availabilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES flexi_workers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('full_day', 'midi', 'soir')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(worker_id, date, type)
);

CREATE INDEX idx_flexi_availabilities_date ON flexi_availabilities(date);
CREATE INDEX idx_flexi_availabilities_worker ON flexi_availabilities(worker_id);

-- 1.4 Shifts
CREATE TABLE shifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES locations(id),
  worker_id UUID REFERENCES flexi_workers(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  role TEXT DEFAULT 'polyvalent' CHECK (role IN ('cuisine', 'caisse', 'polyvalent')),
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'proposed', 'accepted', 'refused', 'completed', 'cancelled'
  )),
  notes TEXT,
  estimated_cost DECIMAL(8,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shifts_date ON shifts(date);
CREATE INDEX idx_shifts_worker ON shifts(worker_id);
CREATE INDEX idx_shifts_location ON shifts(location_id);
CREATE INDEX idx_shifts_status ON shifts(status);

-- 1.5 Time Entries (pointages)
CREATE TABLE time_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES shifts(id),
  worker_id UUID NOT NULL REFERENCES flexi_workers(id),
  clock_in TIMESTAMPTZ,
  clock_out TIMESTAMPTZ,
  geo_lat_in DECIMAL(10,8),
  geo_lng_in DECIMAL(11,8),
  geo_lat_out DECIMAL(10,8),
  geo_lng_out DECIMAL(11,8),
  geo_valid_in BOOLEAN,
  geo_valid_out BOOLEAN,
  actual_hours DECIMAL(5,2),
  validated BOOLEAN DEFAULT false,
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_entries_shift ON time_entries(shift_id);
CREATE INDEX idx_time_entries_worker ON time_entries(worker_id);
CREATE INDEX idx_time_entries_validated ON time_entries(validated);

-- 1.6 Cost Lines
CREATE TABLE cost_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  time_entry_id UUID NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES flexi_workers(id),
  base_hours DECIMAL(5,2) NOT NULL,
  hourly_rate DECIMAL(5,2) NOT NULL,
  base_salary DECIMAL(8,2) NOT NULL,
  sunday_premium DECIMAL(8,2) DEFAULT 0,
  total_salary DECIMAL(8,2) NOT NULL,
  employer_contribution DECIMAL(8,2) NOT NULL,
  total_cost DECIMAL(8,2) NOT NULL,
  is_sunday_or_holiday BOOLEAN DEFAULT false,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_lines_worker ON cost_lines(worker_id);
CREATE INDEX idx_cost_lines_date ON cost_lines(date);

-- 1.7 Dimona Declarations
CREATE TABLE dimona_declarations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES shifts(id),
  worker_id UUID NOT NULL REFERENCES flexi_workers(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  declaration_type TEXT NOT NULL CHECK (declaration_type IN ('IN', 'OUT', 'UPDATE', 'CANCEL')),
  worker_type TEXT DEFAULT 'FLX',
  joint_committee TEXT DEFAULT '302',
  employer_noss TEXT,
  worker_niss TEXT NOT NULL,
  planned_start TIMESTAMPTZ NOT NULL,
  planned_end TIMESTAMPTZ NOT NULL,
  planned_hours DECIMAL(5,2),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'ready', 'sent', 'ok', 'nok', 'error'
  )),
  dimona_period_id TEXT,
  onss_response JSONB,
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  sent_method TEXT CHECK (sent_method IN ('api', 'manual')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dimona_shift ON dimona_declarations(shift_id);
CREATE INDEX idx_dimona_status ON dimona_declarations(status);
CREATE INDEX idx_dimona_worker ON dimona_declarations(worker_id);

-- 1.8 Payroll Exports
CREATE TABLE payroll_exports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_hours DECIMAL(8,2) NOT NULL,
  total_cost DECIMAL(10,2) NOT NULL,
  worker_count INTEGER NOT NULL,
  file_url TEXT,
  file_format TEXT DEFAULT 'csv' CHECK (file_format IN ('csv', 'xlsx')),
  sent_to_partena BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  generated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. FONCTIONS UTILITAIRES
-- ============================================================

-- 2.1 Vérification rôle manager
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'role') = 'manager',
      false
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2 Récupérer le worker_id de l'utilisateur connecté
CREATE OR REPLACE FUNCTION get_current_worker_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM flexi_workers WHERE user_id = auth.uid() LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.3 Calcul distance Haversine (en mètres)
CREATE OR REPLACE FUNCTION haversine_distance(
  lat1 DECIMAL, lng1 DECIMAL,
  lat2 DECIMAL, lng2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  r DECIMAL := 6371000; -- Rayon terre en mètres
  dlat DECIMAL;
  dlng DECIMAL;
  a DECIMAL;
  c DECIMAL;
BEGIN
  dlat := RADIANS(lat2 - lat1);
  dlng := RADIANS(lng2 - lng1);
  a := SIN(dlat/2) * SIN(dlat/2) +
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
       SIN(dlng/2) * SIN(dlng/2);
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  RETURN r * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2.4 Vérifier si une date est un dimanche ou jour férié belge
CREATE OR REPLACE FUNCTION is_sunday_or_belgian_holiday(check_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
  y INTEGER := EXTRACT(YEAR FROM check_date);
  easter DATE;
  a INTEGER; b INTEGER; c INTEGER; d INTEGER; e INTEGER;
  f INTEGER; g INTEGER; h INTEGER; i INTEGER; k INTEGER;
  l INTEGER; m INTEGER; n INTEGER; p INTEGER;
BEGIN
  -- Dimanche
  IF EXTRACT(DOW FROM check_date) = 0 THEN RETURN true; END IF;

  -- Jours fériés fixes belges
  IF (EXTRACT(MONTH FROM check_date), EXTRACT(DAY FROM check_date)) IN (
    (1, 1),   -- Nouvel An
    (5, 1),   -- Fête du travail
    (7, 21),  -- Fête nationale
    (8, 15),  -- Assomption
    (11, 1),  -- Toussaint
    (11, 11), -- Armistice
    (12, 25)  -- Noël
  ) THEN RETURN true; END IF;

  -- Calcul de Pâques (algorithme de Meeus)
  a := y % 19;
  b := y / 100;
  c := y % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  n := (h + l - 7 * m + 114) / 31;
  p := (h + l - 7 * m + 114) % 31 + 1;
  easter := make_date(y, n, p);

  -- Jours fériés mobiles belges
  IF check_date IN (
    easter + 1,   -- Lundi de Pâques
    easter + 39,  -- Ascension
    easter + 50   -- Lundi de Pentecôte
  ) THEN RETURN true; END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2.5 Calcul du coût estimé d'un shift
CREATE OR REPLACE FUNCTION calculate_shift_cost(
  p_start_time TIME,
  p_end_time TIME,
  p_hourly_rate DECIMAL,
  p_date DATE
) RETURNS DECIMAL AS $$
DECLARE
  hours DECIMAL;
  base_salary DECIMAL;
  sunday_premium DECIMAL := 0;
  total_salary DECIMAL;
  employer_contrib DECIMAL;
BEGIN
  hours := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600.0;
  IF hours < 0 THEN hours := hours + 24; END IF; -- Shift passant minuit
  
  base_salary := hours * p_hourly_rate;
  
  IF is_sunday_or_belgian_holiday(p_date) THEN
    sunday_premium := LEAST(hours * 2, 12);
  END IF;
  
  total_salary := base_salary + sunday_premium;
  employer_contrib := total_salary * 0.28;
  
  RETURN total_salary + employer_contrib;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2.6 Mise à jour automatique du profile_complete
CREATE OR REPLACE FUNCTION update_profile_complete()
RETURNS TRIGGER AS $$
BEGIN
  NEW.profile_complete := (
    NEW.first_name IS NOT NULL AND NEW.first_name != '' AND
    NEW.last_name IS NOT NULL AND NEW.last_name != '' AND
    NEW.date_of_birth IS NOT NULL AND
    NEW.niss IS NOT NULL AND NEW.niss != '' AND
    NEW.address_street IS NOT NULL AND NEW.address_street != '' AND
    NEW.address_city IS NOT NULL AND NEW.address_city != '' AND
    NEW.address_zip IS NOT NULL AND NEW.address_zip != '' AND
    NEW.phone IS NOT NULL AND NEW.phone != '' AND
    NEW.email IS NOT NULL AND NEW.email != '' AND
    NEW.iban IS NOT NULL AND NEW.iban != '' AND
    NEW.status IS NOT NULL AND
    NEW.framework_contract_date IS NOT NULL
  );
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_profile_complete
  BEFORE INSERT OR UPDATE ON flexi_workers
  FOR EACH ROW EXECUTE FUNCTION update_profile_complete();

-- 2.7 Calcul automatique des heures effectives
CREATE OR REPLACE FUNCTION calculate_actual_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.clock_in IS NOT NULL AND NEW.clock_out IS NOT NULL THEN
    NEW.actual_hours := ROUND(
      EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0,
      2
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_hours
  BEFORE INSERT OR UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION calculate_actual_hours();

-- 2.8 Génération automatique du coût estimé à la création du shift
CREATE OR REPLACE FUNCTION auto_estimate_shift_cost()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.worker_id IS NOT NULL THEN
    NEW.estimated_cost := calculate_shift_cost(
      NEW.start_time,
      NEW.end_time,
      COALESCE(
        (SELECT hourly_rate FROM flexi_workers WHERE id = NEW.worker_id),
        12.53
      ),
      NEW.date
    );
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_estimate_shift_cost
  BEFORE INSERT OR UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION auto_estimate_shift_cost();

-- 2.9 Génération automatique de la cost_line après validation
CREATE OR REPLACE FUNCTION generate_cost_line()
RETURNS TRIGGER AS $$
DECLARE
  v_worker flexi_workers%ROWTYPE;
  v_shift shifts%ROWTYPE;
  v_is_holiday BOOLEAN;
  v_base_salary DECIMAL;
  v_sunday_premium DECIMAL := 0;
  v_total_salary DECIMAL;
  v_employer_contrib DECIMAL;
BEGIN
  -- Seulement quand on passe à validated = true
  IF NEW.validated = true AND (OLD.validated IS DISTINCT FROM true) THEN
    SELECT * INTO v_worker FROM flexi_workers WHERE id = NEW.worker_id;
    SELECT * INTO v_shift FROM shifts WHERE id = NEW.shift_id;
    
    v_is_holiday := is_sunday_or_belgian_holiday(v_shift.date);
    v_base_salary := NEW.actual_hours * v_worker.hourly_rate;
    
    IF v_is_holiday THEN
      v_sunday_premium := LEAST(NEW.actual_hours * 2, 12);
    END IF;
    
    v_total_salary := v_base_salary + v_sunday_premium;
    v_employer_contrib := v_total_salary * 0.28;
    
    -- Supprimer l'ancienne cost_line si elle existe
    DELETE FROM cost_lines WHERE time_entry_id = NEW.id;
    
    -- Insérer la nouvelle cost_line
    INSERT INTO cost_lines (
      time_entry_id, worker_id, base_hours, hourly_rate,
      base_salary, sunday_premium, total_salary,
      employer_contribution, total_cost,
      is_sunday_or_holiday, date
    ) VALUES (
      NEW.id, NEW.worker_id, NEW.actual_hours, v_worker.hourly_rate,
      v_base_salary, v_sunday_premium, v_total_salary,
      v_employer_contrib, v_total_salary + v_employer_contrib,
      v_is_holiday, v_shift.date
    );
    
    -- Mettre à jour le ytd_earnings du worker
    UPDATE flexi_workers
    SET ytd_earnings = (
      SELECT COALESCE(SUM(total_salary), 0)
      FROM cost_lines
      WHERE worker_id = NEW.worker_id
        AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)
    )
    WHERE id = NEW.worker_id;
    
    -- Passer le shift en completed
    UPDATE shifts SET status = 'completed' WHERE id = NEW.shift_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_cost_line
  AFTER UPDATE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION generate_cost_line();

-- 2.10 Création auto de la Dimona quand un shift est accepté
CREATE OR REPLACE FUNCTION auto_create_dimona()
RETURNS TRIGGER AS $$
DECLARE
  v_worker flexi_workers%ROWTYPE;
  v_location locations%ROWTYPE;
  v_hours DECIMAL;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    SELECT * INTO v_worker FROM flexi_workers WHERE id = NEW.worker_id;
    SELECT * INTO v_location FROM locations WHERE id = NEW.location_id;
    
    v_hours := EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0;
    IF v_hours < 0 THEN v_hours := v_hours + 24; END IF;
    
    INSERT INTO dimona_declarations (
      shift_id, worker_id, location_id,
      declaration_type, worker_niss,
      planned_start, planned_end, planned_hours,
      status
    ) VALUES (
      NEW.id, NEW.worker_id, NEW.location_id,
      'IN', COALESCE(v_worker.niss, ''),
      (NEW.date + NEW.start_time) AT TIME ZONE 'Europe/Brussels',
      (NEW.date + NEW.end_time) AT TIME ZONE 'Europe/Brussels',
      v_hours,
      'ready'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_create_dimona
  AFTER UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION auto_create_dimona();

-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flexi_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE flexi_availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE dimona_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_exports ENABLE ROW LEVEL SECURITY;

-- Locations : lecture pour tous les authentifiés, écriture manager
CREATE POLICY "locations_select" ON locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "locations_manage" ON locations
  FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());

-- Flexi Workers
CREATE POLICY "workers_select_own" ON flexi_workers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_manager());
CREATE POLICY "workers_update_own" ON flexi_workers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_manager())
  WITH CHECK (user_id = auth.uid() OR is_manager());
CREATE POLICY "workers_insert_manager" ON flexi_workers
  FOR INSERT TO authenticated
  WITH CHECK (is_manager());
CREATE POLICY "workers_delete_manager" ON flexi_workers
  FOR DELETE TO authenticated
  USING (is_manager());

-- Availabilities
CREATE POLICY "avail_select" ON flexi_availabilities
  FOR SELECT TO authenticated
  USING (
    worker_id = get_current_worker_id() OR is_manager()
  );
CREATE POLICY "avail_insert" ON flexi_availabilities
  FOR INSERT TO authenticated
  WITH CHECK (worker_id = get_current_worker_id());
CREATE POLICY "avail_update" ON flexi_availabilities
  FOR UPDATE TO authenticated
  USING (worker_id = get_current_worker_id());
CREATE POLICY "avail_delete" ON flexi_availabilities
  FOR DELETE TO authenticated
  USING (worker_id = get_current_worker_id());

-- Shifts
CREATE POLICY "shifts_select" ON shifts
  FOR SELECT TO authenticated
  USING (worker_id = get_current_worker_id() OR is_manager());
CREATE POLICY "shifts_manage" ON shifts
  FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "shifts_accept_refuse" ON shifts
  FOR UPDATE TO authenticated
  USING (
    worker_id = get_current_worker_id()
    AND status = 'proposed'
  )
  WITH CHECK (
    status IN ('accepted', 'refused')
  );

-- Time Entries
CREATE POLICY "time_select" ON time_entries
  FOR SELECT TO authenticated
  USING (worker_id = get_current_worker_id() OR is_manager());
CREATE POLICY "time_insert" ON time_entries
  FOR INSERT TO authenticated
  WITH CHECK (worker_id = get_current_worker_id());
CREATE POLICY "time_manage" ON time_entries
  FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- Cost Lines : manager only
CREATE POLICY "cost_manager" ON cost_lines
  FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- Dimona : manager only
CREATE POLICY "dimona_manager" ON dimona_declarations
  FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- Payroll : manager only
CREATE POLICY "payroll_manager" ON payroll_exports
  FOR ALL TO authenticated
  USING (is_manager()) WITH CHECK (is_manager());

-- ============================================================
-- 4. REALTIME (pour le dashboard live)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE time_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;

-- ============================================================
-- 5. STORAGE BUCKET (carte d'identité)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('flexi-documents', 'flexi-documents', false, 5242880) -- 5MB max
ON CONFLICT DO NOTHING;

-- Policy storage : chaque flexi accède à son dossier
CREATE POLICY "flexi_docs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'flexi-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR is_manager()
    )
  );

CREATE POLICY "flexi_docs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'flexi-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 6. DONNÉES DE SEED (développement)
-- ============================================================

-- Locations
INSERT INTO locations (name, address, latitude, longitude, geo_radius_meters) VALUES
  ('MDjambo Jurbise', 'Grand-Route, 7050 Jurbise', 50.526000, 3.908000, 100),
  ('MDjambo Boussu', 'Rue de Mons, 7300 Boussu', 50.434000, 3.796000, 100);

-- Note: Les flexi workers seront créés via l'interface manager
-- qui gère aussi la création du compte Supabase Auth

-- ============================================================
-- 7. VUES UTILITAIRES
-- ============================================================

-- Vue planning enrichie (shifts + worker + location)
CREATE OR REPLACE VIEW v_shifts_enriched AS
SELECT
  s.*,
  fw.first_name AS worker_first_name,
  fw.last_name AS worker_last_name,
  fw.phone AS worker_phone,
  fw.profile_complete AS worker_profile_complete,
  l.name AS location_name,
  l.address AS location_address,
  dd.status AS dimona_status
FROM shifts s
LEFT JOIN flexi_workers fw ON s.worker_id = fw.id
LEFT JOIN locations l ON s.location_id = l.id
LEFT JOIN LATERAL (
  SELECT status FROM dimona_declarations
  WHERE shift_id = s.id
  ORDER BY created_at DESC LIMIT 1
) dd ON true;

-- Vue dashboard analytics
CREATE OR REPLACE VIEW v_monthly_stats AS
SELECT
  DATE_TRUNC('month', cl.date) AS month,
  COUNT(DISTINCT cl.worker_id) AS worker_count,
  SUM(cl.base_hours) AS total_hours,
  SUM(cl.total_salary) AS total_salary,
  SUM(cl.employer_contribution) AS total_contributions,
  SUM(cl.total_cost) AS total_cost,
  SUM(cl.base_hours) * 21.11 AS nowjobs_equivalent,
  (SUM(cl.base_hours) * 21.11) - SUM(cl.total_cost) AS savings
FROM cost_lines cl
GROUP BY DATE_TRUNC('month', cl.date)
ORDER BY month DESC;

-- Vue alertes plafond 18k€
CREATE OR REPLACE VIEW v_worker_ytd_alerts AS
SELECT
  fw.id,
  fw.first_name,
  fw.last_name,
  fw.status,
  fw.ytd_earnings,
  CASE
    WHEN fw.status = 'pensioner' THEN 'none'
    WHEN fw.ytd_earnings >= 18000 THEN 'blocked'
    WHEN fw.ytd_earnings > 17000 THEN 'critical'
    WHEN fw.ytd_earnings > 15000 THEN 'warning'
    ELSE 'none'
  END AS alert_level
FROM flexi_workers fw
WHERE fw.is_active = true;
