# Checkpoint — 2026-03-08

## Ziel
Credit Notes (Gutschriften) — full stack implementation

## Erledigt
- [x] CreditNote model + Alembic migration
- [x] Pydantic schemas (Create, Response, Detail, List)
- [x] XRechnung CreditNote XML generator (correct CreditNote namespace, no DueDate)
- [x] ZUGFeRD CreditNote PDF generator (GUTSCHRIFT template)
- [x] Backend router (5 endpoints) + main.py registration
- [x] DATEV export with H (Haben) for credit notes
- [x] 14 tests (XML, API, DATEV) — all passing
- [x] Frontend: API types, list page, detail page, create modal, sidebar nav

## Build/Test-Status
- Tests: 70/70 passed (no regressions)
- TypeScript: 0 errors in new code
