# Checkpoint — 2026-03-02 18:50

## Ziel
Phase 16: Security Deep Fix + Stability — 10 neue Security-Findings schliessen

## Erledigt
- [x] Step 1: Shared SSRF validator (Dateien: backend/app/utils/network.py, backend/app/utils/__init__.py, backend/app/routers/email.py)
- [x] Step 2: Webhook SSRF CRITICAL fix (Dateien: backend/app/routers/webhooks.py, backend/app/webhook_service.py)
- [x] Step 3: Team invite email binding CRITICAL (Dateien: backend/app/routers/teams.py:319-325)
- [x] Step 4: API-Key scope format fix HIGH (Dateien: backend/app/routers/api_keys.py, backend/app/auth_jwt.py)
- [x] Step 5: Pin bcrypt deps HIGH (Dateien: backend/requirements.txt, backend/app/auth_jwt.py)
- [x] Step 6: Health endpoint split HIGH (Dateien: backend/app/routers/health.py — /health/live, /health/ready, /health)
- [x] Step 7: Batch OCR limits MEDIUM (Dateien: backend/app/routers/invoices.py — 20 files, 50MB total)
- [x] Step 8: Password policy MEDIUM (Dateien: backend/app/schemas_auth.py, backend/app/routers/auth.py)
- [x] Step 9: Webhook rate limits MEDIUM (Dateien: backend/app/routers/webhooks.py — 5/min create+test)
- [x] Step 10: WebSocket token deprecation MEDIUM (Dateien: backend/app/main.py, frontend/contexts/WebSocketContext.tsx)
- [x] Test fixes: test_api_keys.py scope format, test_webhooks.py SSRF mock + rate limiter
- [x] Frontend Tests: 77/77 passed
- [x] Frontend ESLint: 0 errors, 15 warnings (pre-existing)

## Offen
- [ ] Full backend test suite (running)

## Entscheidungen
- Webhook limiter switched from local to shared app.rate_limiter.limiter
- Empty scopes on keys created after 2026-03-01 = deny (old keys = warn + allow)
- WebSocket: first-message auth as default, query-param as deprecated fallback
- Health: tesseract version, model names, invoice counts removed from response

## Build/Test-Status
- Frontend: 77/77 tests, 0 errors lint
- Backend: Full suite running (previously 499 passed + 5 webhook fixes)

## Naechster Schritt
Wait for full test suite, then commit
