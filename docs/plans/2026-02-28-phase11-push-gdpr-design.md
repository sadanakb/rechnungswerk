# Phase 11: Push Notifications + GDPR-Controls Design

**Date:** 2026-02-28
**Status:** Approved
**Author:** Brainstorming session

---

## Ziel

Firebase FCM Web Push Notifications (4 Trigger) + vollständige DSGVO-Controls (Datenexport Art. 20, Account-Löschung Art. 17, Datenschutzseite) direkt in RechnungsWerk.

---

## Entscheidungen

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Push-Provider | Firebase FCM | Marktstandard, alle Browser + iOS Safari, firebase-admin 20 Zeilen Python |
| Push-Granularität | Per User (nicht per Org) | Jeder Nutzer entscheidet selbst |
| GDPR-Export | Sync-Download (ZIP) | KMU-Volumen reicht, kein ARQ nötig |
| Account-Löschung | 2-Schritt mit E-Mail-Token | Art. 17 konform, verhindert versehentliches Löschen |
| Datenschutzseite | Statische Marketing-Page /datenschutz | Kein Backend nötig |

---

## Architektur

### Backend — neue Dateien

**`backend/app/push_service.py`** — Firebase Admin SDK Wrapper:
```
init_firebase_app()
send_push(fcm_token, title, body, data={}) -> bool
notify_user(user_id, title, body, db) -> None  ← holt alle Tokens für User
```

**`backend/app/routers/push.py`** — FastAPI Router:
```
POST   /api/push/subscribe     → { fcm_token, device_label }
DELETE /api/push/unsubscribe   → 204
GET    /api/push/status        → { subscribed: bool, devices: [...] }
```

**`backend/app/routers/gdpr.py`** — FastAPI Router:
```
GET    /api/gdpr/export            → StreamingResponse (application/zip)
POST   /api/gdpr/request-delete    → 200 OK (sendet Bestätigungs-E-Mail)
DELETE /api/gdpr/confirm-delete?token=...  → 200 OK (löscht alles)
```

**`backend/alembic/versions/phase11_push_gdpr.py`** — Migration:
```
push_subscriptions: id, user_id (FK), fcm_token VARCHAR(500), device_label VARCHAR(100), created_at
gdpr_delete_requests: id, user_id (FK), token VARCHAR(64) UNIQUE, expires_at, created_at
```

### Push Trigger-Integration

| Trigger | Datei | Änderung |
|---|---|---|
| Überfällige Rechnungen | `backend/app/tasks/cron.py` | Neuer ARQ-Cron-Job `send_overdue_push` täglich 08:00 |
| Zahlung eingegangen | `backend/app/routers/invoices.py` | Nach Status-Update auf "paid" → `notify_user()` |
| Mahnung fällig | `backend/app/routers/mahnwesen.py` | Bei neuer Mahnstufe → `notify_user()` |
| OCR abgeschlossen | `backend/app/tasks/ocr.py` | Am Ende → `notify_user()` |

### Frontend — neue/geänderte Dateien

**`frontend/public/firebase-messaging-sw.js`** — ServiceWorker:
- Registriert FCM
- Empfängt Background-Push
- Zeigt Browser-Notification mit Icon + Click-Handler

**`frontend/app/(dashboard)/settings/page.tsx`** — Modify:
- Neuer "Datenschutz & GDPR" Tab
- "Push aktivieren" Button → Permission-Dialog → Token senden
- "Daten exportieren" Button → GET /api/gdpr/export
- "Account löschen" Button → POST /api/gdpr/request-delete (mit Bestätigungs-Dialog)

**`frontend/app/(marketing)/datenschutz/page.tsx`** — Neue Seite:
- Statischer Content: Verantwortlicher, Datenarten, Aufbewahrungsfristen, Rechte (Art. 15-22)
- Link im Footer

---

## GDPR Datenfluss

### Datenexport
```
User klickt "Daten exportieren"
  → GET /api/gdpr/export
  → Auth: JWT Bearer
  → Sammelt: invoices (CSV), contacts (CSV), organisation (JSON), user-profil (JSON)
  → zipfile.ZipFile in memory → BytesIO
  → StreamingResponse(application/zip)
  → Browser speichert als "RechnungsWerk_Datenexport_2026-02-28.zip"
```

### Account-Löschung
```
User klickt "Account löschen" → Bestätigungs-Dialog im Frontend
  → POST /api/gdpr/request-delete
  → Erstellt GdprDeleteRequest(token=secrets.token_hex(32), expires_at=now+24h)
  → Sendet E-Mail: "Klicke hier um dein Konto zu löschen" (Link mit Token)

User klickt Link in E-Mail
  → DELETE /api/gdpr/confirm-delete?token=<hex>
  → Validiert Token (existiert + nicht abgelaufen)
  → Löscht: push_subscriptions, gdpr_delete_requests, invoice_share_links, organization_members, invoices, contacts, user
  → Returns: { message: "Account gelöscht" }
```

---

## Test-Coverage

### `tests/test_push.py` (5 Tests)
| Test | Was wird geprüft |
|---|---|
| `test_subscribe_saves_token` | POST /subscribe speichert FCM-Token in DB |
| `test_subscribe_duplicate_token` | Zweites Subscribe mit gleichem Token → 200 (kein Duplikat) |
| `test_unsubscribe_removes_token` | DELETE /unsubscribe entfernt Token |
| `test_status_returns_subscribed` | GET /status: subscribed=True wenn Token vorhanden |
| `test_push_service_send` | `send_push()` mit Mock → firebase_admin.messaging.send() wird aufgerufen |

### `tests/test_gdpr.py` (6 Tests)
| Test | Was wird geprüft |
|---|---|
| `test_export_zip_contains_four_files` | ZIP hat rechnungen.csv, kontakte.csv, organisation.json, profil.json |
| `test_export_invoices_in_csv` | Rechnungsdaten korrekt im CSV |
| `test_request_delete_sends_email` | POST /request-delete → E-Mail mit Token gesendet |
| `test_confirm_delete_with_valid_token` | DELETE /confirm-delete?token=... → 200, User weg |
| `test_confirm_delete_with_expired_token` | Abgelaufener Token → 400 |
| `test_confirm_delete_with_invalid_token` | Ungültiger Token → 404 |

---

## Task-Übersicht (für Implementation Plan)

| # | Task | Dateien |
|---|---|---|
| 1 | Alembic Migration (push_subscriptions + gdpr_delete_requests) | `models.py`, `alembic/phase11_push_gdpr.py` |
| 2 | Firebase Push Service (push_service.py) + Push Router | `push_service.py`, `routers/push.py`, Tests |
| 3 | Push Trigger Integration (4 Stellen) | `tasks/cron.py`, `routers/invoices.py`, `routers/mahnwesen.py`, `tasks/ocr.py` |
| 4 | GDPR Router (Export + Delete) | `routers/gdpr.py`, Tests |
| 5 | Backend Registration + main.py | `main.py` |
| 6 | Frontend ServiceWorker + Push Opt-in | `public/firebase-messaging-sw.js`, `settings/page.tsx` |
| 7 | Frontend GDPR Controls + Datenschutzseite | `settings/page.tsx`, `datenschutz/page.tsx` |
| 8 | Final Verification + Changelog v1.1.0 + Merge | Changelog, Tests, Merge |
