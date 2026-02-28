# Checkpoint — 2026-02-28

## Ziel
RechnungsWerk — production-ready German e-invoicing SaaS, alle Phasen 1-11 abgeschlossen.

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
- [x] Phase 11: Push Notifications + GDPR (Firebase FCM, 4 Trigger, DSGVO-Export Art.20, Account-Löschung Art.17, /datenschutz)

## Entscheidungen
- Auth: get_current_user returns dict; _resolve_org_id() via OrganizationMember join
- Route-Ordering: Named routes vor /{invoice_id}
- CSS: rgb(var(--primary)) usw. — nie hardcoded Colors im Dashboard
- ARQ: Graceful degradation — arq_pool = None wenn Redis nicht verfügbar, sync fallback
- KI: GPT-4o-mini Primary (Standard), Claude Haiku (Complex/Chat), Ollama (Dev-Fallback)
- WebSocket: /ws?token=<jwt>, ConnectionManager Singleton in app/ws.py
- DATEV: Nur kategorisierte Rechnungen (skr03_account IS NOT NULL), EXTF v700 ZIP
- Push: Firebase FCM via firebase-admin SDK, FIREBASE_SERVICE_ACCOUNT_JSON env var
- Push-Subscriptions: UniqueConstraint(user_id, fcm_token), backref org_push_subscriptions
- GDPR: 2-step deletion (request token → email → confirm), sync ZIP export, FK-safe cascade
- GDPR-Migration: Revision e0f6h2i3j4k5, down_revision d9e5g1h2i3j4

## Build/Test-Status
- Backend: 479+ Tests bestanden, 0 Fehler
- Frontend: 115+ Seiten gebaut, 0 TypeScript-Fehler
- Master: latest — Phase 11 gemergt

## Neue Dateien Phase 11
- backend/app/push_service.py — Firebase Admin SDK Wrapper
- backend/app/routers/push.py — subscribe/unsubscribe/status
- backend/app/routers/gdpr.py — export/request-delete/confirm-delete
- backend/app/tasks/push_cron.py — täglicher Cron für überfällige Rechnungen
- backend/alembic/versions/phase11_push_gdpr.py — push_subscriptions + gdpr_delete_requests
- backend/tests/test_phase11_migration.py — 6 Tests
- backend/tests/test_push.py — 6 Tests
- backend/tests/test_push_triggers.py — 8 Tests
- backend/tests/test_gdpr.py — 6 Tests
- frontend/public/firebase-messaging-sw.js — ServiceWorker
- frontend/app/(marketing)/datenschutz/page.tsx — Datenschutzerklärung

## Naechster Schritt
Phase 12 planen falls gewünscht. Mögliche Themen:
- OAuth Integration Marketplace (Zapier, n8n)
- Advanced Analytics (Prognosen, ML)
- Kunden-Portal (Self-Service für Rechnungsempfänger)
