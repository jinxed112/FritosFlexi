// src/app/api/smartsalary/pending/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://my.partena-professional.be',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

async function verifyManager(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.user_metadata?.role === 'manager' || user?.email === 'admin@mdjambo.be';
}

export async function GET(req: NextRequest) {
  if (!await verifyManager(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
  }

  const { data: workers, error } = await supabase
    .from('flexi_workers')
    .select(`
      id, first_name, last_name, niss, status, hourly_rate,
      email, phone, iban, date_of_birth,
      address_street, address_city, address_zip,
      gender, birth_place, language, education_level
    `)
    .eq('is_active', true)
    .eq('profile_complete', true)
    .order('last_name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  return NextResponse.json({ workers: workers || [] }, { headers: CORS_HEADERS });
}