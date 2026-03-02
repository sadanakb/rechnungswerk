# Checkpoint — 2026-03-01 23:55

## Ziel
Phase 14: Security Deep Fix + Stability — 25 Issues aus Audit-Liste in 4 Batches abarbeiten.

## Erledigt
- [x] CRITICAL: Tenant-Isolation Invoice-Endpunkte — war bereits in Phase 13 gefixt (7 Stellen mit ensure_invoice_belongs_to_org)
- [x] CRITICAL: IMAP-Inbox-Processor Auth — JWT auth zu beiden Endpoints hinzugefuegt + 2 neue Auth-Tests (Dateien: backend/app/routers/email.py, backend/tests/test_email_router.py)
- [x] CRITICAL: GDPR-Delete kontrollierte User-Deprovisionierung — loescht nur User-Daten wenn andere Org-Mitglieder existieren, Token von Query-String zu X-Delete-Token Header verschoben mit Fallback (Dateien: backend/app/routers/gdpr.py)
- [x] CRITICAL: API-Key Architektur — neue get_org_from_api_key Dependency erstellt (DB-Key Lookup per Prefix + bcrypt verify), External API nutzt jetzt org_id aus API-Key statt client Query-Parameter (Dateien: backend/app/auth_jwt.py, backend/app/routers/external_api.py)
- [x] HIGH: Mahnwesen Org-Ownership-Check — ensure_invoice_belongs_to_org hinzugefuegt (Dateien: backend/app/routers/mahnwesen.py)
- [x] HIGH: WebSocket Token-Typ-Check — payload.type == "access" Pruefung hinzugefuegt (Dateien: backend/app/main.py)
- [x] HIGH: Frontend WS Token-Key + Port — rw-token zu rw-access-token, localhost:8000 zu localhost:8001 (Dateien: frontend/lib/api.ts, frontend/contexts/WebSocketContext.tsx, frontend/app/portal/[token]/page.tsx)
- [x] HIGH: Dev-Mode user_id="dev-user" — geaendert zu "0" damit int() Casts nicht brechen, plus Referenzen in notifications.py und contacts.py angepasst (Dateien: backend/app/auth_jwt.py, backend/app/routers/notifications.py, backend/app/routers/contacts.py, backend/app/routers/invoices.py)
- [x] HIGH: Suppliers + RecurringInvoice org_id — organization_id Column hinzugefuegt (nullable=True), Router von verify_api_key auf get_current_user umgestellt, Org-Filterung + Ownership-Checks (Dateien: backend/app/models.py, backend/app/routers/suppliers.py, backend/app/routers/recurring.py)
- [x] MEDIUM: Legacy O(n) Token-Fallback entfernt — nur noch SHA256 Lookup (Dateien: backend/app/routers/auth.py)
- [x] MEDIUM: Rate-Limits auf reset-password/verify-email — 5/minute (Dateien: backend/app/routers/auth.py)
- [x] MEDIUM: API-Key Logging maskiert — nur noch **** geloggt (Dateien: backend/app/main.py)
- [x] MEDIUM: Globales Rate-Limit erhoeht — 200/min auf 600/min (Dateien: backend/app/rate_limiter.py)
- [x] MEDIUM: Honeypot + Rate-Limit auf contact/newsletter — website Honeypot-Feld + 3/minute (Dateien: backend/app/routers/contact.py, backend/app/routers/newsletter.py)
- [x] MEDIUM: CommandPalette A11y — DialogTitle + DialogDescription hinzugefuegt (Dateien: frontend/components/CommandPalette.tsx)

## Offen
- [ ] NIEDRIG: Sidebar-Tooltip overflow fix (SidebarNav.tsx:178,266) — collapsed Tooltip ausserhalb Container
- [ ] ESLint Flat Config Migration (package.json) — ESLint 10 erwartet eslint.config.js statt .eslintrc
- [ ] E2E-Test settings.spec.ts strict-mode locator fix (text=Einstellungen ambig)
- [ ] Team-Invite-Token persistieren/verifizieren (teams.py:153) — Token wird generiert aber nicht in DB gespeichert
- [ ] Full Backend Test Suite laeuft gerade (501+ Tests, nach allen Fixes)
- [ ] Git Commit fuer Phase 14 erstellen

## Entscheidungen
- Dev-Mode user_id von "dev-user" auf "0" geaendert: Behebt 30+ int() Cast-Fehler systemisch statt jede Stelle einzeln zu fixen
- get_org_from_api_key: Prefix-basierter DB-Lookup (O(1)) + bcrypt verify fuer DB-backed API Keys
- GDPR Delete: Sole-member loescht alles, Multi-member loescht nur User + transferiert Owner-Rolle
- GDPR Token: Header praeferred (X-Delete-Token), Query-Fallback fuer Backward-Compat (Email-Links)
- Supplier/RecurringInvoice org_id nullable=True: Backward-Compat mit bestehenden Daten
- External API: org_id wird jetzt aus dem API-Key abgeleitet, nicht mehr vom Client geliefert
- Rate-Limit global 600/min: War 200/min, produzierte 429 unter normaler Last; Auth-Endpoints behalten strikte 5/min

## Build/Test-Status
- Frontend Tests: 77/77 passed
- Backend Targeted Tests: 18/18 passed (portal, notifications, contacts)
- Full Backend Suite: Laeuft gerade (nach IndentationError-Fix und dev-user-Fix)
- Letzter Commit: 3d87666 security(phase13): hardening + critical bugfixes — 23 tasks
- Alle Phase-14-Aenderungen sind NICHT committed

## Naechster Schritt
1. Full Backend Test Suite Ergebnis abwarten (Task bvq10i2t9)
2. Wenn alle Tests gruen: `git add` der geaenderten Dateien + `git commit -m "security(phase14): deep security fixes + stability — 25 audit issues"`
3. Verbleibende LOW-Issues (Sidebar Tooltip, ESLint Flat Config, E2E-Test, Team-Invite-Token) in separatem Commit
4. Optional: Frontend Build pruefen (`cd frontend && npx next build`)
