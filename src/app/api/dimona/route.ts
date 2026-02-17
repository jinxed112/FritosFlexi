// ============================================================
// API Route: /api/dimona
// POST - Manage Dimona declarations
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  declareDimonaIn,
  cancelDimona,
  updateDimona,
  handleNoShow,
  checkDimonaStatus,
} from '@/lib/dimona/actions';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Verify manager auth
async function verifyManager(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);

  return user?.user_metadata?.role === 'manager' || user?.email === 'admin@mdjambo.be';
}

export async function POST(req: NextRequest) {
  if (!await verifyManager(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { action, shiftId, reason, startTime, endTime } = body;

  if (!action || !shiftId) {
    return NextResponse.json({ error: 'Missing action or shiftId' }, { status: 400 });
  }

  try {
    let result;

    switch (action) {
      case 'declare':
        // Send Dimona-In for a confirmed shift
        result = await declareDimonaIn(shiftId);
        break;

      case 'cancel':
        // Cancel a Dimona (shift cancelled or no-show)
        result = await cancelDimona(shiftId, reason || 'manager_cancelled');
        break;

      case 'no_show':
        // Worker didn't show up
        result = await handleNoShow(shiftId);
        break;

      case 'update':
        // Update Dimona hours
        if (!startTime || !endTime) {
          return NextResponse.json({ error: 'Missing startTime or endTime for update' }, { status: 400 });
        }
        result = await updateDimona(shiftId, startTime, endTime);
        break;

      case 'status':
        // Check current Dimona status
        result = await checkDimonaStatus(shiftId);
        return NextResponse.json(result);

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Dimona API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
