import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MissionsList from '@/components/flexi/MissionsList';
import { getDefaultRate } from '@/types';

export default async function FlexiMissionsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/flexi/login');

  if (user.user_metadata?.role === 'manager') {
    redirect('/dashboard/flexis');
  }

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id, hourly_rate, status, home_lat, home_lng')
    .eq('user_id', user.id)
    .single();

  if (!worker) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="font-medium">Profil introuvable</p>
        <p className="text-xs mt-1">Contactez votre manager</p>
      </div>
    );
  }

  const { data: proposed } = await supabase
    .from('shifts')
    .select('*, locations(name, address)')
    .eq('worker_id', (worker as any).id)
    .eq('status', 'proposed')
    .order('date');

  const { data: history } = await supabase
    .from('shifts')
    .select('*, locations(name)')
    .eq('worker_id', (worker as any).id)
    .neq('status', 'proposed')
    .order('date', { ascending: false })
    .limit(10);

  const w = worker as any;

  return (
    <MissionsList
      proposed={proposed || []}
      history={history || []}
      hourlyRate={w.hourly_rate || getDefaultRate(w.status)}
      workerStatus={w.status || 'other'}
      homeLat={w.home_lat || null}
      homeLng={w.home_lng || null}
    />
  );
}
