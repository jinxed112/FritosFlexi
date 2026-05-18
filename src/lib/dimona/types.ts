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
  workerType: 'FLX' | 'STU';
  // Obligatoire pour FLX et STU, avec une valeur différente selon le type :
  // - FLX Horeca → 'XXX' (convention spéciale ONSS pour flexi Horeca)
  // - STU Horeca → '302' (vrai numéro de commission paritaire Horeca CP 302)
  // Omettre le champ déclenche `Bad Request: Features required`.
  // Mettre 'XXX' pour STU déclenche errorId 90374-349 (incompatibilité CP/type).
  // Source : doc ONSS REST v2 (https://www.socialsecurity.be/site_fr/employer/applics/dimona/documents/pdf/documentation-fonctionnelle-restv2_F.pdf) — exemple "jointCommissionNumber: '124'" pour CP 124 construction ; transposé '302' pour Horeca.
  jointCommissionNumber: 'XXX' | '302';
}

// FLX déclare des heures précises (startHour/endHour).
export interface DimonaInPayloadFlx {
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

// STU déclare un nombre d'heures planifiées (régime étudiant — pas d'horaire précis).
// L'ONSS rejette avec 01135-001/00777-005/00778-005 si STU envoie startHour/endHour.
export interface DimonaInPayloadStu {
  employer: DimonaEmployer;
  worker: DimonaWorker;
  dimonaIn: {
    startDate: string;
    endDate: string;
    plannedHoursNumber: number;
    features: DimonaFeatures;
  };
}

export type DimonaInPayload = DimonaInPayloadFlx | DimonaInPayloadStu;

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
