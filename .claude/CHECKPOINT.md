# Checkpoint — 2026-03-09

## Ziel
Visuelles Redesign von RechnungsWerk: Design System, Farben, Typografie, Spacing als Fundament (R1). Keine funktionalen Aenderungen, nur CSS/Layout/Komponenten-Struktur.

## Erledigt
- [x] R1: Design System komplett umgestellt — Farbschema von kaltem Teal+Slate zu warmem Lime+Stone (Dateien: frontend/app/globals.css, frontend/components/design-system/tokens.ts)
  - Light Theme: --background warm off-white, --primary lime-500, --border stone-200, alle Neutrals auf Stone-Palette
  - Dark Theme: --background stone-900 (warm statt navy), --primary lime-500, alle Neutrals auf Stone-Palette
  - Radius vergroessert: 0.75rem -> 1rem (--radius), 0.375rem -> 0.5rem (--radius-sm), 1rem -> 1.25rem (--radius-lg)
  - Shadows weicher: weniger Spread, subtilere Opacity
  - tokens.ts: primary von Teal auf Lime, gray von Slate auf Stone, accent von Emerald auf Green
- [x] Build verifiziert: npm run build laeuft fehlerfrei

## Offen
- [ ] R2-Rn: Weitere Redesign-Tasks (Sidebar, Dashboard, einzelne Seiten) — noch nicht spezifiziert
- [ ] Geist Font ist bereits korrekt konfiguriert (GeistSans + GeistMono in layout.tsx) — keine Aenderung noetig

## Entscheidungen
- Lime-500 als Primary statt Teal: Frischer, moderner Look wie Dreelio/Nexon-Stil
- Stone statt Slate fuer Neutrals: Waermerer Grundton, weniger "kalt-technisch"
- Primary-foreground dunkel (23 23 23) statt weiss: Bessere Lesbarkeit auf Lime-Hintergrund
- Sidebar active text lime-700 (dunkel): Bessere Lesbarkeit als lime-500

## Build/Test-Status
- Build: OK (alle Seiten kompilieren fehlerfrei)
- Tests: nicht explizit gelaufen (nur Build)
- Letzter Commit: 3a0229c Task 9: Hetzner VPS Deployment vorbereiten (Aenderungen noch nicht committet)

## Naechster Schritt
Auf naechsten Redesign-Task vom User warten (z.B. R2: Sidebar-Redesign, Dashboard-Layout, etc.). Alle CSS-Variablen-Aenderungen wirken bereits global — jede Komponente die rgb(var(--primary)) etc. nutzt zeigt automatisch das neue Farbschema.
