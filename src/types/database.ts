// ============================================================
// Supabase Database Types
// Run `supabase gen types typescript` to regenerate
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      locations: {
        Row: {
          id: string;
          name: string;
          address: string;
          latitude: number;
          longitude: number;
          geo_radius_meters: number;
          qr_code_token: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          latitude: number;
          longitude: number;
          geo_radius_meters?: number;
          qr_code_token?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          latitude?: number;
          longitude?: number;
          geo_radius_meters?: number;
          qr_code_token?: string;
          is_active?: boolean;
        };
      };
      flexi_workers: {
        Row: {
          id: string;
          user_id: string | null;
          first_name: string;
          last_name: string;
          date_of_birth: string | null;
          niss: string | null;
          address_street: string | null;
          address_city: string | null;
          address_zip: string | null;
          address_country: string;
          phone: string | null;
          email: string;
          iban: string | null;
          status: string;
          hourly_rate: number;
          ytd_earnings: number;
          id_card_url: string | null;
          framework_contract_date: string | null;
          profile_complete: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          first_name: string;
          last_name: string;
          date_of_birth?: string | null;
          niss?: string | null;
          address_street?: string | null;
          address_city?: string | null;
          address_zip?: string | null;
          address_country?: string;
          phone?: string | null;
          email: string;
          iban?: string | null;
          status?: string;
          hourly_rate?: number;
          ytd_earnings?: number;
          id_card_url?: string | null;
          framework_contract_date?: string | null;
          profile_complete?: boolean;
          is_active?: boolean;
        };
        Update: {
          first_name?: string;
          last_name?: string;
          date_of_birth?: string | null;
          niss?: string | null;
          address_street?: string | null;
          address_city?: string | null;
          address_zip?: string | null;
          phone?: string | null;
          email?: string;
          iban?: string | null;
          status?: string;
          hourly_rate?: number;
          id_card_url?: string | null;
          framework_contract_date?: string | null;
          is_active?: boolean;
        };
      };
      flexi_availabilities: {
        Row: {
          id: string;
          worker_id: string;
          date: string;
          type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          worker_id: string;
          date: string;
          type: string;
        };
        Update: {
          worker_id?: string;
          date?: string;
          type?: string;
        };
      };
      shifts: {
        Row: {
          id: string;
          location_id: string;
          worker_id: string | null;
          date: string;
          start_time: string;
          end_time: string;
          role: string;
          status: string;
          notes: string | null;
          estimated_cost: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          location_id: string;
          worker_id?: string | null;
          date: string;
          start_time: string;
          end_time: string;
          role?: string;
          status?: string;
          notes?: string | null;
        };
        Update: {
          location_id?: string;
          worker_id?: string | null;
          date?: string;
          start_time?: string;
          end_time?: string;
          role?: string;
          status?: string;
          notes?: string | null;
        };
      };
      time_entries: {
        Row: {
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
        };
        Insert: {
          id?: string;
          shift_id: string;
          worker_id: string;
          clock_in?: string | null;
          clock_out?: string | null;
          geo_lat_in?: number | null;
          geo_lng_in?: number | null;
          geo_lat_out?: number | null;
          geo_lng_out?: number | null;
          geo_valid_in?: boolean | null;
          geo_valid_out?: boolean | null;
        };
        Update: {
          clock_in?: string | null;
          clock_out?: string | null;
          geo_lat_in?: number | null;
          geo_lng_in?: number | null;
          geo_lat_out?: number | null;
          geo_lng_out?: number | null;
          geo_valid_in?: boolean | null;
          geo_valid_out?: boolean | null;
          actual_hours?: number | null;
          validated?: boolean;
          validated_by?: string | null;
          validated_at?: string | null;
        };
      };
      cost_lines: {
        Row: {
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
        };
        Insert: {
          id?: string;
          time_entry_id: string;
          worker_id: string;
          base_hours: number;
          hourly_rate: number;
          base_salary: number;
          sunday_premium?: number;
          total_salary: number;
          employer_contribution: number;
          total_cost: number;
          is_sunday_or_holiday?: boolean;
          date: string;
        };
        Update: never;
      };
      dimona_declarations: {
        Row: {
          id: string;
          shift_id: string;
          worker_id: string;
          location_id: string;
          declaration_type: string;
          worker_type: string;
          joint_committee: string;
          employer_noss: string | null;
          worker_niss: string;
          planned_start: string;
          planned_end: string;
          planned_hours: number | null;
          status: string;
          dimona_period_id: string | null;
          onss_response: Json | null;
          sent_at: string | null;
          responded_at: string | null;
          sent_method: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shift_id: string;
          worker_id: string;
          location_id: string;
          declaration_type: string;
          worker_niss: string;
          planned_start: string;
          planned_end: string;
          planned_hours?: number | null;
          status?: string;
          notes?: string | null;
        };
        Update: {
          status?: string;
          dimona_period_id?: string | null;
          onss_response?: Json | null;
          sent_at?: string | null;
          responded_at?: string | null;
          sent_method?: string | null;
          notes?: string | null;
        };
      };
      payroll_exports: {
        Row: {
          id: string;
          period_start: string;
          period_end: string;
          total_hours: number;
          total_cost: number;
          worker_count: number;
          file_url: string | null;
          file_format: string;
          sent_to_partena: boolean;
          sent_at: string | null;
          generated_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          period_start: string;
          period_end: string;
          total_hours: number;
          total_cost: number;
          worker_count: number;
          file_url?: string | null;
          file_format?: string;
          generated_by?: string | null;
        };
        Update: {
          file_url?: string | null;
          sent_to_partena?: boolean;
          sent_at?: string | null;
        };
      };
    };
    Views: {
      v_shifts_enriched: {
        Row: {
          id: string;
          location_id: string;
          worker_id: string | null;
          date: string;
          start_time: string;
          end_time: string;
          role: string;
          status: string;
          notes: string | null;
          estimated_cost: number | null;
          worker_first_name: string | null;
          worker_last_name: string | null;
          worker_phone: string | null;
          worker_profile_complete: boolean | null;
          location_name: string;
          location_address: string;
          dimona_status: string | null;
        };
      };
      v_monthly_stats: {
        Row: {
          month: string;
          worker_count: number;
          total_hours: number;
          total_salary: number;
          total_contributions: number;
          total_cost: number;
          nowjobs_equivalent: number;
          savings: number;
        };
      };
      v_worker_ytd_alerts: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          status: string;
          ytd_earnings: number;
          alert_level: string;
        };
      };
    };
    Functions: {
      is_manager: { Args: Record<string, never>; Returns: boolean };
      get_current_worker_id: { Args: Record<string, never>; Returns: string };
      haversine_distance: {
        Args: { lat1: number; lng1: number; lat2: number; lng2: number };
        Returns: number;
      };
      is_sunday_or_belgian_holiday: { Args: { check_date: string }; Returns: boolean };
      calculate_shift_cost: {
        Args: {
          p_start_time: string;
          p_end_time: string;
          p_hourly_rate: number;
          p_date: string;
        };
        Returns: number;
      };
    };
  };
}
