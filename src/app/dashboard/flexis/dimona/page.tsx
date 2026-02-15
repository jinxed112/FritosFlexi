import { createClient } from '@/lib/supabase/server';
import DimonaTable from '@/components/dashboard/DimonaTable';

export default async function DashboardDimonaPage() {
  const supabase = createClient();

  const { data: declarations } = await supabase
    .from('dimona_declarations')
    .select(`
      *,
      flexi_workers(first_name, last_name, niss, date_of_birth),
      locations(name),
      shifts(date, start_time, end_time)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  return <DimonaTable declarations={declarations || []} />;
}
