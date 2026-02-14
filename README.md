# FritOS Flexi — Module Gestion Flexi-Jobs

Module de gestion des travailleurs flexi-job pour les friteries MDjambo (Jurbise & Boussu).  
Intégré dans l'écosystème FritOS existant (Next.js + Supabase + TypeScript).

## Stack

- **Frontend** : Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend** : Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Déploiement** : Vercel (frontend) + Supabase Cloud (backend)

## Architecture

```
src/
├── app/
│   ├── flexi/                    # Portail flexi workers (mobile-first)
│   │   ├── login/                # Connexion email/password
│   │   ├── account/              # Profil complet + NISS, IBAN, etc.
│   │   ├── availability/         # Calendrier mensuel de disponibilités
│   │   ├── missions/             # Shifts proposés → accepter/refuser
│   │   ├── planning/             # Planning des shifts acceptés
│   │   └── clock/                # Pointage IN/OUT avec géolocalisation
│   ├── dashboard/flexis/         # Dashboard manager
│   │   ├── planning/             # Grille semaine × locations
│   │   ├── workers/              # CRUD workers + alertes plafond
│   │   ├── live/                 # Dashboard temps réel (Realtime)
│   │   ├── validation/           # Validation des heures pointées
│   │   ├── dimona/               # Déclarations ONSS semi-auto
│   │   └── export/               # Export CSV pour Partena Professional
│   └── pointage/[token]/         # Redirect QR code → pointage
├── components/
│   ├── flexi/                    # Composants portail flexi
│   └── dashboard/                # Composants dashboard manager
├── hooks/                        # useAuth, useRealtimeEntries
├── lib/
│   ├── supabase/                 # Client, Server, Middleware
│   └── actions/                  # Server Actions (workers, shifts, clock, dimona, export)
├── types/                        # Types TS + types DB Supabase
├── utils/                        # Calculs coûts, géoloc, validation, dates fériées
└── middleware.ts                 # Protection routes + auth
supabase/
└── migrations/
    └── 001_init_flexi.sql        # Migration complète (tables, triggers, RLS, vues, seed)
```

## Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer les variables d'environnement
cp .env.local.example .env.local
# Remplir NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 3. Appliquer la migration Supabase
# Via le dashboard Supabase (SQL Editor) : coller le contenu de supabase/migrations/001_init_flexi.sql
# Ou via la CLI Supabase : supabase db push

# 4. Lancer le dev server
npm run dev
```

## Réglementation

- **CP 302** (Horeca) — Flexi-job
- Salaire minimum : 12,53 €/h (→ 12,78 €/h au 01/03/2026)
- Cotisation patronale : 28%
- Plafond annuel : 18 000 € (non-pensionnés)
- Dimona obligatoire avant chaque prestation
- Type travailleur : FLX

## Calcul des coûts

```
base_salary       = heures × taux_horaire
sunday_premium    = dimanche/férié ? min(heures × 2€, 12€) : 0
total_salary      = base_salary + sunday_premium
employer_contrib  = total_salary × 0.28
total_cost        = total_salary + employer_contrib
nowjobs_equiv     = heures × 21.11€
économie          = nowjobs_equiv - total_cost
```

## Phases

| Phase | Contenu | Statut |
|-------|---------|--------|
| **Phase 1 — MVP** | Tables, Auth, Portail flexi, Dashboard, Pointage QR, Dimona semi-auto, Export CSV | ✅ Code prêt |
| **Phase 2** | API Dimona ONSS, SMS (Twilio), Dispos récurrentes, Alertes 18k€ auto | Préparé |
| **Phase 3** | Analytics avancé, Auto-matching dispos/shifts, Multi-location, DmfA | Planifié |
