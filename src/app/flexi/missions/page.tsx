import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import MissionsList from '@/components/flexi/MissionsList';

export default async function FlexiMissionsPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/flexi/login');

  // Manager → redirect to dashboard
  if (user.user_metadata?.role === 'manager') {
    redirect('/dashboard/flexis');
  }

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id, hourly_rate')
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

  // Proposed shifts
  const { data: proposed } = await supabase
    .from('shifts')
    .select('*, locations(name, address)')
    .eq('worker_id', (worker as any).id)
    .eq('status', 'proposed')
    .order('date');

  // Recent history
  const { data: history } = await supabase
    .from('shifts')
    .select('*, locations(name)')
    .eq('worker_id', (worker as any).id)
    .neq('status', 'proposed')
    .order('date', { ascending: false })
    .limit(10);

  return (
    <MissionsList
      proposed={proposed || []}
      history={history || []}
      hourlyRate={(worker as any)?.hourly_rate || 12.53}
    />
  );
}
