// ============================================================
// CRON: /api/cron/dimona
// Runs every day at 20:00 CET (19:00 UTC) via Vercel Cron
// Sends Dimona-In for all accepted shifts happening tomorrow
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { sendDimonaForTomorrow } from '@/lib/dimona/actions';

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sendDimonaForTomorrow();

    console.log(`[DIMONA CRON] Tomorrow's declarations: ${result.sent} sent, ${result.failed} failed`);

    if (result.failed > 0) {
      console.error('[DIMONA CRON] Failed declarations:', 
        result.results.filter(r => !r.result.success).map(r => ({
          worker: r.workerName,
          error: r.result.error,
        }))
      );
    }

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      details: result.results.map(r => ({
        worker: r.workerName,
        success: r.result.success,
        result: r.result.result,
        error: r.result.error,
      })),
    });
  } catch (error: any) {
    console.error('[DIMONA CRON] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Add to vercel.json:
// {
//   "crons": [
//     {
//       "path": "/api/cron/dimona",
//       "schedule": "0 19 * * *"
//     }
//   ]
// }
