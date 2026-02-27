export interface ComparisonPage {
  slug: string
  name: string
  tagline: string
  pricing: string
  rwAdvantages: string[]
  theirAdvantages: string[]
  features: Record<string, { rw: boolean | string; competitor: boolean | string }>
}

export const comparisons: ComparisonPage[] = [
  {
    slug: 'sevdesk',
    name: 'sevDesk',
    tagline: 'Buchhaltungssoftware fuer Selbstaendige',
    pricing: 'ab 8,90 EUR/Monat',
    rwAdvantages: [
      'Open Source (AGPL) — volle Transparenz und Community-getrieben',
      'Self-Hosting moeglich — behalten Sie die volle Kontrolle ueber Ihre Daten',
      'Vollstaendige XRechnung 3.0.2 und ZUGFeRD 2.3.3 Unterstuetzung',
      'KI-gestuetzte Kategorisierung fuer automatische Kontierung',
      'Umfassende REST-API fuer nahtlose Integration in bestehende Systeme',
    ],
    theirAdvantages: [
      'Laengere Marktpraesenz und groessere Nutzerbasis in Deutschland',
      'Integrierte Buchhaltungsfunktionen ueber die reine Rechnungsstellung hinaus',
      'Direkte ELSTER-Schnittstelle fuer Steuermeldungen',
    ],
    features: {
      xrechnung: { rw: 'Komplett (3.0.2)', competitor: 'Basis' },
      zugferd: { rw: 'Komplett (2.3.3)', competitor: 'Basis' },
      ocr: { rw: true, competitor: true },
      datev_export: { rw: true, competitor: true },
      open_source: { rw: true, competitor: false },
      self_hosted: { rw: true, competitor: false },
      api_access: { rw: 'Komplett (REST)', competitor: 'Eingeschraenkt' },
      mahnwesen: { rw: true, competitor: true },
      ki_kategorisierung: { rw: true, competitor: false },
      gobd_report: { rw: true, competitor: true },
    },
  },
  {
    slug: 'lexware',
    name: 'Lexware',
    tagline: 'Desktop- und Cloud-Buchhaltung',
    pricing: 'ab 11,90 EUR/Monat',
    rwAdvantages: [
      'Plattformunabhaengig — laeuft auf jedem Geraet mit Browser, nicht nur Windows',
      'Moderne REST-API fuer Automatisierung und Integration',
      'Open Source unter AGPL-Lizenz — kein Vendor-Lock-in',
      'Self-Hosting moeglich — Datenhoheit garantiert',
      'Vollstaendige XRechnung 3.0.2 Unterstuetzung ohne Aufpreis',
    ],
    theirAdvantages: [
      'Jahrzehntelange Erfahrung im deutschen Buchhaltungsmarkt',
      'Umfangreiches Offline-Funktionspaket in der Desktop-Version',
      'Breites Schulungs- und Zertifizierungsangebot fuer Steuerberater',
    ],
    features: {
      xrechnung: { rw: 'Komplett (3.0.2)', competitor: 'Basis' },
      zugferd: { rw: 'Komplett (2.3.3)', competitor: 'Basis' },
      ocr: { rw: true, competitor: false },
      datev_export: { rw: true, competitor: true },
      open_source: { rw: true, competitor: false },
      self_hosted: { rw: true, competitor: false },
      api_access: { rw: 'Komplett (REST)', competitor: false },
      mahnwesen: { rw: true, competitor: true },
      ki_kategorisierung: { rw: true, competitor: false },
      gobd_report: { rw: true, competitor: true },
    },
  },
  {
    slug: 'easybill',
    name: 'easybill',
    tagline: 'Online-Rechnungssoftware',
    pricing: 'ab 14 EUR/Monat',
    rwAdvantages: [
      'KI-gestuetzte OCR-Erkennung fuer automatische Rechnungserfassung',
      'Open Source (AGPL) — voller Einblick in den Quellcode',
      'Self-Hosting moeglich — keine Abhaengigkeit von einem Anbieter',
      'Vollstaendige ZUGFeRD 2.3.3 Unterstuetzung inklusive aller Profile',
      'Guenstigerer Einstiegspreis mit kostenlosem Free-Plan',
    ],
    theirAdvantages: [
      'Starke Marketplace-Integrationen (Amazon, eBay, Shopify)',
      'Etablierte Loesung mit grossem Kundenstamm im E-Commerce',
      'Mehrsprachige Rechnungserstellung in ueber 10 Sprachen',
    ],
    features: {
      xrechnung: { rw: 'Komplett (3.0.2)', competitor: 'Komplett' },
      zugferd: { rw: 'Komplett (2.3.3)', competitor: 'Basis' },
      ocr: { rw: true, competitor: false },
      datev_export: { rw: true, competitor: true },
      open_source: { rw: true, competitor: false },
      self_hosted: { rw: true, competitor: false },
      api_access: { rw: 'Komplett (REST)', competitor: 'Komplett (REST)' },
      mahnwesen: { rw: true, competitor: true },
      ki_kategorisierung: { rw: true, competitor: false },
      gobd_report: { rw: true, competitor: true },
    },
  },
  {
    slug: 'billomat',
    name: 'Billomat',
    tagline: 'Rechnungsprogramm fuer KMU',
    pricing: 'ab 9 EUR/Monat',
    rwAdvantages: [
      'Vollstaendige XRechnung-Generierung nach Standard 3.0.2',
      'KI-gestuetzte OCR-Erkennung fuer eingehende Rechnungen',
      'Open Source (AGPL) — transparenter und anpassbarer Code',
      'Self-Hosting moeglich — behalten Sie Ihre Daten im eigenen Haus',
      'Umfassender DATEV-Export mit allen relevanten Buchungsdaten',
    ],
    theirAdvantages: [
      'Einfache und intuitive Benutzeroberflaeche fuer Einsteiger',
      'Direkte Integration mit gaengigen Zahlungsdienstleistern',
      'Automatische Bankanbindung fuer Zahlungsabgleich',
    ],
    features: {
      xrechnung: { rw: 'Komplett (3.0.2)', competitor: false },
      zugferd: { rw: 'Komplett (2.3.3)', competitor: 'Basis' },
      ocr: { rw: true, competitor: false },
      datev_export: { rw: 'Komplett', competitor: 'Eingeschraenkt' },
      open_source: { rw: true, competitor: false },
      self_hosted: { rw: true, competitor: false },
      api_access: { rw: 'Komplett (REST)', competitor: 'Komplett (REST)' },
      mahnwesen: { rw: true, competitor: true },
      ki_kategorisierung: { rw: true, competitor: false },
      gobd_report: { rw: true, competitor: 'Basis' },
    },
  },
  {
    slug: 'fastbill',
    name: 'FastBill',
    tagline: 'Buchhaltung fuer Freelancer',
    pricing: 'ab 14,99 EUR/Monat',
    rwAdvantages: [
      'Vollstaendige ZUGFeRD 2.3.3 Unterstuetzung fuer konforme E-Rechnungen',
      'Open Source (AGPL) — Community-getrieben und transparent',
      'Self-Hosting moeglich — maximale Datenkontrolle',
      'Umfassende REST-API ohne Einschraenkungen',
      'Guenstigerer Einstieg mit kostenlosem Free-Plan (5 Rechnungen/Monat)',
    ],
    theirAdvantages: [
      'Integrierte Belegerfassung mit automatischer Bankanbindung',
      'Spezialisierung auf Freelancer und Kleinunternehmer',
      'Direkte Zusammenarbeit mit dem Steuerberater ueber die Plattform',
    ],
    features: {
      xrechnung: { rw: 'Komplett (3.0.2)', competitor: 'Basis' },
      zugferd: { rw: 'Komplett (2.3.3)', competitor: false },
      ocr: { rw: true, competitor: true },
      datev_export: { rw: true, competitor: true },
      open_source: { rw: true, competitor: false },
      self_hosted: { rw: true, competitor: false },
      api_access: { rw: 'Komplett (REST)', competitor: 'Eingeschraenkt' },
      mahnwesen: { rw: true, competitor: true },
      ki_kategorisierung: { rw: true, competitor: false },
      gobd_report: { rw: true, competitor: true },
    },
  },
]

export function getComparisonBySlug(slug: string): ComparisonPage | undefined {
  return comparisons.find((c) => c.slug === slug)
}
