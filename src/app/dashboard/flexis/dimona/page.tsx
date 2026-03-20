import { createClient } from '@/lib/supabase/server';
import DimonaTable from '@/components/dashboard/DimonaTable';

export default async function DashboardDimonaPage() {
  const supabase = createClient();

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Déclarations pour shifts futurs (>= aujourd'hui)
  const { data: futureDeclarations } = await supabase
    .from('dimona_declarations')
    .select(`
      *,
      flexi_workers(first_name, last_name, niss, date_of_birth, status),
      locations(name),
      shifts!inner(date, start_time, end_time)
    `)
    .gte('shifts.date', today)
    .order('created_at', { ascending: false });

  // NOK/error des dernières 24h (pour corriger)
  const { data: recentErrors } = await supabase
    .from('dimona_declarations')
    .select(`
      *,
      flexi_workers(first_name, last_name, niss, date_of_birth, status),
      locations(name),
      shifts(date, start_time, end_time)
    `)
    .in('status', ['nok', 'error'])
    .gte('created_at', yesterday)
    .order('created_at', { ascending: false });

  // Fusionner en évitant les doublons
  const allIds = new Set<string>();
  const declarations: any[] = [];

  for (const d of [...(futureDeclarations || []), ...(recentErrors || [])]) {
    if (!allIds.has(d.id)) {
      allIds.add(d.id);
      declarations.push(d);
    }
  }

  // Trier par date shift desc
  declarations.sort((a, b) => {
    const dateA = a.shifts?.date || '';
    const dateB = b.shifts?.date || '';
    return dateB.localeCompare(dateA);
  });

  return <DimonaTable declarations={declarations} />;
}
