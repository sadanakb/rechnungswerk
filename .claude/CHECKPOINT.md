# Checkpoint — 2026-02-28

## Ziel
RechnungsWerk — production-ready German e-invoicing SaaS, alle Phasen 1-10 abgeschlossen.

## Erledigt
- [x] Phase 1: Marktreife (Multi-Tenant Auth, Landing Page, Stripe, PWA, MDX Blog)
- [x] Phase 2: Features + SEO (Mahnwesen, Cmd+K, TanStack Table, pSEO 10 Branchen × 16 Bundesländer)
- [x] Phase 3: Launch-Readiness (Error Boundaries, Security Headers, Alembic, Feature Gating, Glossar)
- [x] Phase 4: Completeness & Polish (Profil, Passwort-Reset, E-Mail-Verifizierung, Stripe Billing, Teams)
- [x] Phase 5: Integrations & Growth (Webhooks, API-Keys, Audit-Log, Templates, Bulk-Ops, Reports, CI/CD)
- [x] Phase 6: UX Hardening (Invoice Detail, ZUGFeRD Export, Notifications, Onboarding, PWA, Print, Filter)
- [x] Phase 7: Business Logic (Payment Status, Contacts, Sequences, Rate Limiting, CSV Import, Stats, Overdue)
- [x] Phase 8: Production Excellence + Kundenportal (ARQ, Webhook Retry, S3 Storage, Share Links, Portal, Email)
- [x] Phase 9: KI-Suite + Echtzeit (GPT-4o-mini, WebSocket, Chat-Assistent, SKR03-Kategorisierung, Monatszusammenfassung)
- [x] Phase 10: DATEV-Export (EXTF v700 ZIP, SKR03-Filter, Beraternummer/Mandantennummer, Steuerberater-E-Mail)

## Entscheidungen
- Auth: get_current_user returns dict; _resolve_org_id() via OrganizationMember join
- Route-Ordering: Named routes vor /{invoice_id}
- CSS: rgb(var(--primary)) usw. — nie hardcoded Colors im Dashboard
- ARQ: Graceful degradation — arq_pool = None wenn Redis nicht verfügbar, sync fallback
- KI: GPT-4o-mini Primary (Standard), Claude Haiku (Complex/Chat), Ollama (Dev-Fallback)
- WebSocket: /ws?token=<jwt>, ConnectionManager Singleton in app/ws.py
- DATEV: Nur kategorisierte Rechnungen (skr03_account IS NOT NULL), EXTF v700 ZIP
- DATEV-Settings: datev_berater_nr, datev_mandant_nr, steuerberater_email auf Organization-Model
- DATEV-Router: GET /api/datev/export + POST /api/datev/send-email (backend/app/routers/datev.py)
- DATEV-Migration: Revision d9e5g1h2i3j4, down_revision c8d4f0e5a3b2

## Build/Test-Status
- Backend: 446+ Tests bestanden, 0 Fehler
- Frontend: 114 Seiten gebaut, 0 TypeScript-Fehler
- Master: latest — Phase 10 gemergt

## Neue Dateien Phase 10
- backend/app/routers/datev.py — GET /export, POST /send-email
- backend/alembic/versions/phase10_datev_settings.py — 3 neue Org-Spalten
- backend/tests/test_datev_formatter.py — 7 tests
- backend/tests/test_datev_settings_api.py — 3 tests
- backend/tests/test_datev_export_endpoint.py — 4 tests

## Naechster Schritt
Phase 11 planen falls gewünscht. Mögliche Themen:
- Push Notifications (Firebase Web Push)
- GDPR Data Controls (Export, Löschung, Consent)
- OAuth Integration Marketplace (Zapier, n8n)
- Advanced Analytics (Prognosen, ML)
