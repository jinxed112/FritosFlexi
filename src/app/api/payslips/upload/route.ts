// src/app/api/payslips/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Force Node.js runtime (pdf-parse needs it)
export const runtime = 'nodejs';
export const maxDuration = 30;

function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* server component */ }
        },
      },
    }
  );
}

function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll() { return []; }, setAll() {} },
    }
  );
}

/** Normalize NISS: strip dots, dashes, spaces → pure digits */
function normalizeNiss(niss: string): string {
  return niss.replace(/[.\-\s]/g, '');
}

/** Extract NISS from a page's text */
function extractNiss(text: string): string | null {
  const match = text.match(
    /registre\s*national\s*:\s*([\d]{2}[.\s]?[\d]{2}[.\s]?[\d]{2}[-.\s]?[\d]{3}[.\s]?[\d]{2})/i
  );
  return match ? match[1] : null;
}

/** Extract period from text */
function extractPeriod(text: string): { start: string; end: string } | null {
  const match = text.match(
    /Période\s+(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/
  );
  if (!match) return null;
  return {
    start: `${match[3]}-${match[2]}-${match[1]}`, // YYYY-MM-DD
    end: `${match[6]}-${match[5]}-${match[4]}`,
  };
}

/** Extract net salary from text */
function extractNetSalary(text: string): number | null {
  const match = text.match(/A payer sur IBAN:.*?([\d]+[,.][\d]+)/);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

/** Extract gross salary (Total Rémunérations brutes) */
function extractGrossSalary(text: string): number | null {
  const match = text.match(/Total\s+R[ée]mun[ée]rations\s+brutes\s*([\d]+[,.][\d]+)/i);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

/** Extract employer ONSS contribution */
function extractEmployerOnss(text: string): number | null {
  const match = text.match(/Cotisation\s+ONSS\s+employeur\s*([\d]+[,.][\d]+)/i);
  if (!match) return null;
  return parseFloat(match[1].replace(',', '.'));
}

/** Extract workplace (Lieu de travail) */
function extractEstablishment(text: string): string | null {
  const match = text.match(/Lieu de travail:\s*(\d+\s+\w+)/);
  return match ? match[1] : null;
}

/** Extract worker name from Confidentiel block */
function extractName(text: string): string | null {
  const match = text.match(/Confidentiel\s+\S+\n([^\n]+)/);
  return match ? match[1].trim() : null;
}

/** Extract hours worked */
function extractHours(text: string): string | null {
  const match = text.match(/Jours et heures prest[ée]s\s+[\d,]+\s+([\d]+:[\d]+)/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const admin = createAdminClient();

  // Verify caller is manager
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let uploadId: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get('pdf') as File | null;
    if (!file || file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Fichier PDF requis' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Create upload record
    const { data: uploadRecord, error: uploadErr } = await admin
      .from('payslip_uploads')
      .insert({
        original_filename: file.name,
        status: 'processing',
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (uploadErr || !uploadRecord) {
      return NextResponse.json({ error: `Erreur DB: ${uploadErr?.message}` }, { status: 500 });
    }
    uploadId = uploadRecord.id;

    // Dynamic imports (pdf-parse is CJS, pdf-lib is ESM-compatible)
    const pdfParse = require('pdf-parse');
    const { PDFDocument } = require('pdf-lib');

    // Step 1: Get total page count
    const fullData = await pdfParse(pdfBuffer);
    const totalPages = fullData.numpages;

    if (totalPages < 2 || totalPages % 2 !== 0) {
      await admin.from('payslip_uploads').update({
        status: 'error',
        error_message: `PDF invalide: ${totalPages} pages (attendu: multiple de 2)`,
      }).eq('id', uploadId);
      return NextResponse.json({
        error: `PDF invalide: ${totalPages} pages (attendu: nombre pair, 2 pages par employé)`,
      }, { status: 400 });
    }

    // Step 2: Extract text per page (cumulative diff approach)
    const pageTexts: string[] = [];
    let prevText = '';
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const data = await pdfParse(pdfBuffer, { max: pageNum });
      const pageText = data.text.substring(prevText.length);
      pageTexts.push(pageText);
      prevText = data.text;
    }

    // Step 3: Load workers for NISS matching
    const { data: workers } = await admin
      .from('flexi_workers')
      .select('id, first_name, last_name, niss, user_id, default_location_id')
      .not('niss', 'is', null);

    const workersByNiss = new Map<string, typeof workers extends (infer T)[] | null ? T : never>();
    for (const w of workers || []) {
      if (w.niss) {
        workersByNiss.set(normalizeNiss(w.niss), w);
      }
    }

    // Step 4: Process payslips (2 pages each)
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const matched: Array<{
      workerId: string;
      workerName: string;
      niss: string;
      netSalary: number | null;
      grossSalary: number | null;
      employerOnss: number | null;
      hours: string | null;
      establishment: string | null;
    }> = [];
    const unmatched: Array<{
      name: string | null;
      niss: string | null;
      reason: string;
      pageStart: number;
    }> = [];

    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    let periodLabel: string | null = null;

    const payslipCount = Math.floor(totalPages / 2);

    for (let i = 0; i < payslipCount; i++) {
      const summaryPageIdx = i * 2;      // Page impaire (0-indexed)
      const detailPageIdx = i * 2 + 1;   // Page paire
      const summaryText = pageTexts[summaryPageIdx] || '';
      const detailText = pageTexts[detailPageIdx] || '';
      const combinedText = summaryText + '\n' + detailText;

      // Extract period from first payslip
      if (!periodStart) {
        const period = extractPeriod(summaryText);
        if (period) {
          periodStart = period.start;
          periodEnd = period.end;
          // Format label: "Mars 2026"
          const d = new Date(period.start + 'T00:00:00');
          periodLabel = d.toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' });
          periodLabel = periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1);
        }
      }

      const niss = extractNiss(summaryText);
      const name = extractName(summaryText);
      const netSalary = extractNetSalary(summaryText);
      const grossSalary = extractGrossSalary(summaryText);
      const employerOnss = extractEmployerOnss(detailText);
      const hours = extractHours(summaryText);
      const establishment = extractEstablishment(summaryText);

      if (!niss) {
        unmatched.push({
          name,
          niss: null,
          reason: 'NISS non trouvé sur la page',
          pageStart: summaryPageIdx + 1,
        });
        continue;
      }

      const normalizedNiss = normalizeNiss(niss);
      const worker = workersByNiss.get(normalizedNiss);

      if (!worker) {
        unmatched.push({
          name,
          niss,
          reason: 'Aucun worker correspondant dans la base',
          pageStart: summaryPageIdx + 1,
        });
        continue;
      }

      // Split 2 pages into individual PDF
      const newDoc = await PDFDocument.create();
      const [p1] = await newDoc.copyPages(pdfDoc, [summaryPageIdx]);
      newDoc.addPage(p1);
      if (detailPageIdx < totalPages) {
        const [p2] = await newDoc.copyPages(pdfDoc, [detailPageIdx]);
        newDoc.addPage(p2);
      }
      const splitPdfBytes = await newDoc.save();

      // Upload to Storage
      const periodStr = periodStart
        ? periodStart.substring(0, 7) // YYYY-MM
        : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const storagePath = `${worker.id}/${periodStr}.pdf`;

      const { error: storageErr } = await admin.storage
        .from('payslips')
        .upload(storagePath, splitPdfBytes, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (storageErr) {
        console.error(`Storage upload error for ${name}:`, storageErr);
        unmatched.push({
          name,
          niss,
          reason: `Erreur upload Storage: ${storageErr.message}`,
          pageStart: summaryPageIdx + 1,
        });
        continue;
      }

      // Insert/upsert payslip record
      const { error: payslipErr } = await admin
        .from('payslips')
        .upsert({
          worker_id: worker.id,
          period_start: periodStart!,
          period_end: periodEnd!,
          file_path: storagePath,
          file_size: splitPdfBytes.length,
          original_filename: file.name,
          gross_salary: grossSalary,
          net_salary: netSalary,
          employer_onss: employerOnss,
          hours_worked: hours,
          establishment,
          upload_id: uploadId,
          uploaded_by: user.id,
          viewed_at: null, // Reset viewed status on re-upload
        }, {
          onConflict: 'worker_id,period_start,period_end',
        });

      if (payslipErr) {
        console.error(`Payslip insert error for ${name}:`, payslipErr);
        unmatched.push({
          name,
          niss,
          reason: `Erreur DB: ${payslipErr.message}`,
          pageStart: summaryPageIdx + 1,
        });
        continue;
      }

      matched.push({
        workerId: worker.id,
        workerName: `${worker.first_name} ${worker.last_name}`,
        niss,
        netSalary,
        grossSalary,
        employerOnss,
        hours,
        establishment,
      });
    }

    // Update upload record
    await admin.from('payslip_uploads').update({
      status: 'completed',
      total_payslips: payslipCount,
      matched: matched.length,
      unmatched: unmatched.length,
      unmatched_details: unmatched,
      period_label: periodLabel,
    }).eq('id', uploadId);

    return NextResponse.json({
      success: true,
      uploadId,
      period: periodLabel,
      total: payslipCount,
      matched: matched.length,
      unmatched: unmatched.length,
      details: { matched, unmatched },
    });

  } catch (err: any) {
    console.error('Payslip upload error:', err);

    if (uploadId) {
      await admin.from('payslip_uploads').update({
        status: 'error',
        error_message: err.message,
      }).eq('id', uploadId);
    }

    return NextResponse.json(
      { error: `Erreur traitement PDF: ${err.message}` },
      { status: 500 }
    );
  }
}
