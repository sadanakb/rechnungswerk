# RechnungsWerk: Full Strategy Execution Design

**Datum:** 26. Februar 2026
**Zeitrahmen:** 3 Monate intensiv (Maerz-Juni 2026)
**Lizenz:** AGPL + Cloud Premium (Plausible-Modell)
**Hosting:** Hetzner Cloud + Coolify
**Status:** Projekt ist produktionsreif (243 Tests, 42+ API Endpoints, 9 Frontend-Seiten)

---

## 1. Strategische Ausgangslage

### Was existiert
- **Backend:** Python 3.11 + FastAPI 0.115, 27 Module, ~7.211 Zeilen
- **Frontend:** Next.js 16 + React 19 + Tailwind v4 + Radix UI, 79 Dateien, ~29.159 Zeilen
- **Tests:** 174 pytest + 69 vitest = 243 Tests (alle bestanden)
- **Features:** OCR (Surya 97.7%), XRechnung 3.0.2, ZUGFeRD, KoSIT-Validator, DATEV-Export, Fraud Detection, Recurring Invoices, Email Processing
- **KI:** Ollama qwen2.5:14b (lokal, kein API-Key)

### Was fehlt fuer Marktreife
- User Auth + Multi-Tenant
- Payment (Stripe/SEPA)
- Landing Page + Pricing
- Rechtstexte (AGB, Datenschutz, AVV)
- Production Deployment
- SEO + Marketing
- Mahnwesen
- Banking-Anbindung

### Wettbewerbsposition (First Mover)
**Kein Open-Source E-Invoicing SaaS existiert in Deutschland.** Alle OSS-Alternativen sind Developer-Libraries (Mustang, Konik) oder Desktop-Tools (ZUGFeRD-Manager). RechnungsWerk waere das erste.

---

## 2. Tech-Stack Upgrades (Maerz 2026)

| Bereich | Aktuell | Upgrade | Begruendung |
|---------|---------|---------|-------------|
| **Auth** | Custom JWT (inaktiv) | **Better Auth** | Native Multi-Tenancy (Organizations/Teams), MFA, Type Safety, kostenlos, OSS. Auth.js ist jetzt Teil von Better Auth. Lucia ist deprecated. |
| **FastAPI** | 0.115 | **0.133.x** | Security-Fixes, JSON Content-Type Enforcement. Test: Frontend-API-Calls pruefen |
| **PostgreSQL** | Standard | **PostgreSQL 17** | 2x COPY-Performance, JSON_TABLE(), inkrementelle Backups |
| **SQLAlchemy** | 2.0 | **2.0.47** | Bug-Fixes, `Mapped[]` Type Annotations |
| **Radix UI** | Einzelpakete | **Unified `radix-ui` v1.4.3** | Ein Paket statt 15, keine Versionskonflikte |
| **Tailwind** | v4 | **v4.2.0** | CSS-first Config mit `@theme`, 4 neue Farb-Paletten, Webpack-Plugin |
| **Deployment** | Kein | **Coolify auf Hetzner CX22** | Git-Push-Deploy, Auto-SSL, DB-Management. 5,49 EUR/Mo |
| **Email** | Kein | **Brevo** (ehem. Sendinblue) | EU-Datenresidenz (Frankreich), DSGVO-nativ, 300 Mails/Tag kostenlos |
| **Analytics** | Kein | **PostHog Self-Hosted** | 1M Events/Mo free, Funnels, Session Replay, Feature Flags, A/B Tests |
| **Monitoring** | Kein | **Uptime Kuma + Sentry Free** | Self-Hosted + 5K Errors/Mo |
| **Payment** | Kein | **Stripe + SEPA Direct Debit** | 0,8% + 0,30 EUR bei SEPA statt 1,4% + 0,25 EUR bei Kreditkarte |
| **PWA** | Kein | **Serwist** (`@serwist/next`) | Offline-Caching, Push Notifications. Build mit `--webpack` Flag |
| **Tables** | Custom | **TanStack Table** | Server-Side Pagination, Sort, Filter, Bulk Actions |
| **Command** | Kein | **cmdk** | Cmd+K Schnellsuche fuer Rechnungen/Kunden |
| **Dashboard** | Recharts | **Tremor + Recharts** | Tremor fuer KPI-Cards, Recharts fuer Charts |

