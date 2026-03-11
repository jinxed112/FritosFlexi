import { createClient } from '@/lib/supabase/server';
import ValidationTable from '@/components/dashboard/ValidationTable';

export default async function DashboardValidationPage() {
  const supabase = createClient();

  const selectQuery = `
    *,
    flexi_workers(first_name, last_name, hourly_rate),
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

  return (
    <>
      <div style={{ background: 'red', color: 'white', padding: '20px', fontSize: '24px' }}>
        TEST — pending: {pending?.length ?? 0} / validated: {validated?.length ?? 0}
      </div>
      <ValidationTable
        entries={pending || []}
        validatedEntries={validated || []}
      />
    </>
  );
}
