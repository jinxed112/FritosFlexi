import { createClient } from '@/lib/supabase/server';
import ValidationBoard from '@/components/dashboard/ValidationBoard';

export default async function DashboardValidationPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const supabase = createClient();

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const from = searchParams.from || yesterday;
  const to = searchParams.to || today;

  const selectQuery = `
    *,
    flexi_workers(id, first_name, last_name, hourly_rate, status),
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

  // Pointages ouverts : clock_in présent mais clock_out null
  const { data: openEntries } = await supabase
    .from('time_entries')
    .select(selectQuery)
    .is('clock_out', null)
    .not('clock_in', 'is', null)
    .order('clock_in', { ascending: false });

  // Shifts acceptés sans time_entry, pas dans le futur
  const { data: acceptedShifts } = await supabase
    .from('shifts')
    .select(`
      *,
      flexi_workers(id, first_name, last_name, hourly_rate, status),
      locations(name),
      time_entries(id)
    `)
    .eq('status', 'accepted')
    .lte('date', today)
    .order('date', { ascending: false });

  const missingShifts = (acceptedShifts || []).filter(
    (s) => !s.time_entries || s.time_entries.length === 0
  );

  return (
    <ValidationBoard
      allPending={(pending || []).filter((e) => e.shifts !== null)}
      allValidated={(validated || []).filter((e) => e.shifts !== null)}
      allMissing={missingShifts}
      allOpen={(openEntries || []).filter((e) => e.shifts !== null)}
      from={from}
      to={to}
    />
  );
}
