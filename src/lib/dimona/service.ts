// ============================================================
// Dimona API v2 - Service
// Handles OAuth2 JWT Bearer authentication and all Dimona operations
// ============================================================

import * as crypto from 'crypto';
import type {
  DimonaToken,
  DimonaInPayload,
  DimonaCancelPayload,
  DimonaUpdatePayload,
  DimonaDeclarationResponse,
  DimonaResult,
  DimonaAction,
} from './types';

// --- Configuration ---
const DIMONA_CONFIG = {
  // OAuth
  tokenUrl: 'https://services.socialsecurity.be/REST/oauth/v5/token',
  clientId: process.env.DIMONA_CLIENT_ID!, // self_service_chaman_305369_32a2ocupdo
  privateKey: process.env.DIMONA_PRIVATE_KEY!, // Contents of fritos-dimona.key (PEM)
  certificate: process.env.DIMONA_CERTIFICATE!, // Contents of fritos-dimona.pem (PEM)

  // API
  baseUrl: process.env.DIMONA_API_URL || 'https://services.socialsecurity.be/REST/dimona/v2',

  // Employer
  enterpriseNumber: process.env.DIMONA_ENTERPRISE_NUMBER || '1009237290',

  // Retry config (from ONSS documentation)
  retry: {
    initialWaitMs: 2000,    // Don't poll before 2 seconds
    pollIntervalMs: 1000,   // Poll every 1 second between 2-30s
    maxPollTimeMs: 30000,   // Give up after 30 seconds
  },
};

// --- Token cache ---
let cachedToken: DimonaToken | null = null;

/**
 * Create a JWT assertion for OAuth2 client_credentials grant
 * See: Belgian Social Security OAuth v5 documentation
 */
function createJwtAssertion(): string {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: DIMONA_CONFIG.clientId,
    sub: DIMONA_CONFIG.clientId,
    aud: 'https://services.socialsecurity.be/REST/oauth/v5/token',
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 300, // 5 min validity
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(DIMONA_CONFIG.privateKey, 'base64url');

  return `${signingInput}.${signature}`;
}

/**
 * Get a valid OAuth2 bearer token, using cache if still valid
 */
async function getToken(): Promise<string> {
  // Check if cached token is still valid (with 60s margin)
  if (cachedToken && (Date.now() - cachedToken.obtained_at) < (cachedToken.expires_in - 60) * 1000) {
    return cachedToken.access_token;
  }

  const assertion = createJwtAssertion();

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion,
  });

  const response = await fetch(DIMONA_CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OAuth token error ${response.status}: ${text}`);
  }

  const data = await response.json();
  cachedToken = {
    ...data,
    obtained_at: Date.now(),
  };

  return cachedToken!.access_token;
}

/**
 * POST a declaration to the Dimona API
 * Returns the declarationId from the Location header
 */
async function postDeclaration(payload: DimonaInPayload | DimonaCancelPayload | DimonaUpdatePayload): Promise<number> {
  const token = await getToken();

  const response = await fetch(`${DIMONA_CONFIG.baseUrl}/declarations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 201) {
    // declarationId is in the Location header
    const location = response.headers.get('Location');
    if (location) {
      const id = parseInt(location.split('/').pop() || '');
      if (!isNaN(id)) return id;
    }
    // Fallback: try response body
    try {
      const body = await response.json();
      if (body?.declarationStatus?.declarationId) {
        return body.declarationStatus.declarationId;
      }
    } catch { /* ignore */ }
    throw new Error('Dimona 201 but no declarationId found in response');
  }

  if (response.status === 400) {
    const body = await response.json().catch(() => null);
    throw new Error(`Dimona validation error 400: ${JSON.stringify(body)}`);
  }

  const text = await response.text();
  throw new Error(`Dimona API error ${response.status}: ${text}`);
}

/**
 * GET declaration status with retry mechanism
 * Follows ONSS-recommended polling schedule:
 * - 0-2s: no calls
 * - 2-30s: every 1 second
 * - 30s+: give up (return last known status)
 */
