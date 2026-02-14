import { createClient } from '@/lib/supabase/server';
import MissionsList from '@/components/flexi/MissionsList';

export default async function FlexiMissionsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id, hourly_rate')
    .eq('user_id', user!.id)
    .single();

  // Proposed shifts
  const { data: proposed } = await supabase
    .from('shifts')
    .select('*, locations(name, address)')
    .eq('worker_id', worker!.id)
    .eq('status', 'proposed')
    .order('date');

  // Recent history
  const { data: history } = await supabase
    .from('shifts')
    .select('*, locations(name)')
    .eq('worker_id', worker!.id)
    .neq('status', 'proposed')
    .order('date', { ascending: false })
    .limit(10);

  return (
    <MissionsList
      proposed={proposed || []}
      history={history || []}
      hourlyRate={worker?.hourly_rate || 12.53}
    />
  );
}
