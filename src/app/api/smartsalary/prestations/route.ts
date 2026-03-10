// src/app/api/smartsalary/prestations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-fritos-auth',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

function toTimespan(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `0.${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-fritos-auth');
  const apiKey = process.env.BOOKMARKLET_API_KEY;

  if (!authHeader || !apiKey || authHeader !== apiKey) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS_HEADERS });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: entries } = await supabase
    .from('time_entries')
    .select(`
      id, actual_hours,
      shifts!inner(date, worker_id),
      flexi_workers!inner(smartsalary_person_id, status)
    `)
    .eq('validated', true)
    .gte('shifts.date', periodStart)
    .lte('shifts.date', periodEnd)
    .not('flexi_workers.smartsalary_person_id', 'is', null);

  if (!entries || entries.length === 0) {
    return NextResponse.json({ TimesheetMonthForWorkers: [] }, { headers: CORS_HEADERS });
  }

  // Group by worker
  const byWorker: Record<string, any> = {};

  for (const entry of entries as any[]) {
    const shift = entry.shifts;
    const worker = entry.flexi_workers;
    const personId = worker.smartsalary_person_id;
    const workerId = personId.split('#')[1];
    const isStudent = worker.status === 'student';
    const payrollGroupContext = isStudent ? '05' : '04';
    const date = shift.date; // YYYY-MM-DD

    if (!byWorker[personId]) {
      byWorker[personId] = {
        personId,
        workerId,
        payrollGroupContext,
        taskNumber: "01",
        includeEssData: false,
        illnessWorkAccidentPeriods: [],
        timesheetMonth: [],
      };
    }

    const dateISO = `${date}T00:00:00.000+01:00`;
    byWorker[personId].timesheetMonth.push({
      date: dateISO,
      performances: [{
        date: dateISO,
        paycode: '002.00',
        hours: toTimespan(entry.actual_hours || 0),
        days: 0, salary: 0, replacementSalary: 0,
        lineNumber: 1, mainCode: true, property: 'D',
        performanceConstant: 'None', groupCode: '0',
        imputation: '', absenceGenericCode: '',
        absenceGenericPayCode: '002.00', inputType: '',
        period: { dateFrom: dateISO, dateTo: dateISO },
      }],
    });
  }

  return NextResponse.json(
    { TimesheetMonthForWorkers: Object.values(byWorker) },
    { headers: CORS_HEADERS }
  );
}
