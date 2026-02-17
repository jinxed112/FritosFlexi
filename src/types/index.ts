// ============================================================
// FritOS Flexi — Type Definitions
// ============================================================

// ─── Database Row Types ─────────────────────────────────────

export interface Location {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  geo_radius_meters: number;
  qr_code_token: string;
  is_active: boolean;
  created_at: string;
}

export interface FlexiWorker {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: 'M' | 'F' | null;
  birth_place: string | null;
  birth_country: string | null;
  nationality: string | null;
  middle_initial: string | null;
  niss: string | null;
  address_street: string | null;
  address_city: string | null;
  address_zip: string | null;
  address_country: string;
  phone: string | null;
  email: string;
  iban: string | null;
  status: WorkerStatus;
  hourly_rate: number;
  ytd_earnings: number;
  id_card_url: string | null;
  framework_contract_date: string | null;
  framework_contract_url: string | null;
  pin_code: string | null;
  profile_complete: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type WorkerStatus = 'student' | 'pensioner' | 'employee' | 'other';

export interface FlexiAvailability {
  id: string;
  worker_id: string;
  date: string;
  type: AvailabilityType;
  created_at: string;
}

export type AvailabilityType = 'full_day' | 'midi' | 'soir';

export interface Shift {
  id: string;
  location_id: string;
  worker_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  role: ShiftRole;
  status: ShiftStatus;
  notes: string | null;
  estimated_cost: number | null;
  created_at: string;
  updated_at: string;
}

export type ShiftRole = 'cuisine' | 'caisse' | 'polyvalent';
export type ShiftStatus = 'draft' | 'proposed' | 'accepted' | 'refused' | 'completed' | 'cancelled';

export interface TimeEntry {
  id: string;
  shift_id: string;
  worker_id: string;
  clock_in: string | null;
  clock_out: string | null;
  geo_lat_in: number | null;
  geo_lng_in: number | null;
  geo_lat_out: number | null;
  geo_lng_out: number | null;
  geo_valid_in: boolean | null;
  geo_valid_out: boolean | null;
  actual_hours: number | null;
  validated: boolean;
  validated_by: string | null;
  validated_at: string | null;
  created_at: string;
}

export interface CostLine {
  id: string;
  time_entry_id: string;
  worker_id: string;
  base_hours: number;
  hourly_rate: number;
  base_salary: number;
  sunday_premium: number;
  total_salary: number;
  employer_contribution: number;
  total_cost: number;
  is_sunday_or_holiday: boolean;
  date: string;
  created_at: string;
}

export interface DimonaDeclaration {
  id: string;
  shift_id: string;
  worker_id: string;
  location_id: string;
  declaration_type: DimonaType;
  worker_type: string;
  joint_committee: string;
  employer_noss: string | null;
  worker_niss: string;
  planned_start: string;
  planned_end: string;
  planned_hours: number | null;
  status: DimonaStatus;
  dimona_period_id: string | null;
  onss_response: Record<string, unknown> | null;
  sent_at: string | null;
  responded_at: string | null;
  sent_method: 'api' | 'manual' | null;
  notes: string | null;
  created_at: string;
}

export type DimonaType = 'IN' | 'OUT' | 'UPDATE' | 'CANCEL';
export type DimonaStatus = 'pending' | 'ready' | 'sent' | 'ok' | 'nok' | 'error';

export interface PayrollExport {
  id: string;
  period_start: string;
  period_end: string;
  total_hours: number;
  total_cost: number;
  worker_count: number;
  file_url: string | null;
  file_format: 'csv' | 'xlsx';
  sent_to_partena: boolean;
  sent_at: string | null;
  generated_by: string | null;
  created_at: string;
}

// ─── Enriched / View Types ──────────────────────────────────

export interface ShiftEnriched extends Shift {
  worker_first_name: string | null;
  worker_last_name: string | null;
  worker_phone: string | null;
  worker_profile_complete: boolean | null;
  location_name: string;
  location_address: string;
  dimona_status: DimonaStatus | null;
}

export interface WorkerYtdAlert {
  id: string;
  first_name: string;
  last_name: string;
  status: WorkerStatus;
  ytd_earnings: number;
  alert_level: 'none' | 'warning' | 'critical' | 'blocked';
}

export interface MonthlyStats {
  month: string;
  worker_count: number;
  total_hours: number;
  total_salary: number;
  total_contributions: number;
  total_cost: number;
  nowjobs_equivalent: number;
  savings: number;
}

// ─── Form / Input Types ─────────────────────────────────────

export interface CreateWorkerInput {
  first_name: string;
  last_name: string;
  email: string;
  hourly_rate?: number;
  status?: WorkerStatus;
}

export interface UpdateProfileInput {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  gender?: 'M' | 'F';
  birth_place?: string;
  birth_country?: string;
  nationality?: string;
  middle_initial?: string;
  niss?: string;
  address_street?: string;
  address_city?: string;
  address_zip?: string;
  phone?: string;
  email?: string;
  iban?: string;
  status?: WorkerStatus;
}

export interface CreateShiftInput {
  location_id: string;
  worker_id?: string;
  date: string;
  start_time: string;
  end_time: string;
  role?: ShiftRole;
  notes?: string;
}

export interface ClockInput {
  shift_id: string;
  latitude: number;
  longitude: number;
}

// ─── UI State Types ─────────────────────────────────────────

export interface UserRole {
  role: 'manager' | 'flexi';
  workerId?: string;
}

export type AlertLevel = 'none' | 'warning' | 'critical' | 'blocked';

export interface CostCalculation {
  base_salary: number;
  sunday_premium: number;
  total_salary: number;
  employer_contribution: number;
  total_cost: number;
  nowjobs_equivalent: number;
  savings: number;
}

// ─── Constants ──────────────────────────────────────────────

export const FLEXI_CONSTANTS = {
  MIN_HOURLY_RATE: 12.53,
  MIN_HOURLY_RATE_MARCH_2026: 12.78,
  MAX_RATE_MULTIPLIER: 1.5,
  EMPLOYER_CONTRIBUTION_RATE: 0.28,
  SUNDAY_PREMIUM_PER_HOUR: 2,
  SUNDAY_PREMIUM_MAX_PER_DAY: 12,
  VACATION_PAY_RATE: 0.0767,
  YTD_WARNING_THRESHOLD: 15000,
  YTD_CRITICAL_THRESHOLD: 17000,
  YTD_BLOCKED_THRESHOLD: 18000,
  NOWJOBS_HOURLY_COST: 21.11,
  JOINT_COMMITTEE: '302',
  WORKER_TYPE: 'FLX',
} as const;
