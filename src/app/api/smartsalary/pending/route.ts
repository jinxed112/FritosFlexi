// src/app/api/smartsalary/pending/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-fritos-auth',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

function decodeJWT(token: string): any {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-fritos-auth');
  if (!token) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS_HEADERS });
  }

  // Vérifie que le JWT Supabase est valide et non expiré
  const payload = decodeJWT(token);
  if (!payload || !payload.sub || payload.exp < Date.now() / 1000) {
    return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 401, headers: CORS_HEADERS });
  }

  // Utilise la service role key pour bypasser RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: workers } = await supabase
    .from('flexi_workers')
    .select('id, first_name, last_name, niss, status, hourly_rate, email, phone, iban, date_of_birth, address_street, address_city, address_zip, gender, birth_place, language, education_level, smartsalary_person_id')
    .eq('is_active', true)
    .eq('profile_complete', true)
    .order('last_name');

  return NextResponse.json({ workers: workers || [] }, { headers: CORS_HEADERS });
}
