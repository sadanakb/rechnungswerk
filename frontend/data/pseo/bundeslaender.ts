export interface BundeslandPage {
  slug: string
  name: string
  description: string
  businesses: string
  ihk: string
  specialRules: string[]
}

export const bundeslaender: BundeslandPage[] = [
  {
    slug: 'baden-wuerttemberg',
    name: 'Baden-Wuerttemberg',
    description:
      'Baden-Wuerttemberg ist mit ueber 500.000 Unternehmen eines der wirtschaftsstaerksten Bundeslaender Deutschlands. Der Mittelstand, insbesondere Maschinenbau und Automobilzulieferer, profitiert von der E-Rechnungspflicht durch effizientere Prozesse mit oeffentlichen Auftraggebern.',
    businesses: '500.000 Unternehmen',
    ihk: 'IHK Region Stuttgart',
    specialRules: [
      'E-Rechnungspflicht fuer Landesbehoerden seit April 2024 (E-Rechnungsverordnung BW)',
      'Foerderprogramme fuer Digitalisierung im Mittelstand ueber die L-Bank',
    ],
  },
  {
    slug: 'bayern',
    name: 'Bayern',
    description:
      'Bayern zaehlt ueber 700.000 Unternehmen und ist der groesste Wirtschaftsstandort in Deutschland. Von der Automobilindustrie bis zum Tourismus — bayerische Unternehmen muessen die E-Rechnungspflicht fruehzeitig umsetzen, um wettbewerbsfaehig zu bleiben.',
    businesses: '750.000 Unternehmen',
    ihk: 'IHK fuer Muenchen und Oberbayern',
    specialRules: [
      'Bayerisches E-Government-Gesetz verpflichtet Landesbehoerden zum Empfang von E-Rechnungen',
      'Pilotprojekt XRechnung Bavaria fuer vereinfachte Kommunikation mit Landesbehoerden',
    ],
  },
  {
    slug: 'berlin',
    name: 'Berlin',
    description:
      'Berlin ist Deutschlands Startup-Hauptstadt mit einer dynamischen Gruenderszene. Ueber 200.000 Unternehmen — von Tech-Startups bis zu Kreativagenturen — benoetigen eine moderne, digitale Rechnungsloesung, die mit dem Wachstum mithalt.',
    businesses: '200.000 Unternehmen',
    ihk: 'IHK Berlin',
    specialRules: [
      'Berliner E-Rechnungsverordnung seit November 2020 fuer alle Rechnungen an Landesbehoerden',
      'Digitalisierungsfoerderung durch IBB (Investitionsbank Berlin) fuer KMU',
    ],
  },
  {
    slug: 'brandenburg',
    name: 'Brandenburg',
    description:
      'Brandenburg profitiert von der Naehe zu Berlin und einem wachsenden Wirtschaftsstandort. Rund 100.000 Unternehmen, darunter viele Handwerksbetriebe und Logistikunternehmen, muessen die E-Rechnungspflicht umsetzen.',
    businesses: '100.000 Unternehmen',
    ihk: 'IHK Potsdam',
    specialRules: [
      'Brandenburgisches E-Rechnungsgesetz verpflichtet Landesstellen zum Empfang seit 2020',
      'Foerderung der Digitalisierung ueber die ILB (Investitionsbank des Landes Brandenburg)',
    ],
  },
  {
    slug: 'bremen',
    name: 'Bremen',
    description:
      'Das kleinste Bundesland Bremen ist ein bedeutender Hafen- und Logistikstandort. Rund 30.000 Unternehmen, vor allem in der Logistik, Lebensmittelverarbeitung und im Handel, stehen vor der Herausforderung der E-Rechnungspflicht.',
    businesses: '30.000 Unternehmen',
    ihk: 'Handelskammer Bremen — IHK fuer Bremen und Bremerhaven',
    specialRules: [
      'Bremisches E-Rechnungsgesetz seit November 2020 fuer Rechnungen an oeffentliche Auftraggeber',
      'Digitaler Hafen Bremen: Initiative zur Digitalisierung der Hafenlogistik inkl. E-Rechnung',
    ],
  },
  {
    slug: 'hamburg',
    name: 'Hamburg',
    description:
      'Hamburg ist Deutschlands Tor zur Welt mit einem starken Fokus auf Handel, Logistik und Medien. Ueber 120.000 Unternehmen profitieren von einer digitalisierten Rechnungsstellung, die internationale Standards erfuellt.',
    businesses: '120.000 Unternehmen',
    ihk: 'Handelskammer Hamburg',
    specialRules: [
      'Hamburger E-Rechnungsverordnung seit April 2020 fuer alle Lieferanten der Stadt Hamburg',
      'Hamburg Digital: Foerderprogramm fuer die digitale Transformation von KMU',
    ],
  },
  {
    slug: 'hessen',
    name: 'Hessen',
    description:
      'Hessen ist mit Frankfurt am Main das Finanzzentrum Deutschlands. Ueber 300.000 Unternehmen aus Finanzwirtschaft, Pharma und Logistik benoetigen professionelle E-Rechnungsloesungen fuer anspruchsvolle Compliance-Anforderungen.',
    businesses: '300.000 Unternehmen',
    ihk: 'IHK Frankfurt am Main',
    specialRules: [
      'Hessische E-Rechnungsverordnung seit Maerz 2020 fuer Landesauftraege ab 1.000 EUR',
      'Digitalstrategie Hessen: Foerderung der digitalen Infrastruktur fuer den Mittelstand',
    ],
  },
  {
    slug: 'mecklenburg-vorpommern',
    name: 'Mecklenburg-Vorpommern',
    description:
      'Mecklenburg-Vorpommern ist gepraegt von Tourismus, Landwirtschaft und maritimer Wirtschaft. Rund 65.000 Unternehmen, darunter viele Saisonbetriebe, benoetigen eine einfache und kosteneffiziente E-Rechnungsloesung.',
    businesses: '65.000 Unternehmen',
    ihk: 'IHK zu Rostock',
    specialRules: [
      'Landesweite E-Rechnungspflicht fuer Rechnungen an Landesbehoerden seit 2020',
      'Foerderung der Digitalisierung im Tourismussektor durch das Wirtschaftsministerium MV',
    ],
  },
  {
    slug: 'niedersachsen',
    name: 'Niedersachsen',
    description:
      'Niedersachsen ist das zweitgroesste Flaechenland mit starkem Agrar- und Automobilsektor. Ueber 350.000 Unternehmen, von Landwirtschaftsbetrieben bis zu VW-Zulieferern, benoetigen konforme E-Rechnungsloesungen.',
    businesses: '350.000 Unternehmen',
    ihk: 'IHK Hannover',
    specialRules: [
      'Niedersaechsische E-Rechnungsverordnung seit November 2020 fuer Landesauftraege',
      'Foerderprogramm Niedersachsen Digital fuer die Digitalisierung von KMU',
    ],
  },
  {
    slug: 'nordrhein-westfalen',
    name: 'Nordrhein-Westfalen',
    description:
      'Nordrhein-Westfalen ist das bevoelkerungsreichste Bundesland mit der groessten Wirtschaftskraft. Ueber 750.000 Unternehmen aus Industrie, Handel und Dienstleistung muessen die E-Rechnungspflicht umsetzen.',
    businesses: '750.000 Unternehmen',
    ihk: 'IHK zu Duesseldorf',
    specialRules: [
      'E-Rechnungsgesetz NRW seit April 2020 — Rechnungen an Landesbehoerden muessen als XRechnung eingereicht werden',
      'Mittelstand Innovativ & Digital (MID): Landesfoerderung fuer Digitalisierungsprojekte',
    ],
  },
  {
    slug: 'rheinland-pfalz',
    name: 'Rheinland-Pfalz',
    description:
      'Rheinland-Pfalz ist gepraegt von Mittelstand, Weinbau und Chemie-Industrie. Rund 170.000 Unternehmen profitieren von digitalisierten Rechnungsprozessen, besonders in der Zusammenarbeit mit oeffentlichen Auftraggebern.',
    businesses: '170.000 Unternehmen',
    ihk: 'IHK Koblenz',
    specialRules: [
      'Rheinland-pfaelzisches E-Rechnungsgesetz seit November 2020 fuer Landesauftraege',
      'Digitalisierungsstrategie RLP: Foerderung digitaler Geschaeftsprozesse im Mittelstand',
    ],
  },
  {
    slug: 'saarland',
    name: 'Saarland',
    description:
      'Das Saarland an der franzoesischen Grenze verbindet deutsche Gruendlichkeit mit europaeischer Vernetzung. Rund 40.000 Unternehmen, viele davon mit grenzueberschreitenden Geschaeftsbeziehungen, benoetigen EU-konforme E-Rechnungen.',
    businesses: '40.000 Unternehmen',
    ihk: 'IHK Saarland',
    specialRules: [
      'Saarlaendische E-Rechnungsverordnung seit November 2020 fuer Lieferanten der Landesverwaltung',
      'Grenzueberschreitende Wirtschaftsfoerderung in der Grossregion SaarLorLux',
    ],
  },
  {
    slug: 'sachsen',
    name: 'Sachsen',
    description:
      'Sachsen ist ein starker Industriestandort mit Schwerpunkten in Automobilbau, Maschinenbau und Mikroelektronik. Ueber 160.000 Unternehmen profitieren von effizienten E-Rechnungsprozessen, insbesondere bei oeffentlichen Auftraegen.',
    businesses: '160.000 Unternehmen',
    ihk: 'IHK zu Leipzig',
    specialRules: [
      'Saechsische E-Rechnungsverordnung seit November 2020 fuer Auftraege des Freistaats',
      'Foerderprogramm Sachsen Digital fuer die Digitalisierung von Geschaeftsprozessen',
    ],
  },
  {
    slug: 'sachsen-anhalt',
    name: 'Sachsen-Anhalt',
    description:
      'Sachsen-Anhalt entwickelt sich als Standort fuer Chemie, erneuerbare Energien und Logistik. Rund 80.000 Unternehmen stehen vor der Aufgabe, ihre Rechnungsprozesse zu digitalisieren und die E-Rechnungspflicht umzusetzen.',
    businesses: '80.000 Unternehmen',
    ihk: 'IHK Halle-Dessau',
    specialRules: [
      'E-Rechnungsverordnung Sachsen-Anhalt seit November 2020 fuer Landesauftraege',
      'Foerderprogramm Digital Innovation fuer die Modernisierung von KMU',
    ],
  },
  {
    slug: 'schleswig-holstein',
    name: 'Schleswig-Holstein',
    description:
      'Schleswig-Holstein verbindet maritime Wirtschaft mit einem starken Tourismussektor. Rund 120.000 Unternehmen, von Werften bis zu Ferienwohnungsvermietern, benoetigen eine einfache E-Rechnungsloesung.',
    businesses: '120.000 Unternehmen',
    ihk: 'IHK zu Kiel',
    specialRules: [
      'Schleswig-Holsteinische E-Rechnungsverordnung seit November 2020 fuer Landesauftraggeber',
      'Digitalisierungsprogramm SH fuer die Modernisierung kleiner und mittlerer Unternehmen',
    ],
  },
  {
    slug: 'thueringen',
    name: 'Thueringen',
    description:
      'Thueringen ist gepraegt von Optik-Industrie, Maschinenbau und einem wachsenden IT-Sektor. Rund 90.000 Unternehmen profitieren von der Digitalisierung ihrer Rechnungsprozesse mit einer modernen E-Rechnungsloesung.',
    businesses: '90.000 Unternehmen',
    ihk: 'IHK Erfurt',
    specialRules: [
      'Thueringer E-Rechnungsverordnung seit November 2020 fuer Rechnungen an den Freistaat',
      'Thueringer Aufbaubank: Foerdermittel fuer Digitalisierungsprojekte im Mittelstand',
    ],
  },
]

export function getBundeslandBySlug(slug: string): BundeslandPage | undefined {
  return bundeslaender.find((b) => b.slug === slug)
}
