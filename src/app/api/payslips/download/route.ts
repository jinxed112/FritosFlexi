// src/app/api/payslips/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté' }, { status: 401 });
  }

  const payslipId = req.nextUrl.searchParams.get('id');
  if (!payslipId) {
    return NextResponse.json({ error: 'ID requis' }, { status: 400 });
  }

  const isManager = user.user_metadata?.role === 'manager';

  // Fetch the payslip record
  const { data: payslip, error } = await admin
    .from('payslips')
    .select('id, worker_id, file_path, period_start, period_end')
    .eq('id', payslipId)
    .single();

  if (error || !payslip) {
    return NextResponse.json({ error: 'Fiche introuvable' }, { status: 404 });
  }

  // If not manager, verify ownership
  if (!isManager) {
    const { data: worker } = await supabase
      .from('flexi_workers')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', payslip.worker_id)
      .single();

    if (!worker) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Mark as viewed (first time only)
    await admin
      .from('payslips')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', payslipId)
      .is('viewed_at', null);
  }

  // Generate signed URL (valid 5 minutes)
  const { data: signedUrl, error: signError } = await admin.storage
    .from('payslips')
    .createSignedUrl(payslip.file_path, 300);

  if (signError || !signedUrl) {
    return NextResponse.json(
      { error: `Erreur génération URL: ${signError?.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signedUrl.signedUrl });
}
