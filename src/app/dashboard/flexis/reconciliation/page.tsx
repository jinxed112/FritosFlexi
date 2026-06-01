// src/app/dashboard/flexis/reconciliation/page.tsx
//
// Rapport de réconciliation Dimona <-> pointage.
// Pour une période (mois), compare par shift :
//   - ce qui a été DÉCLARÉ  : dimona_declarations.status = 'ok' (et pas annulé)
//   - ce qui a été PRESTÉ    : time_entries.clock_in non NULL
// et sort les deux désaccords :
//   1) Dimona OK mais PAS de pointage  -> déclaré, pas venu -> à annuler / ne pas payer
//   2) Pointage mais PAS de Dimona OK  -> bossé, pas déclaré -> à régulariser
//
// Page protégée par l'auth manager via le layout /dashboard.
// Lecture serveur avec la service-role (même pattern que prestations/route.ts).

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type SearchParams = { year?: string; month?: string };

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function monthBounds(year: number, month: number) {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

// Une relation Supabase peut revenir en objet (to-one) ou en tableau ; on normalise.
function one(rel: any) {
  return Array.isArray(rel) ? rel[0] : rel;
}

function fmtHM(dec: number) {
  let h = Math.floor(dec + 1e-9);
  let m = Math.round((dec - h) * 60);
  if (m === 60) { h++; m = 0; }
  return `${h}h${String(m).padStart(2, '0')}`;
}

function workerName(s: any) {
  const w = one(s.flexi_workers) || {};
  const name = [w.first_name, w.last_name].filter(Boolean).join(' ');
  return name || `Worker ${s.worker_id || '?'}`;
}

export default async function ReconciliationPage({ searchParams }: { searchParams: SearchParams }) {
  const now = new Date();
  const year = parseInt(searchParams?.year || String(now.getFullYear()), 10);
  const month = parseInt(searchParams?.month || String(now.getMonth() + 1), 10);
  const { start, end } = monthBounds(year, month);

  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1) Shifts du mois (hors annulés)
  const { data: shifts, error: shiftErr } = await supabase
    .from('shifts')
    .select('id, date, start_time, end_time, status, worker_id, flexi_workers(first_name,last_name,status), locations(name)')
    .gte('date', start)
    .lte('date', end)
    .neq('status', 'cancelled')
    .order('date', { ascending: true });

  const shiftIds = (shifts || []).map((s: any) => s.id);

  let timeEntries: any[] = [];
  let dimonas: any[] = [];

  if (shiftIds.length) {
    const { data: te } = await supabase
      .from('time_entries')
      .select('shift_id, clock_in, clock_out, actual_hours, validated')
      .in('shift_id', shiftIds);
    timeEntries = te || [];

    const { data: dd } = await supabase
      .from('dimona_declarations')
      .select('shift_id, status, declaration_type')
      .in('shift_id', shiftIds);
    dimonas = dd || [];
  }

  // Index pointage par shift
  const clockByShift = new Set<string>();
  const hoursByShift = new Map<string, number>();
  for (const t of timeEntries) {
    if (t.clock_in) clockByShift.add(t.shift_id);
    if (t.actual_hours) hoursByShift.set(t.shift_id, (hoursByShift.get(t.shift_id) || 0) + Number(t.actual_hours));
  }

  // Index Dimona par shift : "IN ok" et "CANCEL ok"
  const dimonaInOk = new Set<string>();
  const dimonaCancelOk = new Set<string>();
  for (const d of dimonas) {
    if (d.status === 'ok' && d.declaration_type === 'CANCEL') dimonaCancelOk.add(d.shift_id);
    else if (d.status === 'ok') dimonaInOk.add(d.shift_id);
  }

  const declaredNotWorked: any[] = []; // Dimona OK, pas venu
  const workedNotDeclared: any[] = []; // venu, pas de Dimona OK
  let okCount = 0;

  for (const s of (shifts || [])) {
    const hasActiveDimona = dimonaInOk.has(s.id) && !dimonaCancelOk.has(s.id);
    const came = clockByShift.has(s.id);

    if (hasActiveDimona && !came) {
      declaredNotWorked.push(s);
    } else if (came && !hasActiveDimona) {
      workedNotDeclared.push({ ...s, hours: hoursByShift.get(s.id) || 0 });
    } else if (hasActiveDimona && came) {
      okCount++;
    }
    // ni Dimona ni pointage (shift jamais réalisé) -> ignoré
  }

  const totalWorkedNotDeclaredHours = workedNotDeclared.reduce((a, s) => a + (s.hours || 0), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Réconciliation Dimona / pointage</h1>
        <div className="flex items-center gap-3">
          <a href={`?year=${prev.y}&month=${prev.m}`} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">‹ Précédent</a>
          <span className="text-sm font-semibold text-gray-700 w-32 text-center">{MONTHS[month - 1]} {year}</span>
          <a href={`?year=${next.y}&month=${next.m}`} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">Suivant ›</a>
        </div>
      </div>

      {shiftErr && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          Erreur de lecture : {shiftErr.message}. Vérifie les noms de colonnes/relations si ton schéma a évolué.
        </div>
      )}

      {/* Résumé */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-3xl font-bold text-emerald-700">{okCount}</div>
          <div className="text-sm text-emerald-700">Shifts OK (déclaré + presté)</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-3xl font-bold text-amber-700">{declaredNotWorked.length}</div>
          <div className="text-sm text-amber-700">Dimona OK mais pas venu</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-3xl font-bold text-red-700">{workedNotDeclared.length}</div>
          <div className="text-sm text-red-700">Presté sans Dimona ({fmtHM(totalWorkedNotDeclaredHours)})</div>
        </div>
      </div>

      {/* 1) Dimona OK mais pas venu */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-amber-700 mb-1">⚠️ Dimona ouverte mais pas venu travailler</h2>
        <p className="text-sm text-gray-500 mb-3">
          Une Dimona acceptée existe pour ce shift, mais aucun pointage (clock_in). À annuler côté ONSS (Dimona-Cancel) et à ne pas payer si la personne n'est effectivement pas venue.
        </p>
        {declaredNotWorked.length === 0 ? (
          <div className="text-sm text-gray-400 italic">Aucun cas — rien à annuler ce mois-ci.</div>
        ) : (
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Worker</th>
                <th className="text-left px-3 py-2">Lieu</th>
                <th className="text-left px-3 py-2">Horaire prévu</th>
                <th className="text-left px-3 py-2">Statut shift</th>
              </tr>
            </thead>
            <tbody>
              {declaredNotWorked.map((s: any) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{s.date}</td>
                  <td className="px-3 py-2 font-medium">{workerName(s)}</td>
                  <td className="px-3 py-2">{one(s.locations)?.name || '—'}</td>
                  <td className="px-3 py-2">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</td>
                  <td className="px-3 py-2">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 2) Presté sans Dimona */}
      <section>
        <h2 className="text-lg font-semibold text-red-700 mb-1">⛔ Presté mais sans Dimona</h2>
        <p className="text-sm text-gray-500 mb-3">
          Un pointage existe mais aucune Dimona acceptée. Ces heures sont rejetées par Partena (SSPEJR) tant que la Dimona n'est pas régularisée. À déclarer (même en retard) avant de pouvoir les payer.
        </p>
        {workedNotDeclared.length === 0 ? (
          <div className="text-sm text-gray-400 italic">Aucun cas — toutes les heures prestées ont une Dimona.</div>
        ) : (
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Worker</th>
                <th className="text-left px-3 py-2">Lieu</th>
                <th className="text-left px-3 py-2">Heures pointées</th>
                <th className="text-left px-3 py-2">Statut shift</th>
              </tr>
            </thead>
            <tbody>
              {workedNotDeclared.map((s: any) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">{s.date}</td>
                  <td className="px-3 py-2 font-medium">{workerName(s)}</td>
                  <td className="px-3 py-2">{one(s.locations)?.name || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-red-700">{fmtHM(s.hours)}</td>
                  <td className="px-3 py-2">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
