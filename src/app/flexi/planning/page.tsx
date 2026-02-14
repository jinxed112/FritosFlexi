import { createClient } from '@/lib/supabase/server';

export default async function FlexiPlanningPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('id')
    .eq('user_id', user!.id)
    .single();

  const { data: shifts } = await supabase
    .from('shifts')
    .select('*, locations(name), dimona_declarations(status)')
    .eq('worker_id', worker!.id)
    .eq('status', 'accepted')
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date');

  return (
    <div>
      <h2 className="text-sm font-bold text-gray-800 mb-3">Prochains shifts</h2>
      <div className="space-y-3">
        {(shifts || []).map((shift: any) => {
          const isSunday = new Date(shift.date).getDay() === 0;
          const dimonaStatus = shift.dimona_declarations?.[0]?.status;

          return (
            <div key={shift.id} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 ${isSunday ? 'border-l-4 border-l-purple-400' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-gray-900">
                    {new Date(shift.date).toLocaleDateString('fr-BE', {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })}
                  </p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {shift.locations?.name} · {shift.start_time.slice(0, 5)}–{shift.end_time.slice(0, 5)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium capitalize">{shift.role}</span>
                    {isSunday && (
                      <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">+2€/h dim.</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    dimonaStatus === 'ok' ? 'bg-emerald-100 text-emerald-700' :
                    dimonaStatus === 'ready' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {dimonaStatus === 'ok' ? '✓ Dimona OK' : dimonaStatus === 'ready' ? '⏳ Dimona' : 'Dimona'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {(!shifts || shifts.length === 0) && (
          <div className="text-center py-10 text-gray-400">
            <div className="text-4xl mb-2">📅</div>
            <p className="font-medium">Aucun shift à venir</p>
          </div>
        )}
      </div>
    </div>
  );
}
