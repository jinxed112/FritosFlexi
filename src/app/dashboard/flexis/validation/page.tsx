import { createClient } from '@/lib/supabase/server';
import ValidationTable from '@/components/dashboard/ValidationTable';

export default async function DashboardValidationPage() {
  const supabase = createClient();

  const { data: entries } = await supabase
    .from('time_entries')
    .select(`
      *,
      flexi_workers(first_name, last_name, hourly_rate),
      shifts(date, start_time, end_time, location_id, locations(name))
    `)
    .eq('validated', false)
    .not('clock_out', 'is', null)
    .order('created_at', { ascending: false });

  return <ValidationTable entries={entries || []} />;
}
