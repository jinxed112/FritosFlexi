'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Generate payroll export data for a period
 */
export async function generateExport(periodStart: string, periodEnd: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté' };

  // Get all validated cost lines for the period
  const { data: costLines, error } = await supabase
    .from('cost_lines')
    .select(`
      *,
      flexi_workers(first_name, last_name, niss),
      time_entries(clock_in, clock_out, shifts(date, start_time, end_time, location_id))
    `)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .order('date');

  if (error) return { error: error.message };

  // Aggregate by worker
  const workerMap = new Map<string, {
    worker_id: string;
    first_name: string;
    last_name: string;
    niss: string;
    shifts: number;
    total_hours: number;
    base_salary: number;
    sunday_premium: number;
    total_salary: number;
    employer_contribution: number;
    total_cost: number;
    lines: typeof costLines;
  }>();

  for (const line of costLines || []) {
    const w = (line as any).flexi_workers;
    const key = line.worker_id;

    if (!workerMap.has(key)) {
      workerMap.set(key, {
        worker_id: key,
        first_name: w.first_name,
        last_name: w.last_name,
        niss: w.niss || '',
        shifts: 0,
        total_hours: 0,
        base_salary: 0,
        sunday_premium: 0,
        total_salary: 0,
        employer_contribution: 0,
        total_cost: 0,
        lines: [],
      });
    }

    const agg = workerMap.get(key)!;
    agg.shifts += 1;
    agg.total_hours += line.base_hours;
    agg.base_salary += line.base_salary;
    agg.sunday_premium += line.sunday_premium;
    agg.total_salary += line.total_salary;
    agg.employer_contribution += line.employer_contribution;
    agg.total_cost += line.total_cost;
    agg.lines.push(line);
  }

  const summary = Array.from(workerMap.values());
  const totals = summary.reduce(
    (acc, w) => ({
      shifts: acc.shifts + w.shifts,
      hours: acc.hours + w.total_hours,
      salary: acc.salary + w.total_salary,
      contributions: acc.contributions + w.employer_contribution,
      cost: acc.cost + w.total_cost,
    }),
    { shifts: 0, hours: 0, salary: 0, contributions: 0, cost: 0 }
  );

  return {
    data: {
      period: { start: periodStart, end: periodEnd },
      workers: summary,
      totals,
      costLines: costLines || [],
    },
  };
}

/**
 * Generate CSV content for Partena
 */
export async function generateCSV(periodStart: string, periodEnd: string) {
  const result = await generateExport(periodStart, periodEnd);
  if ('error' in result) return result;

  const { costLines } = result.data!;
  const headers = [
    'NISS', 'Nom', 'Prénom', 'Date prestation',
    'Heure début', 'Heure fin', 'Heures totales',
    'Taux horaire', 'Salaire brut', 'Prime dimanche',
    'Pécule vacances (7,67%)', 'Cotisation patronale (28%)',
  ];

  const rows = (costLines as any[]).map((cl) => {
    const w = cl.flexi_workers;
    const te = cl.time_entries;
    const s = te?.shifts;
    const vacationPay = cl.total_salary * 0.0767;

    return [
      w.niss || '',
      w.last_name,
      w.first_name,
      cl.date,
      s?.start_time || '',
      s?.end_time || '',
      cl.base_hours.toFixed(2),
      cl.hourly_rate.toFixed(2),
      cl.base_salary.toFixed(2),
      cl.sunday_premium.toFixed(2),
      vacationPay.toFixed(2),
      cl.employer_contribution.toFixed(2),
    ].join(';');
  });

  const csv = [headers.join(';'), ...rows].join('\n');
  return { csv };
}

/**
 * Save export record to database
 */
export async function saveExportRecord(
  periodStart: string,
  periodEnd: string,
  totalHours: number,
  totalCost: number,
  workerCount: number,
  fileUrl?: string
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('payroll_exports')
    .insert({
      period_start: periodStart,
      period_end: periodEnd,
      total_hours: totalHours,
      total_cost: totalCost,
      worker_count: workerCount,
      file_url: fileUrl || null,
      generated_by: user?.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/dashboard/flexis/export');
  return { data };
}