### KI-Strategie: Hybrid API statt Self-Hosted

**Kritische Erkenntnis:** Bei 100 Nutzern / 5.000 Rechnungen/Monat kostet Self-Hosted (GPU-Server) ~300-500 EUR/Mo. API kostet ~27-75 EUR/Mo. Break-Even erst bei ~200.000 Rechnungen/Mo.

| Aufgabe | Modell | Kosten/Mo (100 User) |
|---------|--------|---------------------|
| OCR-Extraktion | **Mistral OCR Batch** | ~5 EUR |
| SKR03/SKR04 Kategorisierung | **GPT-4o-mini Batch** oder **Claude Haiku 4.5 Batch** | ~2-10 EUR |
| Fraud Detection | **Claude Sonnet 4.5** (nur geflaggte) | ~5-15 EUR |
| Customer Chatbot | **Claude Haiku 4.5 + Prompt Caching** | ~10-30 EUR |
| SEO Content | **Claude Sonnet 4.5 Batch** | ~5-10 EUR |
| **Gesamt** | Multi-Provider Hybrid | **~27-75 EUR/Mo** |

**Hinweis:** Claude Max Plan (100 EUR/Mo) ist NUR fuer Web-UI/Claude Code, NICHT fuer API. Separater API-Account noetig.

**EU-Datenresidenz:** Fuer Kunden die EU-only verlangen: **Google Vertex AI Frankfurt (europe-west3)** fuer Claude API. Alternativ Self-Hosted Qwen 2.5 VL als Premium-Tier.

**Prompt Caching:** System-Prompt + Schema-Definition cachen -> 90% Kostenreduktion bei wiederholten Anfragen. Batch API + Caching = bis zu 95% Ersparnis.

### Ollama als Fallback behalten
- Self-Hosted Qwen 2.5 VL fuer Privacy-Tier (On-Premise Kunden)
- Fallback wenn APIs temporaer unavailable
- Kein GPU-Server noetig fuer Hetzner-Deployment wenn API-first

---

## 3. Frontend-Design Ueberarbeitung

### Farbpalette (Neu)

Inspiriert von 2026 B2B SaaS Trends: Deep Navy + Teal Accent

```
Primary:     Deep Navy     #0f172a (slate-900)
Surface:     Dark Blue     #1e293b (slate-800)
Card:        Elevated      #334155 (slate-700)
Accent:      Teal          #14b8a6 (teal-500)
Success:     Emerald       #10b981 (emerald-500)
Warning:     Amber         #f59e0b (amber-500)
Error:       Rose          #f43f5e (rose-500)
Text:        Light Gray    #f1f5f9 (slate-100) — nicht pure white
Text-Sec:    Muted Gray    #94a3b8 (slate-400)
```

Light Mode:
```
Background:  #f8fafc (slate-50)
Surface:     #ffffff
Card:        #ffffff mit 1px border slate-200
Accent:      #0d9488 (teal-600) — etwas dunkler fuer Kontrast
Text:        #0f172a (slate-900)
```

### Typografie

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Headline H1 | **Geist Sans** | 36-48px | 700 |
| Headline H2 | Geist Sans | 24-30px | 600 |
| Body | **Inter** | 14-16px | 400 |
| Caption | Inter | 12px | 400 |
| Monospace | **Geist Mono** | 13px | 400 |
| Dashboard Zahlen | Geist Sans | 28-36px | 700 |

### Layout-Aenderungen

