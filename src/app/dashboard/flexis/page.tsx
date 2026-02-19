import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { formatEuro } from '@/utils/costs';
import { FLEXI_CONSTANTS } from '@/types';

export default async function DashboardOverviewPage() {
  const supabase = createClient();

  // Get current month stats
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const { data: costLines } = await supabase
    .from('cost_lines')
    .select('base_hours, total_salary, employer_contribution, total_cost')
    .gte('date', monthStart)
    .lte('date', monthEnd);

  const lines = (costLines || []) as Array<{ base_hours: number; total_salary: number; employer_contribution: number; total_cost: number }>;
  const totalHours = lines.reduce((s, c) => s + c.base_hours, 0);
  const totalCost = lines.reduce((s, c) => s + c.total_cost, 0);
  const nowjobsCost = totalHours * FLEXI_CONSTANTS.NOWJOBS_HOURLY_COST;
  const savings = nowjobsCost - totalCost;

  // Workers with alerts
  const { data: workers } = await supabase
    .from('flexi_workers')
    .select('id, first_name, last_name, profile_complete, ytd_earnings, status, hourly_rate')
    .eq('is_active', true)
    .order('last_name');

  // Pending Dimona
  const { data: pendingDimona } = await supabase
    .from('dimona_declarations')
    .select('id')
    .eq('status', 'ready');

  // Pending validations
  const { data: pendingValidations } = await supabase
    .from('time_entries')
    .select('id')
    .eq('validated', false)
    .not('clock_out', 'is', null);

  // Active shifts
  const { data: shifts } = await supabase
    .from('shifts')
    .select('id, status')
    .gte('date', monthStart)
    .lte('date', monthEnd);

  const acceptedShifts = ((shifts || []) as Array<{ id: string; status: string }>).filter((s) => s.status === 'accepted').length;
  const incompleteProfiles = ((workers || []) as Array<{ profile_complete: boolean; [k: string]: any }>).filter((w) => !w.profile_complete).length;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Module Flexi</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {now.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Alerts */}
      <div className="space-y-2 mb-6">
        {(pendingDimona?.length || 0) > 0 && (
          <Link href="/dashboard/flexis/dimona"
            className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors">
            <span className="text-amber-500">⚠</span>
            <span className="text-sm text-amber-800 font-medium">{pendingDimona!.length} Dimona en attente</span>
            <span className="ml-auto text-amber-500">→</span>
          </Link>
        )}
        {incompleteProfiles > 0 && (
          <Link href="/dashboard/flexis/workers"
            className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 hover:bg-red-100 transition-colors">
            <span className="text-red-500">●</span>
            <span className="text-sm text-red-700 font-medium">{incompleteProfiles} profil(s) incomplet(s)</span>
            <span className="ml-auto text-red-400">→</span>
          </Link>
        )}
        {(pendingValidations?.length || 0) > 0 && (
          <Link href="/dashboard/flexis/validation"
            className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 hover:bg-blue-100 transition-colors">
            <span className="text-blue-500">✓</span>
            <span className="text-sm text-blue-700 font-medium">{pendingValidations!.length} pointage(s) à valider</span>
            <span className="ml-auto text-blue-400">→</span>
          </Link>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Coût direct', value: formatEuro(totalCost), sub: 'Ce mois' },
          { label: 'Via NowJobs', value: formatEuro(nowjobsCost), sub: 'Équivalent' },
          { label: 'Économie', value: formatEuro(savings), sub: 'Ce mois', accent: true },
          { label: 'Heures', value: `${totalHours.toFixed(1)}h`, sub: `${acceptedShifts} shifts` },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">{kpi.label}</p>
            <p className={`text-xl font-bold tracking-tight ${kpi.accent ? 'text-emerald-600' : 'text-gray-900'}`}>{kpi.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Workers quick view */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-800">Flexis</h3>
          <Link href="/dashboard/flexis/workers" className="text-xs text-orange-500 font-medium hover:underline">
            Voir tout →
          </Link>
        </div>
        <div className="space-y-2">
          {(workers || []).map((w) => {
            const ytdPct = Math.min((w.ytd_earnings / 18000) * 100, 100);
            const alert = w.status !== 'pensioner' && w.ytd_earnings > 15000;
            return (
              <div key={w.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs ${w.profile_complete ? 'bg-gradient-to-br from-orange-400 to-red-500' : 'bg-gray-300'}`}>
                  {w.first_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{w.first_name} {w.last_name}</span>
                    {!w.profile_complete && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                  </div>
                  <div className="text-xs text-gray-400">{w.hourly_rate} €/h</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium text-gray-600">{w.ytd_earnings.toLocaleString('fr-BE')} €</div>
                  {alert && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium text-white ${w.ytd_earnings > 17000 ? 'bg-red-400' : 'bg-amber-400'}`}>
                      {w.ytd_earnings > 17000 ? 'Critique' : 'Attention'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
