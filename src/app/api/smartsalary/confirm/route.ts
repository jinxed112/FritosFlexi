// src/app/api/smartsalary/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://my.partena-professional.be',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const { workerId, personId, fritosToken } = await req.json();

  if (!workerId || !personId || !fritosToken) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: CORS_HEADERS });
  }

  // Verify the FritOS token is a valid manager session
  const { data: { user } } = await supabase.auth.getUser(fritosToken);
  if (!user || (user.user_metadata?.role !== 'manager' && user.email !== 'admin@mdjambo.be')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS_HEADERS });
  }

  const { error } = await supabase
    .from('flexi_workers')
    .update({ smartsalary_person_id: personId })
    .eq('id', workerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