async function pollDeclarationResult(declarationId: number): Promise<DimonaDeclarationResponse> {
  const token = await getToken();
  const { initialWaitMs, pollIntervalMs, maxPollTimeMs } = DIMONA_CONFIG.retry;

  // Wait initial 2 seconds (ONSS says no declaration processed in < 2s)
  await sleep(initialWaitMs);

  const startTime = Date.now();

  while (Date.now() - startTime < maxPollTimeMs) {
    const response = await fetch(`${DIMONA_CONFIG.baseUrl}/declarations/${declarationId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (response.status === 200) {
      const data: DimonaDeclarationResponse = await response.json();
      if (data.declarationStatus?.result) {
        return data; // Got a final result
      }
    }

    if (response.status === 404) {
      // Still processing, wait and retry
      await sleep(pollIntervalMs);
      continue;
    }

    // Unexpected error
    const text = await response.text();
    throw new Error(`Dimona GET error ${response.status}: ${text}`);
  }

  throw new Error(`Dimona declaration ${declarationId}: timeout after ${maxPollTimeMs}ms - still processing`);
}

// --- Public API ---

/**
 * Send a Dimona-In declaration for a flexi-job shift
 */
export async function sendDimonaIn(
  workerNiss: string,
  date: string,         // "2026-02-21"
  startTime: string,    // "17:00" or "1700"
  endTime: string,      // "21:30" or "2130"
): Promise<DimonaResult> {
  try {
    const payload: DimonaInPayload = {
      employer: { enterpriseNumber: DIMONA_CONFIG.enterpriseNumber },
      worker: { ssin: cleanNiss(workerNiss) },
      dimonaIn: {
        startDate: date,
        startHour: formatHour(startTime),
        endDate: date, // Flexi shifts are always same day
        endHour: formatHour(endTime),
        features: {
          workerType: 'FLX',
          jointCommissionNumber: 'XXX',
        },
      },
    };

    const declarationId = await postDeclaration(payload);
    const result = await pollDeclarationResult(declarationId);

    return {
      success: result.declarationStatus.result === 'A' || result.declarationStatus.result === 'W',
      declarationId,
      periodId: result.declarationStatus.period?.id,
      result: result.declarationStatus.result,
      anomalies: result.declarationStatus.anomalies,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Cancel a Dimona declaration (worker didn't show up or shift cancelled)
 * Requires the periodId from a previously accepted Dimona-In
 */
export async function sendDimonaCancel(periodId: number): Promise<DimonaResult> {
  try {
    const payload: DimonaCancelPayload = {
      dimonaCancel: { periodId },
    };

    const declarationId = await postDeclaration(payload);
    const result = await pollDeclarationResult(declarationId);

    return {
      success: result.declarationStatus.result === 'A' || result.declarationStatus.result === 'W',
      declarationId,
      result: result.declarationStatus.result,
      anomalies: result.declarationStatus.anomalies,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update a Dimona declaration (change start/end times)
 * Requires the periodId from a previously accepted Dimona-In
 */
export async function sendDimonaUpdate(
  periodId: number,
  date: string,
  startTime: string,
  endTime: string,
): Promise<DimonaResult> {
  try {
    const payload: DimonaUpdatePayload = {
      dimonaUpdate: {
        periodId,
        startDate: date,
        startHour: formatHour(startTime),
        endDate: date,
        endHour: formatHour(endTime),
      },
    };

    const declarationId = await postDeclaration(payload);
    const result = await pollDeclarationResult(declarationId);

    return {
      success: result.declarationStatus.result === 'A' || result.declarationStatus.result === 'W',
      declarationId,
      result: result.declarationStatus.result,
      anomalies: result.declarationStatus.anomalies,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// --- Utility functions ---

function cleanNiss(niss: string): string {
  return niss.replace(/[\.\-\s]/g, '');
}

function formatHour(time: string): string {
  // Accept "17:00" or "1700" → return "1700"
  return time.replace(':', '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