1. **Dashboard**: Bento Grid Layout statt uniformes Grid. KPI-Cards oben (4), grosser Revenue-Chart (spanning 2 cols), Activity Feed rechts, Quick Actions unten
2. **Sidebar**: Glassmorphism-Effekt (backdrop-blur, semi-transparent). Collapsed: nur Icons. Expanded: Icons + Labels. Smooth 200ms Transition
3. **Invoices Table**: TanStack Table mit Sticky-Header, expandierbaren Zeilen, Inline-Status-Edit, Batch Actions Toolbar
4. **Command Palette**: cmdk mit Cmd+K. Suche nach Rechnungen, Kunden, Navigation, Quick Actions
5. **Onboarding Wizard**: 4-Schritt-Flow nach Registration (Firma -> Logo -> Integrations -> Erste Rechnung)
6. **Empty States**: Illustrationen + Primaer-CTA + Hilfe-Links statt leere Tabellen
7. **Dark Mode Default**: 45% der neuen SaaS nutzen Dark Mode als Default. Layered Grays, keine pure-black Hintergruende

### Neue Komponenten

| Komponente | Bibliothek | Zweck |
|-----------|-----------|-------|
| Command Palette | cmdk | Cmd+K Schnellsuche |
| Data Table | TanStack Table | Invoice-Listen, Kunden-Listen |
| KPI Cards | Tremor | Dashboard Metriken |
| Area/Bar Charts | Tremor + Recharts | Analytics |
| Skeleton Loader | Bestehend (verbessern) | Konsistente Loading States |
| Toast | Sonner (bestehend) | Benachrichtigungen |
| Onboarding Steps | Custom (shadcn-Patterns) | Wizard Flow |

---

## 4. Wettbewerber-Schwaechen als Chancen

### sevDesk (Marktfuehrer, 150K+ Kunden)
- **Preis:** 0-34,90 EUR/Mo (Free: 3 Rechnungen)
- **Trustpilot:** 3,8/5 — aber 16% 1-Stern-Reviews (polarisiert)
- **Schwaechen:** 2025-Migration brach historische Reports. Mobile App Regression nach Updates. E-Rechnungs-Validierung zu streng (lehnt valide Rechnungen ab)
- **Chance:** Tolerantere Validierung, transparente Preise, Open Source Vertrauen

### Lexware Office (350K+ Kunden, TUeV-geprueft)
- **Preis:** 6,90-32,90 EUR/Mo
- **Schwaeche:** XRechnung NUR im XL-Tarif (32,90 EUR) — wird ab 2027 Pflicht!
- **Chance:** XRechnung in ALLEN Tarifen — massiver Preisvorteil

### easybill (E-Commerce-Fokus)
- **Preis:** 0-45 EUR/Mo
- **Schwaeche:** Keine Mobile App, API erst ab PLUS (25 EUR)
- **Chance:** PWA + API ab Free Tier

### BuchhaltungsButler
- **Preis:** 24,95-79,95 EUR/Mo — kein Free Tier
- **Schwaeche:** Zu teuer fuer einfache Rechnungsstellung
- **Chance:** Undercut mit 9,90 EUR

### Billomat (Vertrauenskrise)
- **Schwaeche:** Support quasi nicht erreichbar. UStVA falsch berechnet. Inkasso nach Kuendigung.
- **Chance:** Zuverlaessigkeit + Open Source Transparenz als Gegenposition

### FastBill
- **Schwaeche:** Keine EUeR, kein ELSTER, schwache Mobile App
- **Chance:** Vollstaendigeres Feature-Set

### Strategische Differenzierung RechnungsWerk

| Feature | sevDesk | Lexware | easybill | **RechnungsWerk** |
|---------|---------|---------|----------|-------------------|
| XRechnung/ZUGFeRD | Alle Tarife | Nur XL (32,90) | Bezahltarife | **Alle Tarife inkl. Free** |
| Open Source | Nein | Nein | Nein | **AGPL auf GitHub** |
| DATEV Export | Ja | Ja | Ja (Free!) | **Ja (Starter)** |
| Mobile App | Ja (buggy) | Ja | Nein | **PWA (alle Geraete)** |
| API | Teuerster Tarif | Keine | PLUS+ | **Alle Tarife** |
| KI-OCR | Ja | Nein | Nein | **Ja (Surya + API)** |
| Self-Hosted | Nein | Nein | Nein | **Ja (AGPL)** |
| Startpreis | 12,90 | 6,90 | 15,00 | **9,90 EUR** |

