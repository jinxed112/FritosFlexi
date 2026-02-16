import { createClient } from '@/lib/supabase/server';
import WorkersList from '@/components/dashboard/WorkersList';

export default async function DashboardWorkersPage() {
  const supabase = createClient();

  const { data: workers } = await supabase
    .from('flexi_workers')
    .select('*')
    .order('is_active', { ascending: false })
    .order('last_name');

  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .order('name');

  return <WorkersList workers={workers || []} locations={locations || []} />;
}