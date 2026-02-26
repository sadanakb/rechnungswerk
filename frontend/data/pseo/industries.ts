export interface IndustryPage {
  slug: string
  name: string
  description: string
  challenges: string[]
  benefits: string[]
  invoiceVolume: string
  regulations: string[]
}

export const industries: IndustryPage[] = [
  {
    slug: 'handwerk',
    name: 'Handwerk',
    description:
      'Handwerksbetriebe stehen vor besonderen Herausforderungen bei der Rechnungsstellung: Abschlagsrechnungen, Aufmass-basierte Abrechnungen und oeffentliche Auftraege nach VOB erfordern praezise und konforme E-Rechnungen. RechnungsWerk automatisiert diesen Prozess und stellt sicher, dass jede Rechnung den aktuellen Standards entspricht.',
    challenges: [
      'Komplexe Abschlagsrechnungen und Schlussrechnungen nach VOB muessen korrekt abgebildet werden',
      'Oeffentliche Auftraggeber verlangen seit 2025 zwingend XRechnung — manuelles Erstellen ist fehleranfaellig',
      'Viele Handwerksbetriebe arbeiten noch mit Papierrechnungen und haben keine digitale Infrastruktur',
    ],
    benefits: [
      'Automatische XRechnung-Erstellung fuer oeffentliche Auftraege — konform mit EN 16931 und Leitweg-ID',
      'Abschlagsrechnungen und Schlussrechnungen werden korrekt verknuepft und nachvollziehbar dokumentiert',
      'DATEV-Export ermoeglicht die direkte Uebergabe an den Steuerberater ohne Medienbruch',
    ],
    invoiceVolume: '50 - 200 Rechnungen pro Monat',
    regulations: [
      'VOB (Vergabe- und Vertragsordnung fuer Bauleistungen) fuer oeffentliche Bauauftraege',
      'E-Rechnungspflicht fuer oeffentliche Auftraggeber seit November 2020 (Bund) bzw. landesspezifisch',
    ],
  },
  {
    slug: 'it-dienstleister',
    name: 'IT-Dienstleister',
    description:
      'IT-Dienstleister und Softwareunternehmen benoetigen flexible Abrechnungsmodelle: Projektbasierte Rechnungen, wiederkehrende Lizenzgebuehren und internationale Kunden mit Reverse-Charge-Verfahren. RechnungsWerk bildet all diese Szenarien ab und spart wertvolle Entwicklerzeit.',
    challenges: [
      'Gemischte Abrechnungsmodelle aus Projektarbeit, Stundensaetzen und wiederkehrenden Lizenzgebuehren',
      'Internationale Kunden erfordern Reverse-Charge-Verfahren und korrekte USt-IdNr.-Pruefung',
      'Hohe Anzahl an Kleinbetragsrechnungen durch SaaS-Subscriptions belastet die Buchhaltung',
    ],
    benefits: [
      'Wiederkehrende Rechnungen fuer Lizenzen und SaaS-Abonnements werden automatisch erstellt und versendet',
      'Reverse-Charge wird automatisch erkannt und korrekt auf der Rechnung ausgewiesen',
      'API-Anbindung ermoeglicht die Integration in bestehende CRM- und Projektmanagement-Tools',
    ],
    invoiceVolume: '100 - 500 Rechnungen pro Monat',
    regulations: [
      'Reverse-Charge-Verfahren (§ 13b UStG) bei grenzueberschreitenden B2B-Dienstleistungen',
      'GoBD-konforme Archivierung digitaler Rechnungen mit Unveraenderbarkeitsnachweis',
    ],
  },
  {
    slug: 'gastronomie',
    name: 'Gastronomie',
    description:
      'Restaurants, Caterer und Lieferdienste erstellen taeglich eine grosse Anzahl von Rechnungen. Die TSE-Pflicht, unterschiedliche Mehrwertsteuersaetze und die Abrechnung mit Lieferanten machen die Buchhaltung komplex. RechnungsWerk vereinfacht den gesamten Rechnungsprozess fuer die Gastronomie.',
    challenges: [
      'TSE-Pflicht (Technische Sicherheitseinrichtung) erfordert manipulationssichere Kassensysteme und Belege',
      'Unterschiedliche Mehrwertsteuersaetze (7 % Lieferung vs. 19 % Vor-Ort) muessen korrekt angewendet werden',
      'Hohe Anzahl an Lieferantenrechnungen fuer Lebensmittel und Getraenke erfordert effiziente Erfassung',
    ],
    benefits: [
      'OCR-Erkennung erfasst Lieferantenrechnungen automatisch — kein manuelles Abtippen mehr',
      'Korrekte Zuordnung von 7 % und 19 % MwSt. wird durch intelligente Vorlagen sichergestellt',
      'Tagesabschluss-Export erleichtert die Abstimmung mit dem Kassensystem und dem Steuerberater',
    ],
    invoiceVolume: '200 - 1.000 Rechnungen pro Monat',
    regulations: [
      'KassenSichV und TSE-Pflicht fuer elektronische Aufzeichnungssysteme',
      'Belegausgabepflicht nach § 146a AO seit dem 01.01.2020',
    ],
  },
  {
    slug: 'einzelhandel',
    name: 'Einzelhandel',
    description:
      'Der Einzelhandel erzeugt ein hohes Rechnungsvolumen und benoetigt nahtlose POS-Integration. Von der Kassenanbindung bis zur B2B-Rechnung an Geschaeftskunden — RechnungsWerk bietet die passende Loesung fuer Einzelhaendler jeder Groesse.',
    challenges: [
      'Hohe Rechnungsvolumina erfordern Massenverarbeitung und effiziente Workflows',
      'POS-Systeme muessen nahtlos mit der E-Rechnungsloesung verbunden werden',
      'Gemischte B2C- und B2B-Geschaefte erfordern unterschiedliche Rechnungsformate und Compliance-Anforderungen',
    ],
    benefits: [
      'Massenverarbeitung ermoeglicht die Erstellung hunderter Rechnungen auf Knopfdruck',
      'API-Schnittstelle fuer die Integration mit gaengigen POS- und Warenwirtschaftssystemen',
      'Automatische Unterscheidung zwischen B2B-E-Rechnungen (XRechnung/ZUGFeRD) und B2C-Belegen',
    ],
    invoiceVolume: '500 - 5.000 Rechnungen pro Monat',
    regulations: [
      'E-Rechnungspflicht im B2B-Bereich ab 2025 (Empfang) und ab 2027/2028 (Versand)',
      'GoBD-konforme Aufbewahrung und Belegarchivierung fuer 10 Jahre',
    ],
  },
  {
    slug: 'freiberufler',
    name: 'Freiberufler',
    description:
      'Freiberufler und Kleinunternehmer brauchen eine unkomplizierte Rechnungsloesung, die die Kleinunternehmerregelung korrekt abbildet und quartalsweise Meldungen unterstuetzt. RechnungsWerk ist die ideale Loesung: einfach zu bedienen, konform und kostenguenstig.',
    challenges: [
      'Korrekte Anwendung der Kleinunternehmerregelung (§ 19 UStG) auf Rechnungen ohne MwSt.-Ausweis',
      'Quartalsweise UStVA-Voranmeldungen muessen auf Basis der erstellten Rechnungen vorbereitet werden',
      'Keine IT-Abteilung — die Loesung muss sofort einsatzbereit und intuitiv bedienbar sein',
    ],
    benefits: [
      'Kleinunternehmerregelung wird automatisch erkannt und korrekt auf der Rechnung vermerkt',
      'UStVA-Vorbereitung auf Knopfdruck — alle relevanten Daten werden automatisch zusammengefasst',
      'Kostenloser Free-Plan mit 5 Rechnungen/Monat — ideal fuer den Einstieg ohne Risiko',
    ],
    invoiceVolume: '5 - 30 Rechnungen pro Monat',
    regulations: [
      'Kleinunternehmerregelung nach § 19 UStG mit korrektem Hinweis auf der Rechnung',
      'Quartalsweise oder monatliche UStVA-Voranmeldung beim Finanzamt',
    ],
  },
  {
    slug: 'immobilien',
    name: 'Immobilien',
    description:
      'Immobilienverwaltungen und Hausverwaltungen erstellen regelmaessig Nebenkostenabrechnungen, Mieterrechnungen und Verwaltungsgebuehren. RechnungsWerk automatisiert wiederkehrende Rechnungen und stellt die Einhaltung aller gesetzlichen Anforderungen sicher.',
    challenges: [
      'Jaehrliche Nebenkostenabrechnungen fuer zahlreiche Mieteinheiten muessen termingerecht erstellt werden',
      'Wiederkehrende Mieterrechnungen und Verwaltungsgebuehren erfordern automatisierte Prozesse',
      'Unterschiedliche MwSt.-Regelungen bei gewerblichen und privaten Mietverhaeltnissen',
    ],
    benefits: [
      'Wiederkehrende Rechnungen werden automatisch generiert und an Mieter versendet',
      'Nebenkostenabrechnungen koennen als strukturierte E-Rechnung im ZUGFeRD-Format erstellt werden',
      'Mandantenfaehigkeit ermoeglicht die Verwaltung mehrerer Immobilienportfolios in einem System',
    ],
    invoiceVolume: '50 - 500 Rechnungen pro Monat',
    regulations: [
      'Betriebskostenverordnung (BetrKV) fuer die korrekte Nebenkostenabrechnung',
      'Umsatzsteuerbefreiung bei Vermietung zu Wohnzwecken (§ 4 Nr. 12 UStG) vs. Option zur Steuerpflicht',
    ],
  },
  {
    slug: 'logistik',
    name: 'Logistik',
    description:
      'Logistikunternehmen und Speditionen arbeiten international, benoetigen CMR-Frachtbriefe und muessen Zolldokumente abbilden. RechnungsWerk unterstuetzt grenzueberschreitende Rechnungsstellung und stellt die Konformitaet mit europaeischen E-Rechnungsstandards sicher.',
    challenges: [
      'Grenzueberschreitende Rechnungsstellung mit unterschiedlichen MwSt.-Regelungen je Land',
      'CMR-Frachtbriefe und Zolldokumente muessen mit Rechnungen verknuepft und archiviert werden',
      'Hohe Transaktionsvolumina mit vielen Teillieferungen und Sammelrechnungen',
    ],
    benefits: [
      'Automatische Waehrungsumrechnung und korrekte MwSt.-Behandlung fuer EU- und Drittland-Geschaefte',
      'Dokumentenverknuepfung ermoeglicht die Zuordnung von CMR-Frachtbriefen zu Rechnungen',
      'Sammelrechnungen fuer wiederkehrende Auftraege reduzieren den Verwaltungsaufwand erheblich',
    ],
    invoiceVolume: '200 - 2.000 Rechnungen pro Monat',
    regulations: [
      'CMR-Uebereinkommen (Convention relative au contrat de transport international de marchandises par route)',
      'EU-Richtlinie 2014/55/EU fuer elektronische Rechnungsstellung bei oeffentlichen Auftraegen',
    ],
  },
  {
    slug: 'gesundheitswesen',
    name: 'Gesundheitswesen',
    description:
      'Aerzte, Zahnaerzte und Therapeuten rechnen ueber die Kassenaerztliche Vereinigung ab, erstellen aber auch Privatrechnungen nach GOAe/GOZ. RechnungsWerk vereinfacht die Abrechnung im Gesundheitswesen und stellt die Einhaltung aller regulatorischen Anforderungen sicher.',
    challenges: [
      'Komplexe KV-Abrechnungen (Kassenaerztliche Vereinigung) neben privaten Patientenrechnungen',
      'Strenge Datenschutzanforderungen (DSGVO) bei der Verarbeitung von Patientendaten auf Rechnungen',
      'GOAe/GOZ-konforme Rechnungsstellung mit korrekter Ziffernangabe und Steigerungssaetzen',
    ],
    benefits: [
      'Vorlagen fuer GOAe- und GOZ-konforme Privatrechnungen beschleunigen den Abrechnungsprozess',
      'DSGVO-konforme Speicherung und Verarbeitung — Hosting ausschliesslich in Deutschland',
      'ZUGFeRD-Export ermoeglicht die digitale Weiterverarbeitung durch Abrechnungsdienstleister',
    ],
    invoiceVolume: '100 - 1.000 Rechnungen pro Monat',
    regulations: [
      'GOAe (Gebuehrenordnung fuer Aerzte) bzw. GOZ (Gebuehrenordnung fuer Zahnaerzte)',
      'DSGVO/BDSG mit erhoehten Anforderungen an den Schutz von Gesundheitsdaten',
    ],
  },
  {
    slug: 'beratung',
    name: 'Beratung',
    description:
      'Unternehmensberater, Steuerberater und Wirtschaftspruefer rechnen projektbasiert ab und muessen Reisekosten korrekt weiterberechnen. RechnungsWerk bietet die passenden Werkzeuge fuer professionelle Beratungsrechnungen mit detaillierter Leistungsaufstellung.',
    challenges: [
      'Projektbasierte Abrechnung mit unterschiedlichen Stundensaetzen und Leistungsphasen',
      'Korrekte Weiterberechnung von Reisekosten gemaess Reisekostenrecht inkl. Pauschalen',
      'Mandantenspezifische Rechnungsformate und Zahlungsbedingungen erfordern flexible Vorlagen',
    ],
    benefits: [
      'Projektbasierte Rechnungen mit detaillierter Leistungsaufstellung und Stundennachweis',
      'Reisekostenabrechnung wird automatisch in die Projektrechnung integriert',
      'Mandantenverwaltung mit individuellen Zahlungsbedingungen und Rechnungsvorlagen',
    ],
    invoiceVolume: '20 - 100 Rechnungen pro Monat',
    regulations: [
      'Reisekostenrecht mit steuerfreien Pauschalen nach § 3 Nr. 16 EStG',
      'Dokumentationspflichten nach GoBD fuer projektbezogene Abrechnungsunterlagen',
    ],
  },
  {
    slug: 'e-commerce',
    name: 'E-Commerce',
    description:
      'Online-Haendler und Marketplace-Verkaeufer muessen ein extrem hohes Rechnungsvolumen bewaeltigen, Fernabsatzregeln einhalten und oft ueber mehrere Plattformen hinweg abrechnen. RechnungsWerk automatisiert die Rechnungsstellung fuer den E-Commerce — von Amazon bis zum eigenen Shop.',
    challenges: [
      'Extrem hohes Rechnungsvolumen durch Marketplace-Verkaeufe auf Amazon, eBay und Co.',
      'Fernabsatzgesetz (§ 312 BGB ff.) erfordert besondere Angaben auf Rechnungen und Belegen',
      'OSS-Verfahren (One-Stop-Shop) fuer EU-weite B2C-Verkaeufe mit unterschiedlichen MwSt.-Saetzen',
    ],
    benefits: [
      'Massenrechnungserstellung via API — tausende Rechnungen werden automatisch generiert',
      'OSS-konforme Rechnungsstellung mit automatischer Zuordnung der laenderspezifischen MwSt.-Saetze',
      'Integration mit gaengigen Shop-Systemen (Shopify, WooCommerce) ueber die REST-API',
    ],
    invoiceVolume: '1.000 - 50.000 Rechnungen pro Monat',
    regulations: [
      'Fernabsatzrecht (§ 312 BGB ff.) und Verbraucherrechterichtlinie fuer Online-Verkaeufe',
      'OSS-Verfahren (One-Stop-Shop) fuer EU-weite B2C-Umsaetze seit Juli 2021',
    ],
  },
]

export function getIndustryBySlug(slug: string): IndustryPage | undefined {
  return industries.find((i) => i.slug === slug)
}