---

## 5. SEO-Strategie (Maximiert)

### 5.1 Technisches SEO

**JSON-LD Schema (Server-Side gerendert — kritisch fuer AI-Crawler):**

1. **SoftwareApplication** (Homepage, Pricing): name, applicationCategory "BusinessApplication", operatingSystem "Web", offers mit konkreten EUR-Preisen pro Tier, aggregateRating, featureList — Attribut-reiche Schemas haben 61,7% AI-Citation-Rate vs 41,6% bei generischen
2. **FAQPage** (FAQ, Pillar Pages): Frage-Antwort-Paare
3. **HowTo** (Tutorials): Schritt-fuer-Schritt Anleitungen
4. **Organization** (Site-wide): Vollstaendige deutsche Firmendaten
5. **Product** (Pricing): Preise, Features, Bewertungen

**Core Web Vitals Targets:**
- LCP < 2.5s (next/image mit priority, next/font)
- INP < 200ms (43% der Sites scheitern — Event Handler optimieren)
- CLS < 0.1 (Bilder mit expliziten Dimensionen)

**Technische Grundlagen:**
- `sitemap.ts` im App Router (Sitemap-Index mit Sub-Sitemaps)
- `robots.ts` — /app/, /api/, /dashboard/ blockieren. GPTBot, ClaudeBot, PerplexityBot ERLAUBEN
- `llms.txt` Datei im Root fuer AI-System-Guidance
- Hreflang vorbereiten: de-DE (primaer), spaeter de-AT, de-CH
- Canonical URLs auf jeder Seite (self-referencing)

### 5.2 Programmatic SEO Engine

**Seitentypen und Volumen:**

| Template | URL-Pattern | Anzahl | Wortanzahl |
|----------|------------|--------|------------|
| Branchen | `/e-rechnung/{branche}` | 50 | 800-1.200 |
| Bundeslaender | `/e-rechnung/{bundesland}` | 16 | 600-1.000 |
| Vergleiche | `/vergleich/{tool}-alternative` | 15 | 1.000-1.500 |
| Glossar | `/glossar/{begriff}` | 50 | 500-800 |
| Ratgeber | `/ratgeber/{thema}` | 30 | 1.000-2.000 |
| **Gesamt** | | **~161 Seiten** | |

**Implementierung:**
- `generateStaticParams()` + SSG/ISR
- Minimum 500 einzigartige Woerter pro Seite, 30-40% Content-Differenzierung
- Jede Seite: einzigartiges Intro, branchenspezifische Pain Points, Custom FAQ
- Drip Publishing: 5-10 Seiten/Woche
- Hub-and-Spoke Internal Linking (jede Seite max. 3 Klicks von Homepage)

### 5.3 GEO (Generative Engine Optimization)

**Plattform-spezifische Strategien (nur 11% der Domains werden von ChatGPT UND Perplexity zitiert):**

| Plattform | Bevorzugte Quelle | Strategie |
|-----------|-------------------|-----------|
| ChatGPT | Enzyklopaedischer Content (47,9%) | Umfassende Pillar Pages mit Fakten, Statistiken, Definitionen |
| Perplexity | Reddit/Community (46,7%) | Aktive Praesenz in r/Finanzen, r/de, Gruender-Foren |
| Google AI Overviews | YouTube (23,3%) | Video-Tutorials zu XRechnung erstellen, ZUGFeRD erklaert |

**Content-Attribute fuer AI-Zitation:**
- Direkte Antworten am Anfang jedes Abschnitts
- TL;DR unter Ueberschriften
- Originalforschung und proprietaere Daten ("Durchschnittliche Rechnungsbearbeitungszeit nach Branche")
- FAQ-Sektionen (AI-Engines nutzen Q&A-Paare stark)
- Named Expert Commentary

