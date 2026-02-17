import { createClient } from '@/lib/supabase/server';
import PlanningGrid from '@/components/dashboard/PlanningGrid';

export default async function DashboardPlanningPage({ searchParams }: { searchParams: { week?: string } }) {
  const supabase = createClient();

  // Week navigation: ?week=2026-02-09 or default to current week
  const now = new Date();
  let monday: Date;
  if (searchParams.week) {
    monday = new Date(searchParams.week);
  } else {
    monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  }
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startISO = monday.toISOString().split('T')[0];
  const endISO = sunday.toISOString().split('T')[0];

  const prevMonday = new Date(monday);
  prevMonday.setDate(monday.getDate() - 7);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const { data: shifts } = await supabase
    .from('shifts')
    .select('*, locations(name), flexi_workers(id, first_name, last_name, hourly_rate, status, profile_complete)')
    .gte('date', startISO)
    .lte('date', endISO)
    .neq('status', 'cancelled')
    .order('start_time');

  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .order('name');

  // All active workers (for the team selector)
  const { data: allWorkers } = await supabase
    .from('flexi_workers')
    .select('id, first_name, last_name, hourly_rate, status, profile_complete, ytd_earnings')
    .eq('is_active', true)
    .order('last_name');

  return (
    <PlanningGrid
      shifts={shifts || []}
      locations={locations || []}
      allWorkers={allWorkers || []}
      weekStart={startISO}
      prevWeek={prevMonday.toISOString().split('T')[0]}
      nextWeek={nextMonday.toISOString().split('T')[0]}
    />
  );
}
