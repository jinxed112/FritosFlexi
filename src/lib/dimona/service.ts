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
} from './types';

// --- Configuration ---
const DIMONA_CONFIG = {
  // OAuth
  tokenUrl: 'https://services.socialsecurity.be/REST/oauth/v5/token',
  clientId: process.env.DIMONA_CLIENT_ID!,
  // Fix Vercel: env vars with newlines get stored as literal \n
  get privateKey() {
    return (process.env.DIMONA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  },
  get certificate() {
    return (process.env.DIMONA_CERTIFICATE || '').replace(/\\n/g, '\n');
  },

  // API
  baseUrl: process.env.DIMONA_API_URL || 'https://services.socialsecurity.be/REST/dimona/v2',

  // Employer
  enterpriseNumber: process.env.DIMONA_ENTERPRISE_NUMBER || '1009237290',

  // Retry config (from ONSS documentation)
  retry: {
    initialWaitMs: 2000,
    pollIntervalMs: 1000,
    maxPollTimeMs: 30000,
  },
};

// --- Token cache ---
let cachedToken: DimonaToken | null = null;

function createJwtAssertion(): string {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: DIMONA_CONFIG.clientId,
    sub: DIMONA_CONFIG.clientId,
    aud: 'https://services.socialsecurity.be/REST/oauth/v5/token',
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 300,
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

async function getToken(): Promise<string> {
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
  cachedToken = { ...data, obtained_at: Date.now() };

  return cachedToken!.access_token;
}

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
    const location = response.headers.get('Location');
    if (location) {
      const id = parseInt(location.split('/').pop() || '');
      if (!isNaN(id)) return id;
    }
    try {
      const body = await response.json();
      if (body?.declarationStatus?.declarationId) {
        return body.declarationStatus.declarationId;
      }
    } catch { /* ignore */ }
    throw new Error('Dimona 201 but no declarationId found');
  }

  if (response.status === 400) {
    const body = await response.json().catch(() => null);
    throw new Error(`Dimona validation error 400: ${JSON.stringify(body)}`);
  }

  const text = await response.text();
  throw new Error(`Dimona API error ${response.status}: ${text}`);
}

async function pollDeclarationResult(declarationId: number): Promise<DimonaDeclarationResponse> {
  const token = await getToken();
  const { initialWaitMs, pollIntervalMs, maxPollTimeMs } = DIMONA_CONFIG.retry;

  await sleep(initialWaitMs);

  const startTime = Date.now();

  while (Date.now() - startTime < maxPollTimeMs) {
    const response = await fetch(`${DIMONA_CONFIG.baseUrl}/declarations/${declarationId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (response.status === 200) {
      const data: DimonaDeclarationResponse = await response.json();
      if (data.declarationStatus?.result) {
        return data;
      }
    }

    if (response.status === 404) {
      await sleep(pollIntervalMs);
      continue;
    }

    const text = await response.text();
    throw new Error(`Dimona GET error ${response.status}: ${text}`);
  }

  throw new Error(`Dimona ${declarationId}: timeout after ${maxPollTimeMs}ms`);
}

// --- Public API ---

export async function sendDimonaIn(
  workerNiss: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<DimonaResult> {
  try {
    const payload: DimonaInPayload = {
      employer: { enterpriseNumber: DIMONA_CONFIG.enterpriseNumber },
      worker: { ssin: cleanNiss(workerNiss) },
      dimonaIn: {
        startDate: date,
        startHour: formatHour(startTime),
        endDate: date,
        endHour: formatHour(endTime),
        features: { workerType: 'FLX', jointCommissionNumber: 'XXX' },
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
    return { success: false, error: error.message };
  }
}

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
    return { success: false, error: error.message };
  }
}

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
    return { success: false, error: error.message };
  }
}

// --- Utilities ---

function cleanNiss(niss: string): string {
  return niss.replace(/[\.\-\s]/g, '');
}

function formatHour(time: string): string {
  return time.replace(/[:.]/g, '').slice(0, 4);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
