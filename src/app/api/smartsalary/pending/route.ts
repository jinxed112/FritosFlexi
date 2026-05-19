// src/app/api/smartsalary/pending/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// SECURITY: restreindre à l'origine Partena (alignement avec confirm/route.ts).
// Avant : '*' permettait à tout site web d'exfiltrer NISS/IBAN via le navigateur
// d'un manager connecté (même si x-fritos-auth requis).
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://my.partena-professional.be',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-fritos-auth',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-fritos-auth');
  const apiKey = process.env.BOOKMARKLET_API_KEY;

  if (!authHeader || !apiKey || authHeader !== apiKey) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS_HEADERS });
  }

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