**AI-Visibility Messung:**
- Otterly.ai fuer Brand-Monitoring in AI-Antworten
- Semrush AI Search Visibility Checker (kostenlos)
- Frase AI Tracking (8 Plattformen)

### 5.4 Content-Cluster-Strategie

**6 Pillar Pages mit je 5-15 Cluster-Artikeln:**

1. **E-Rechnung Grundlagen** -> XRechnung, ZUGFeRD, EN 16931, Pflichtfelder, PDF vs E-Rechnung
2. **E-Rechnungspflicht** -> Timeline 2025-2028, Wer betroffen, Ausnahmen, Strafen, Umsatzgrenzen
3. **E-Rechnung nach Branche** -> Handwerk, Freiberufler, Gastronomie, IT, Bau, Logistik, Gesundheit
4. **Buchhaltung & Integration** -> DATEV, GoBD, PEPPOL, Archivierung, Revisionssicherheit
5. **Software-Vergleich** -> vs sevDesk, vs Lexware, vs easybill, vs Billomat, vs FastBill
6. **Praxis-Ratgeber** -> Erste E-Rechnung, Validierung, Korrektur, Internationaler Versand

### 5.5 Keyword-Map

**Tier 1 (High Volume):** e-Rechnung, e-Rechnungspflicht, Rechnungsprogramm, Rechnungssoftware
**Tier 2 (Medium):** XRechnung erstellen, ZUGFeRD Rechnung, e-Rechnung Software, e-Rechnung Kleinunternehmer
**Tier 3 (Long-Tail, High Conversion):** sevdesk Alternative guenstiger, XRechnung vs ZUGFeRD Unterschied, e-Rechnung DATEV Schnittstelle
**Frage-Keywords (AI-optimiert):** Was ist eine e-Rechnung? Ab wann Pflicht? Welche Software? Ist PDF eine e-Rechnung?

---

## 6. Security Review (Claude Code Security)

**Anthropic hat am 20. Februar 2026 "Claude Code Security" veroeffentlicht** — ein KI-gestuetztes Vulnerability-Scanning-Tool basierend auf Opus 4.6.

### Aktion: Security Audit fuer RechnungsWerk
1. Claude Code Security auf die gesamte Codebase ausfuehren
2. Bekannte Schwachstellen-Kategorien pruefen:
   - SQL Injection (SQLAlchemy parametrisierte Queries?)
   - XSS (React escaped standardmaessig, aber dangerouslySetInnerHTML?)
   - CSRF (API-Key Auth + CORS konfiguriert?)
   - Authentication Bypass (JWT-Implementierung?)
   - File Upload Vulnerabilities (OCR-Upload?)
   - IBAN/Payment Data Exposure (Fraud Detection Module?)
   - GoBD Compliance (Unveraenderbarkeit der Archivdaten?)
3. OWASP Top 10 Checkliste durchgehen
4. Dependency Audit (npm audit, pip audit)

### DSGVO/GDPR Compliance Checklist
- Datenschutz-Folgenabschaetzung (DPIA) vor AI-API-Nutzung erstellen
- Auftragsverarbeitungsvertrag (AVV) mit Anthropic/OpenAI (automatisch in Commercial Terms)
- API-Datenaufbewahrung dokumentieren: Anthropic 7 Tage, dann geloescht
- Verarbeitungsverzeichnis (Art. 30 DSGVO) anlegen
- Recht auf Loeschung implementieren (Nutzer-Daten + Rechnungsdaten nach Aufbewahrungsfrist)

---

## 7. Rechtstexte und Compliance

### Stufe 1 (Tag 1, kostenlos-5,90 EUR/Mo)
- Impressum ueber eRecht24-Generator (kostenlos)
- Datenschutzerklaerung ueber IT-Recht Kanzlei (5,90 EUR/Mo, monatlich kuendbar)
- Cookie-Banner (PostHog ist cookieless -> minimaler Banner)

