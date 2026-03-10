// src/app/api/smartsalary/prestations/route.ts
import { NextRequest, NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://my.partena-professional.be',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-fritos-auth',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

// Convertit des heures décimales (4.5) en format .NET TimeSpan "0.HH:MM:SS"
function toTimeSpan(decimalHours: number): string {
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `0.${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

// Convertit une date en ISO local belge "2026-03-09T00:00:00.000+01:00"
function toLocalISO(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  // Détermine l'offset CET (+01) ou CEST (+02)
  const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
  const isDST = d.getTimezoneOffset() < Math.max(jan, jul);
  const offset = isDST ? '+02:00' : '+01:00';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T00:00:00.000${offset}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-fritos-auth');
  if (!authHeader) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS_HEADERS });
  }

  const { searchParams } = new URL(req.url);
  const year  = parseInt(searchParams.get('year')  || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const periodEnd   = new Date(year, month, 0).toISOString().split('T')[0]; // dernier jour du mois

  // Auth via JWT passé en header (pas de cookie dispo depuis my.partena-professional.be)
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${authHeader}` } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS_HEADERS });
  }

  // Récupère les time entries validées avec les infos worker
  const { data: entries, error } = await supabase
    .from('time_entries')
    .select(`
      id,
      actual_hours,
      clock_in,
      validated,
      worker_id,
      flexi_workers!inner (
        id,
        first_name,
        last_name,
        status,
        smartsalary_person_id
      ),
      shifts!inner (
        date,
        location_id
      )
    `)
    .eq('validated', true)
    .not('flexi_workers.smartsalary_person_id', 'is', null)
    .gte('shifts.date', periodStart)
    .lte('shifts.date', periodEnd)
    .order('shifts.date');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  // Groupe par worker → par jour
  const workerMap: Record<string, {
    personId: string;
    workerId: string;
    payrollGroupContext: string;
    days: Record<string, number>; // date → total heures
  }> = {};

  for (const entry of (entries || [])) {
    const worker = (entry as any).flexi_workers;
    const shift  = (entry as any).shifts;
    if (!worker?.smartsalary_person_id || !entry.actual_hours) continue;

    const pid = worker.smartsalary_person_id; // "308091#4"
    const wid = pid.split('#')[1];            // "4"
    const pg  = worker.status === 'student' ? '05' : '04'; // étudiant ou flexi
    const date = shift.date; // "2026-03-09"

    if (!workerMap[pid]) {
      workerMap[pid] = { personId: pid, workerId: wid, payrollGroupContext: pg, days: {} };
    }
    workerMap[pid].days[date] = (workerMap[pid].days[date] || 0) + parseFloat(entry.actual_hours);
  }

  // Construit le payload GroupCalendar
  const TimesheetMonthForWorkers = Object.values(workerMap).map(w => ({
    personId: w.personId,
    workerId: w.workerId,
    payrollGroupContext: w.payrollGroupContext,
    taskNumber: '01',
    includeEssData: false,
    illnessWorkAccidentPeriods: [],
    timesheetMonth: Object.entries(w.days).map(([date, hours]) => ({
      date: toLocalISO(date),
      performances: [{
        date: toLocalISO(date),
        paycode: '002.00',
        hours: toTimeSpan(hours),
        days: 0,
        salary: 0,
        replacementSalary: 0,
        lineNumber: 1,
        mainCode: true,
        property: 'D',
        performanceConstant: 'None',
        groupCode: '0',
        imputation: '',
        absenceGenericCode: '',
        absenceGenericPayCode: '002.00',
        inputType: '',
        period: {
          dateFrom: toLocalISO(date),
          dateTo: toLocalISO(date),
        },
      }],
    })),
  }));

  return NextResponse.json(
    { TimesheetMonthForWorkers, period: { year, month, periodStart, periodEnd } },
    { headers: CORS_HEADERS }
  );
}
