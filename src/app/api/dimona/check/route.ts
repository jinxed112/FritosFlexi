// src/app/api/dimona/check/route.ts
//
// Route diagnostic : vérifie l'état réel d'une période Dimona côté ONSS.
// Réutilise checkPeriodStatus() (service Dimona existant).
//
// Usage : /api/dimona/check?periodId=660353824281&key=<BOOKMARKLET_API_KEY>
// Réponse : { periodId, status: 'active' | 'cancelled' | 'not_found' }
//
// NB : protégée par la même clé que le bookmarklet (query param, car appel navigateur).
// C'est un outil de diagnostic — tu peux retirer ce fichier une fois le sujet réglé.

import { NextRequest, NextResponse } from 'next/server';
import { checkPeriodStatus } from '@/lib/dimona/service';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const key = searchParams.get('key');
  if (!process.env.BOOKMARKLET_API_KEY || key !== process.env.BOOKMARKLET_API_KEY) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const periodId = parseInt(searchParams.get('periodId') || '', 10);
  if (!periodId || Number.isNaN(periodId)) {
    return NextResponse.json({ error: 'periodId requis (entier)' }, { status: 400 });
  }

  try {
    const status = await checkPeriodStatus(periodId);
    return NextResponse.json({ periodId, status });
  } catch (e: any) {
    return NextResponse.json({ periodId, error: e?.message || 'Erreur' }, { status: 500 });
  }
}