### Stufe 2 (Vor erstem zahlenden Kunden, 389-990 EUR)
- SaaS-AGB vom Anwalt: KRAUS GHENDLER RUVINSKIJ ab 389 EUR Festpreis
- AVV nach Art. 28 DSGVO (Pflicht als Auftragsverarbeiter)
- Verfahrensdokumentation (GoBD-Pflicht)

### Stufe 3 (Bei Wachstum)
- IT-Recht Kanzlei Starter (9,90 EUR/Mo) fuer laufende Updates
- Jaehrliche anwaltliche Nachpruefung (~200-500 EUR)

---

## 8. Pricing-Modell

| | **Free** | **Starter** | **Professional** |
|---|---|---|---|
| **Preis** | 0 EUR | **9,90 EUR/Mo** | **19,90 EUR/Mo** |
| **Jahresrabatt** | — | 7,90 EUR/Mo | 15,90 EUR/Mo |
| Rechnungen/Mo | 5 | Unbegrenzt | Unbegrenzt |
| Kontakte | 10 | Unbegrenzt | Unbegrenzt |
| XRechnung/ZUGFeRD | Ja | Ja | Ja |
| KoSIT-Validierung | Ja | Ja | Ja |
| DATEV-Export | Nein | **Ja** | **Ja** |
| Mahnwesen | Nein | **Ja** | **Ja** |
| Stripe/PayPal Links | Nein | **Ja** | **Ja** |
| Banking | Nein | Nein | **Ja** |
| UStVA/ELSTER | Nein | Nein | **Ja** |
| Team (Multi-User) | Nein | Nein | **Ja** (bis 5) |
| API-Zugang | Nein | **Ja** | **Ja** |
| Prioritaets-Support | Nein | Nein | **Ja** |
| Self-Hosted (AGPL) | **Unbegrenzt** | — | — |

---

## 9. Landing Page Design

### Hero Section
- Headline: "E-Rechnungen in 30 Sekunden" (26 Zeichen, unter 44-Zeichen-Optimum)
- Subheading: "XRechnung & ZUGFeRD konform. Open Source. Ab 9 EUR/Monat."
- CTA: "Kostenlos testen" (Primary Button, Teal Accent)
- Visual: Animiertes Produkt-Demo (Invoice Creation Flow)

### Struktur (Conversion-optimiert, 250-725 Woerter)
1. Hero + CTA
2. Trust Signals Bar (GitHub Stars, "XRechnung konform", "DSGVO-konform", "Made in Germany")
3. Problem Statement (E-Rechnungspflicht Timeline-Grafik)
4. 4 Key Features mit Screenshots (Bento Grid)
5. Preistabelle (transparent, EUR netto)
6. Open Source Trust Block (GitHub Link, AGPL Lizenz, Self-Hosted Option)
7. FAQ (E-Rechnung Grundlagen, GoBD, DATEV)
8. Finaler CTA

### Trust Signals (Pflicht fuer deutschen B2B-Markt)
- Impressum im Footer (erstes was deutsche User pruefen)
- .de Domain
- DSGVO-Compliance Badge
- "Made in Germany / Hosted in Germany" (Hetzner)
- GitHub Stars Counter
- Kunden-Logos (nach Beta-Phase)
- XRechnung/ZUGFeRD Konformitaets-Badge

---

## 10. Phasen-Plan (12 Wochen)

### Phase 1: Marktreife (Woche 1-4, Maerz 2026)

**Woche 1-2: Auth + Infra + Design**
- [ ] Better Auth integrieren (Login, Register, Password Reset, Organizations)
- [ ] Multi-Tenant: organization_id auf alle Models, Row-Level Security
- [ ] PostgreSQL 17 Migration mit Alembic
- [ ] Coolify auf Hetzner CX22 aufsetzen
- [ ] AGPL Lizenz + Feature-Gating (Premium via Env-Flag)
- [ ] PWA Setup mit Serwist
- [ ] Frontend-Design Refresh: Neue Farbpalette, Geist Sans + Inter, Dark Mode
- [ ] Sidebar mit Glassmorphism-Effekt
- [ ] Claude Code Security Audit auf gesamte Codebase

