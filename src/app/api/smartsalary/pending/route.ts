// src/app/api/smartsalary/pending/route.ts
import { NextRequest, NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-fritos-auth',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-fritos-auth');
  if (!authHeader) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS_HEADERS });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
  if (!user || authError) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS_HEADERS });
  }, { status: 401, headers: CORS_HEADERS });
  }

  const { data: workers } = await supabase
    .from('flexi_workers')
    .select('id, first_name, last_name, niss, status, hourly_rate, email, phone, iban, date_of_birth, address_street, address_city, address_zip, gender, birth_place, language, education_level, smartsalary_person_id')
    .eq('is_active', true)
    .eq('profile_complete', true)
    .order('last_name');

  return NextResponse.json({ workers: workers || [] }, { headers: CORS_HEADERS });
}
