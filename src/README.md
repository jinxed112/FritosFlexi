# Dimona API Integration - FritOS Flexi

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FritOS Dashboard                       │
│                                                           │
│  Planning → Worker accepte shift                          │
│       │                                                   │
│       ▼                                                   │
│  CRON 20h (veille) ──────┐                               │
│       │                   │                               │
│  Manager "Déclarer" ──┐   │                               │
│                        ▼  ▼                               │
│              /api/dimona                                   │
│                   │                                       │
│                   ▼                                       │
│          lib/dimona/service.ts                            │
│           │          │                                    │
│           ▼          ▼                                    │
│     OAuth Token   POST /declarations                     │
│     (JWT+RS256)        │                                 │
│                        ▼                                 │
│                 GET /declarations/{id}                    │
│                 (poll 2-30s)                              │
│                        │                                 │
│                        ▼                                 │
│              Supabase: dimona_declarations                │
│              (store periodId for Cancel/Update)           │
└─────────────────────────────────────────────────────────┘
```

## Scénarios gérés

### 1. Shift confirmé → Dimona-In
**Quand :** CRON la veille à 20h OU manuellement par le manager
**Déclencheur :** Shift en statut `accepted` pour demain, sans Dimona-In existante
**API :** `POST /declarations` avec bloc `dimonaIn`
**Résultat :** `periodId` stocké en DB pour Cancel/Update ultérieur

### 2. Worker annule le shift → Dimona-Cancel
**Quand :** Le worker refuse ou le manager annule APRÈS la Dimona-In
**Déclencheur :** Action manager "Annuler Dimona"
**API :** `POST /declarations` avec bloc `dimonaCancel` + `periodId`
**Résultat :** Période annulée à l'ONSS, shift marqué `cancelled`

### 3. Worker ne se présente pas → Dimona-Cancel (no-show)
**Quand :** Le worker n'a pas pointé 30 min après le début du shift
**Déclencheur :** Action manager "No-show" sur le dashboard Live
**API :** `POST /declarations` avec bloc `dimonaCancel` + `periodId`
**Résultat :** Identique au Cancel, avec raison "no_show" dans les notes

### 4. Horaires modifiés → Dimona-Update  
**Quand :** Le worker reste plus longtemps ou part plus tôt que prévu
**Déclencheur :** Validation des heures avec différence significative
**API :** `POST /declarations` avec bloc `dimonaUpdate` + `periodId` + nouvelles heures
**Résultat :** Période mise à jour à l'ONSS

## Fichiers

| Fichier | Rôle |
|---|---|
| `lib/dimona/types.ts` | Types TypeScript pour l'API Dimona |
| `lib/dimona/service.ts` | OAuth JWT + POST/GET/Poll Dimona ONSS |
| `lib/dimona/actions.ts` | Server actions : declare, cancel, update, cron |
| `app/api/dimona/route.ts` | API route pour le dashboard manager |
| `app/api/cron/dimona/route.ts` | CRON Vercel : Dimona auto la veille à 20h |
| `006_dimona_api_integration.sql` | Migration SQL (status, periodId, indexes) |

## Variables d'environnement

```bash
DIMONA_CLIENT_ID=self_service_chaman_305369_32a2ocupdo
DIMONA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
DIMONA_CERTIFICATE="-----BEGIN CERTIFICATE-----\n..."
DIMONA_ENTERPRISE_NUMBER=1009237290
DIMONA_API_URL=https://services.socialsecurity.be/REST/dimona/v2
CRON_SECRET=<random-secret>
```

## Format API ONSS - Rappel

```json
// Dimona-In (flexi-job)
{
  "employer": { "enterpriseNumber": "1009237290" },
  "worker": { "ssin": "95041448452" },
  "dimonaIn": {
    "startDate": "2026-02-21",
    "startHour": "1700",
    "endDate": "2026-02-21",
    "endHour": "2130",
    "features": {
      "workerType": "FLX",
      "jointCommissionNumber": "XXX"
    }
  }
}

// Dimona-Cancel
{ "dimonaCancel": { "periodId": 658690837083 } }

// Dimona-Update
{
  "dimonaUpdate": {
    "periodId": 658690837083,
    "startDate": "2026-02-21",
    "startHour": "1700",
    "endDate": "2026-02-21",
    "endHour": "2230"
  }
}
```

## Timing / Polling ONSS

| Délai après POST | Fréquence de GET |
|---|---|
| 0-2 secondes | Pas d'appel |
| 2-30 secondes | Toutes les 1 seconde |
| > 30 secondes | Toutes les 1 minute |
| > 20 minutes | Relance manuelle |

## Résultat declaration

| Code | Signification |
|---|---|
| `A` | Acceptée ✅ |
| `W` | Acceptée avec warnings ⚠️ |
| `B` | Refusée ❌ (voir anomalies) |
| `S` | En attente d'identification Sigedis ⏳ |

## Vercel Cron

Ajouter dans `vercel.json` :
```json
{ "crons": [{ "path": "/api/cron/dimona", "schedule": "0 19 * * *" }] }
```

→ Exécuté chaque jour à 19h UTC = **20h CET** (heure belge hiver) / **21h CEST** (été)