**Woche 3: Landing Page + Marketing-Seiten**
- [ ] Landing Page (SSG, Conversion-optimiert)
- [ ] Pricing Page mit Feature-Matrix
- [ ] Blog Scaffold (MDX-basiert)
- [ ] Erster Blog-Artikel: "E-Rechnungspflicht 2025-2028: Der komplette Guide"
- [ ] SEO Foundation: sitemap.ts, robots.ts, JSON-LD Schemas, OG-Images
- [ ] llms.txt fuer AI-Crawler
- [ ] Google Business Profile anlegen

**Woche 4: Legal + Payment + Deploy**
- [ ] Rechtstexte (Impressum, Datenschutz, Cookie-Banner)
- [ ] Stripe Integration (Checkout, SEPA DD, Webhooks, Customer Portal)
- [ ] Brevo Email Setup (Transaktional: Rechnungsversand, Willkommen, Password Reset)
- [ ] PostHog Self-Hosted aufsetzen
- [ ] Uptime Kuma + Sentry Free
- [ ] Production Deploy auf Hetzner
- [ ] SaaS-AGB Entwurf (KI-gestuetzt, Anwalts-Review beauftragen)
- [ ] Soft Launch: 10-20 Beta-Tester einladen

### Phase 2: Features + SEO (Woche 5-8, April 2026)

**Woche 5-6: Revenue-Features**
- [ ] Automatisches Mahnwesen (3 Stufen, konfigurierbar, PDF, Email via Brevo)
- [ ] PayPal Payment Links auf Rechnungen
- [ ] DATEV-Export Premium (SKR03/SKR04 Auswahl, Validierung)
- [ ] GoBD Audit Trail (vollstaendige Protokollierung, Verfahrensdokumentation PDF)
- [ ] TanStack Table fuer Invoice-Listen
- [ ] cmdk Command Palette (Cmd+K)
- [ ] Onboarding Wizard (4 Schritte)
- [ ] KI-Migration: Ollama -> API (Mistral OCR + Claude Haiku/GPT-4o-mini)

**Woche 7-8: SEO + Content**
- [ ] pSEO Engine: Branchen-Pages (erste 20)
- [ ] pSEO: Bundesland-Pages (16)
- [ ] pSEO: Vergleichsseiten (erste 5: vs sevDesk, Lexware, easybill, Billomat, FastBill)
- [ ] pSEO: Glossar (erste 20 Begriffe)
- [ ] GEO-Optimierung: Attribut-reiche Schemas auf allen Seiten
- [ ] 4 Blog-Artikel (XRechnung Guide, ZUGFeRD Erklaerung, GoBD, DATEV)
- [ ] Content Cluster 1 fertig: "E-Rechnung Grundlagen"
- [ ] Newsletter Setup (Brevo)
- [ ] Hreflang vorbereiten (de-DE primaer)

### Phase 3: Launch + Growth (Woche 9-12, Mai-Juni 2026)

**Woche 9-10: Launch-Vorbereitung**
- [ ] GitHub Repo Public (README polieren, Contributing Guide, Issue Templates, Discussions)
- [ ] Product Hunt Prep (Coming-Soon-Page, Teaser-Video, 60 Supporter-Kontakte)
- [ ] Social Proof sammeln (Beta-Tester Testimonials, GitHub Stars)
- [ ] pSEO: Restliche Branchen-Pages (30), Glossar (30), Ratgeber (erste 10)
- [ ] Content Cluster 2+3 fertig: "E-Rechnungspflicht" + "Software-Vergleich"
- [ ] Weitere 4 Blog-Artikel

