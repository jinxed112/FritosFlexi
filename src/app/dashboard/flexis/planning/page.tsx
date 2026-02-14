import { createClient } from '@/lib/supabase/server';
import PlanningGrid from '@/components/dashboard/PlanningGrid';

export default async function DashboardPlanningPage() {
  const supabase = createClient();

  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startISO = monday.toISOString().split('T')[0];
  const endISO = sunday.toISOString().split('T')[0];

  const { data: shifts } = await supabase
    .from('shifts')
    .select('*, locations(name), flexi_workers(id, first_name, last_name, hourly_rate, profile_complete)')
    .gte('date', startISO)
    .lte('date', endISO)
    .order('start_time');

  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .order('name');

  const { data: workers } = await supabase
    .from('flexi_workers')
    .select('id, first_name, last_name, hourly_rate, profile_complete')
    .eq('is_active', true)
    .eq('profile_complete', true)
    .order('last_name');

  const { data: availabilities } = await supabase
    .from('flexi_availabilities')
    .select('*, flexi_workers(id, first_name, last_name)')
    .gte('date', startISO)
    .lte('date', endISO);

  return (
    <PlanningGrid
      shifts={shifts || []}
      locations={locations || []}
      workers={workers || []}
      availabilities={availabilities || []}
      weekStart={startISO}
    />
  );
}
