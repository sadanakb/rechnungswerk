# Contributing to RechnungsWerk

Vielen Dank fuer dein Interesse an RechnungsWerk!

## Lizenz

Dieses Projekt steht unter der AGPL-3.0 Lizenz. Durch das Einreichen von Beitraegen stimmst du zu, dass dein Code unter dieser Lizenz veroeffentlicht wird.

## Wie du beitragen kannst

1. Fork das Repository
2. Erstelle einen Feature Branch (`git checkout -b feature/mein-feature`)
3. Committe deine Aenderungen (`git commit -m 'feat: beschreibung'`)
4. Push zum Branch (`git push origin feature/mein-feature`)
5. Oeffne einen Pull Request

## Code Style

- Backend: Python — Ruff Linting (E, W, F rules)
- Frontend: TypeScript — ESLint
- Commits: Conventional Commits (feat:, fix:, chore:, docs:)

## Tests

Stelle sicher, dass alle Tests bestehen:

```bash
# Backend
cd backend && pytest tests/ -q

# Frontend
cd frontend && npx vitest run
```