**Woche 11-12: Launch + Optimize**
- [ ] Product Hunt Launch (Di-Do, 12:01 AM PT)
- [ ] Parallele Launches: Hacker News (Show HN), Reddit r/SaaS + r/selfhosted + r/Finanzen, IndieHackers
- [ ] HubSpot Inbound Marketing Zertifizierung (kostenlos, 6h)
- [ ] Google Analytics Zertifizierung (kostenlos, 1 Woche)
- [ ] Bug-Fixes aus Nutzer-Feedback
- [ ] Core Web Vitals Optimierung
- [ ] AI Visibility Tracking starten (Otterly.ai oder Semrush)

---

## 11. Budget-Uebersicht

### Einmalige Kosten
| Posten | Betrag |
|--------|--------|
| Domain .de | ~10 EUR |
| SaaS-AGB Anwalt | 389-990 EUR |
| Zertifizierungen (AWS CCP, spaeter) | ~100 EUR |
| **Gesamt einmalig** | **~500-1.100 EUR** |

### Monatliche Kosten
| Posten | Betrag |
|--------|--------|
| Hetzner CX22 | 5,49 EUR |
| IT-Recht Kanzlei Datenschutz | 5,90 EUR |
| ChatGPT Plus (Development) | ~19 EUR |
| Canva Pro (Marketing) | ~12 EUR |
| SE Ranking (SEO) | ~88 EUR |
| AI APIs (Mistral + Claude/OpenAI) | ~27-75 EUR |
| Brevo Email | 0 EUR (Free Tier) |
| PostHog | 0 EUR (Self-Hosted) |
| Sentry | 0 EUR (Free Tier) |
| Uptime Kuma | 0 EUR (Self-Hosted) |
| Coolify | 0 EUR (Self-Hosted) |
| Stripe | 0,8-1,4% pro Tx |
| **Gesamt monatlich** | **~157-215 EUR** |

### Revenue-Projektion (konservativ)
| Monat | Free User | Starter (9,90) | Pro (19,90) | MRR |
|-------|----------|----------------|-------------|-----|
| Monat 1 (Soft Launch) | 20 | 0 | 0 | 0 EUR |
| Monat 2 | 50 | 5 | 1 | 69,40 EUR |
| Monat 3 (Launch) | 200 | 15 | 5 | 248,00 EUR |
| Monat 6 | 500 | 50 | 15 | 793,50 EUR |
| Monat 12 | 1.000 | 150 | 50 | 2.480 EUR |

---

## 12. Risiken und Mitigationen

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|-----------|
| KoSIT aendert XRechnung-Standard | Niedrig (stabil bis Sommer 2026) | Validator-Config automatisch updaten |
| Wettbewerber kopieren Open-Source-Modell | Mittel | AGPL verhindert proprietaere Nutzung. Community-Vorsprung |
| API-Kosten explodieren bei Wachstum | Niedrig (Break-Even erst bei 200K Rechnungen) | Multi-Provider, Batch API, Prompt Caching |
| Stripe-Onboarding dauert lang | Niedrig | Frueh beantragen, SEPA braucht Verifizierung |
| Product Hunt Launch floppt | Mittel | Diversifizierte Launch-Strategie (HN, Reddit, IndieHackers) |
| Solo-Entwickler Burnout | Hoch | Phasen strikt einhalten, Scope begrenzen, Community delegieren |

---

## 13. Erfolgsmetriken

| Metrik | Monat 1 | Monat 3 | Monat 6 |
|--------|---------|---------|---------|
| Website-Besucher/Mo | 500 | 5.000 | 15.000 |
| Free Signups | 20 | 200 | 500 |
| Zahlende Kunden | 0 | 20 | 65 |
| MRR | 0 | 248 EUR | 793 EUR |
| GitHub Stars | 50 | 300 | 1.000 |
| Blog-Artikel | 1 | 8 | 20 |
| pSEO-Pages indexed | 0 | 80 | 161 |
| NPS Score | — | > 40 | > 50 |
