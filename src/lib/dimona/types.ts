// ============================================================
// Dimona API v2 - Types
// ============================================================

// --- OAuth ---
export interface DimonaToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  obtained_at: number; // Date.now() when token was obtained
}

// --- API Request Types ---

export interface DimonaEmployer {
  enterpriseNumber: string; // BCE number without dots: "1009237290"
}

export interface DimonaWorker {
  ssin: string; // NISS without dots/dashes: "95041448452"
}

export interface DimonaFeatures {
  workerType: 'FLX';
  jointCommissionNumber: 'XXX'; // Convention Dimona for horeca flexi
}

export interface DimonaInPayload {
  employer: DimonaEmployer;
  worker: DimonaWorker;
  dimonaIn: {
    startDate: string;  // "2026-02-21"
    startHour: string;  // "1700" (HHMM format, no colon)
    endDate: string;
    endHour: string;
    features: DimonaFeatures;
  };
}

export interface DimonaCancelPayload {
  dimonaCancel: {
    periodId: number;
  };
}

export interface DimonaUpdatePayload {
  dimonaUpdate: {
    periodId: number;
    startDate?: string;
    startHour?: string;
    endDate?: string;
    endHour?: string;
  };
}

// --- API Response Types ---

export interface DimonaAnomaly {
  code: string;
  descriptionFr: string;
  descriptionNl: string;
}

export interface DimonaDeclarationStatus {
  declarationId: number;
  result?: 'A' | 'W' | 'B' | 'S'; // Accepted, Warning, Blocked/Refused, Sigedis pending
  anomalies?: DimonaAnomaly[];
  period?: {
    href: string;
    id: number;
  };
}

export interface DimonaDeclarationResponse {
  employer: {
    employerId: number;
    enterpriseNumber: string;
  };
  worker: {
    ssin: string;
    familyName: string;
    givenName: string;
    birthDate: string;
    nationality: number;
    gender: string;
  };
  declarationStatus: DimonaDeclarationStatus;
  dimonaIn?: Record<string, any>;
  dimonaCancel?: Record<string, any>;
  dimonaUpdate?: Record<string, any>;
}

// --- Internal types for FritOS ---

export type DimonaAction = 'IN' | 'CANCEL' | 'UPDATE';

export interface DimonaResult {
  success: boolean;
  declarationId?: number;
  periodId?: number;
  result?: 'A' | 'W' | 'B' | 'S';
  anomalies?: DimonaAnomaly[];
  error?: string;
}
