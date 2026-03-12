import { createClient } from '@/lib/supabase/server';
import ValidationTable from '@/components/dashboard/ValidationTable';

export default async function DashboardValidationPage() {
  const supabase = createClient();

  const selectQuery = `
    *,
    flexi_workers(first_name, last_name, hourly_rate, status),
    shifts(date, start_time, end_time, location_id, locations(name))
  `;

  const { data: pending } = await supabase
    .from('time_entries')
    .select(selectQuery)
    .eq('validated', false)
    .not('clock_out', 'is', null)
    .order('created_at', { ascending: false });

  const { data: validated } = await supabase
    .from('time_entries')
    .select(selectQuery)
    .eq('validated', true)
    .not('clock_out', 'is', null)
    .order('validated_at', { ascending: false });

  // Shifts acceptés sans aucun time_entry (pointage manquant)
  const { data: acceptedShifts } = await supabase
    .from('shifts')
    .select(`
      *,
      flexi_workers(id, first_name, last_name, hourly_rate, status),
      locations(name),
      time_entries(id)
    `)
    .eq('status', 'accepted')
    .gte('date', new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString().split('T')[0]) // 60 derniers jours
    .order('date', { ascending: false });

  const missingShifts = (acceptedShifts || []).filter(
    (s) => !s.time_entries || s.time_entries.length === 0
  );

  return (
    <ValidationTable
      entries={pending || []}
      validatedEntries={validated || []}
      missingShifts={missingShifts}
    />
  );
}
