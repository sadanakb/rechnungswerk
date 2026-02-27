export interface GlossaryTerm {
  slug: string
  name: string
  shortDefinition: string
  longDefinition: string
  relatedTerms: string[]
  category: 'format' | 'steuer' | 'buchhaltung' | 'recht' | 'technik'
}

export const glossaryTerms: GlossaryTerm[] = [
  {
    slug: 'xrechnung',
    name: 'XRechnung',
    shortDefinition:
      'XRechnung ist das XML-basierte Rechnungsformat, das in Deutschland fuer elektronische Rechnungen an oeffentliche Auftraggeber vorgeschrieben ist.',
    longDefinition:
      'XRechnung ist der deutsche Standard fuer elektronische Rechnungen im oeffentlichen Auftragswesen. Das Format basiert auf der europaeischen Norm EN 16931 und wird als reines XML uebermittelt — ohne PDF-Komponente. Seit November 2020 muessen Lieferanten des Bundes ihre Rechnungen als XRechnung einreichen, und seit 2025 gilt die E-Rechnungspflicht im B2B-Bereich.\n\nDas Format wird von der KoSIT (Koordinierungsstelle fuer IT-Standards) gepflegt und regelmaessig aktualisiert. Die aktuelle Version XRechnung 3.0.2 unterstuetzt beide Syntaxen der EN 16931: UBL (Universal Business Language) und CII (Cross Industry Invoice). Jede XRechnung enthaelt strukturierte Daten wie Rechnungsnummer, Leitweg-ID, Steuerbetrag und Zahlungsinformationen.\n\nFuer Unternehmen, die an oeffentliche Auftraggeber liefern, ist die XRechnung unverzichtbar. RechnungsWerk erstellt XRechnungen automatisch im korrekten Format und validiert diese vor dem Versand, sodass Ablehnungen durch fehlerhafte Daten vermieden werden.',
    relatedTerms: ['zugferd', 'en-16931', 'leitweg-id'],
    category: 'format',
  },
  {
    slug: 'zugferd',
    name: 'ZUGFeRD',
    shortDefinition:
      'ZUGFeRD (Zentraler User Guide des Forums elektronische Rechnung Deutschland) ist ein Hybridformat, das eine maschinenlesbare XML-Datei in ein menschenlesbares PDF einbettet.',
    longDefinition:
      'ZUGFeRD kombiniert das Beste aus zwei Welten: Ein visuell ansprechendes PDF-Dokument, das wie eine herkoemmliche Rechnung aussieht, enthaelt gleichzeitig eine eingebettete XML-Datei mit allen strukturierten Rechnungsdaten. So koennen Empfaenger die Rechnung sowohl manuell lesen als auch automatisiert in ihre Buchhaltungssoftware importieren.\n\nDie aktuelle Version ZUGFeRD 2.3.3 basiert auf der europaeischen Norm EN 16931 und ist mit dem franzoesischen Factur-X identisch. ZUGFeRD bietet verschiedene Profile — von MINIMUM fuer einfache Rechnungen bis EXTENDED fuer komplexe Geschaeftsvorfaelle. Das Profil XRECHNUNG innerhalb von ZUGFeRD ist vollstaendig kompatibel mit dem XRechnung-Standard.\n\nFuer den B2B-Bereich ist ZUGFeRD besonders attraktiv, da es die Einfuehrungshuerden senkt: Empfaenger ohne E-Rechnungssoftware koennen die PDF-Ansicht nutzen, waehrend automatisierte Systeme die XML-Daten verarbeiten. RechnungsWerk erzeugt ZUGFeRD-konforme Rechnungen in allen Profilen.',
    relatedTerms: ['xrechnung', 'en-16931', 'cii'],
    category: 'format',
  },
  {
    slug: 'en-16931',
    name: 'EN 16931',
    shortDefinition:
      'EN 16931 ist die europaeische Norm fuer das semantische Datenmodell elektronischer Rechnungen, die als Grundlage fuer XRechnung und ZUGFeRD dient.',
    longDefinition:
      'Die EN 16931 wurde 2017 vom Europaeischen Komitee fuer Normung (CEN) veroeffentlicht und definiert ein einheitliches semantisches Datenmodell fuer elektronische Rechnungen in der EU. Sie legt fest, welche Informationen eine E-Rechnung enthalten muss — von Verkaeuferdaten ueber Rechnungspositionen bis zu Steuersaetzen — ohne ein konkretes technisches Format vorzuschreiben.\n\nDie Norm erlaubt zwei syntaktische Umsetzungen: UBL 2.1 (Universal Business Language) und UN/CEFACT CII (Cross Industry Invoice). Nationale Standards wie die deutsche XRechnung oder das deutsch-franzoesische ZUGFeRD/Factur-X setzen auf dieser Norm auf und erweitern sie um laenderspezifische Anforderungen wie die Leitweg-ID.\n\nFuer Unternehmen bedeutet die EN 16931, dass E-Rechnungen europaweit interoperabel sind. Eine in Deutschland erstellte XRechnung kann in Frankreich oder Italien maschinell verarbeitet werden, weil alle auf demselben Datenmodell basieren. RechnungsWerk stellt sicher, dass jede erzeugte Rechnung vollstaendig EN-16931-konform ist.',
    relatedTerms: ['xrechnung', 'zugferd', 'ubl'],
    category: 'format',
  },
  {
    slug: 'leitweg-id',
    name: 'Leitweg-ID',
    shortDefinition:
      'Die Leitweg-ID ist ein eindeutiger Identifikator, mit dem elektronische Rechnungen dem richtigen oeffentlichen Auftraggeber in Deutschland zugeordnet werden.',
    longDefinition:
      'Die Leitweg-ID ist ein zentraler Bestandteil der E-Rechnung an oeffentliche Auftraggeber in Deutschland. Sie dient als Adressinformation, ueber die eingehende E-Rechnungen automatisch an die zustaendige Stelle innerhalb einer Behoerde weitergeleitet werden. Ohne korrekte Leitweg-ID wird eine XRechnung vom Empfangssystem abgewiesen.\n\nDie Leitweg-ID folgt einem definierten Schema: Sie besteht aus einer Grobadresse (Behoerdenkennzeichen), einer Feinadresse (Unterorganisation) und einer Pruefziffer. Beispiel: 04011000-1234512345-06. Die Vergabe erfolgt durch die jeweilige Verwaltungsebene — Bund, Laender oder Kommunen haben eigene Leitweg-ID-Strukturen.\n\nBei der Rechnungserstellung mit RechnungsWerk wird die Leitweg-ID als Pflichtfeld abgefragt, sobald ein oeffentlicher Auftraggeber als Rechnungsempfaenger erkannt wird. Das System validiert das Format und stellt sicher, dass die Rechnung korrekt zugestellt werden kann.',
    relatedTerms: ['xrechnung', 'e-rechnungspflicht', 'peppol'],
    category: 'technik',
  },
  {
    slug: 'peppol',
    name: 'Peppol',
    shortDefinition:
      'Peppol (Pan-European Public Procurement Online) ist ein internationales Netzwerk fuer den standardisierten Austausch elektronischer Geschaeftsdokumente, einschliesslich E-Rechnungen.',
    longDefinition:
      'Peppol wurde urspruenglich als EU-Projekt gestartet und hat sich zu einem globalen Netzwerk fuer den elektronischen Dokumentenaustausch entwickelt. Ueber das Peppol-Netzwerk koennen Unternehmen E-Rechnungen, Bestellungen und Lieferscheine standardisiert und sicher an Geschaeftspartner in ueber 30 Laendern versenden. Die Kommunikation erfolgt ueber zertifizierte Access Points.\n\nDas Netzwerk basiert auf dem Peppol BIS (Business Interoperability Specification) Standard, der auf UBL 2.1 aufsetzt. In Deutschland ist Peppol besonders relevant fuer Unternehmen, die mit oeffentlichen Auftraggebern im EU-Ausland zusammenarbeiten oder XRechnungen an bestimmte Bundeslaender senden. Die Bundesdruckerei betreibt den deutschen Peppol-Authority-Knoten.\n\nRechnungsWerk unterstuetzt den Export im Peppol-BIS-Format und plant die direkte Anbindung an zertifizierte Peppol-Access-Points, sodass E-Rechnungen direkt aus der Anwendung ueber das Peppol-Netzwerk versendet werden koennen.',
    relatedTerms: ['xrechnung', 'ubl', 'en-16931'],
    category: 'technik',
  },
  {
    slug: 'ubl',
    name: 'UBL (Universal Business Language)',
    shortDefinition:
      'UBL ist ein internationaler XML-Standard fuer Geschaeftsdokumente, der eine der beiden zugelassenen Syntaxen der europaeischen E-Rechnungsnorm EN 16931 bildet.',
    longDefinition:
      'Universal Business Language (UBL) 2.1 ist ein von OASIS entwickelter XML-Standard, der Geschaeftsdokumente wie Rechnungen, Bestellungen und Lieferscheine in einem maschinenlesbaren Format beschreibt. Im Kontext der europaeischen E-Rechnung ist UBL eine der beiden zugelassenen Syntaxen neben UN/CEFACT CII.\n\nDie deutsche XRechnung nutzt primaer die UBL-Syntax, was bedeutet, dass die meisten E-Rechnungen an oeffentliche Auftraggeber als UBL-XML-Dateien uebermittelt werden. UBL definiert praezise XML-Elemente fuer alle rechnungsrelevanten Informationen — von der Rechnungsnummer ueber einzelne Positionen bis zu Steuersaetzen und Zahlungskonditionen.\n\nDer Vorteil von UBL liegt in seiner weiten Verbreitung: Neben Europa setzen auch Laender in Asien und Lateinamerika auf UBL. RechnungsWerk generiert XRechnungen standardmaessig in der UBL-Syntax und stellt durch integrierte Validierung sicher, dass alle Pflichtfelder korrekt befuellt sind.',
    relatedTerms: ['xrechnung', 'cii', 'en-16931'],
    category: 'format',
  },
  {
    slug: 'cii',
    name: 'CII (Cross Industry Invoice)',
    shortDefinition:
      'CII ist ein von UN/CEFACT entwickeltes XML-Format fuer elektronische Rechnungen und bildet neben UBL die zweite zugelassene Syntax der EN 16931.',
    longDefinition:
      'Cross Industry Invoice (CII) ist ein XML-basiertes Rechnungsformat, das von der UN/CEFACT (United Nations Centre for Trade Facilitation and Electronic Business) entwickelt wurde. Im Rahmen der europaeischen Norm EN 16931 ist CII neben UBL die zweite zugelassene Syntax fuer elektronische Rechnungen.\n\nDer wichtigste Anwendungsfall von CII in Deutschland ist das ZUGFeRD-Format: Die in ein ZUGFeRD-PDF eingebettete XML-Datei folgt der CII-Syntax. Waehrend XRechnungen typischerweise als UBL-Dateien uebermittelt werden, nutzt ZUGFeRD also CII als technische Grundlage. Die semantischen Inhalte sind jedoch identisch, da beide Syntaxen dasselbe Datenmodell der EN 16931 abbilden.\n\nRechnungsWerk unterstuetzt sowohl UBL als auch CII und waehlt automatisch die richtige Syntax je nach Zielformat. Bei der Erstellung einer ZUGFeRD-Rechnung wird CII verwendet, bei einer XRechnung standardmaessig UBL.',
    relatedTerms: ['zugferd', 'ubl', 'en-16931'],
    category: 'format',
  },
  {
    slug: 'gobd',
    name: 'GoBD',
    shortDefinition:
      'Die GoBD (Grundsaetze zur ordnungsmaessigen Fuehrung und Aufbewahrung von Buechern, Aufzeichnungen und Unterlagen in elektronischer Form) regeln die digitale Buchfuehrung und Archivierung in Deutschland.',
    longDefinition:
      'Die GoBD sind ein Schreiben des Bundesministeriums der Finanzen, das festlegt, wie Unternehmen ihre Buchfuehrung und Belegarchivierung in elektronischer Form organisieren muessen. Die Grundsaetze gelten fuer alle Steuerpflichtigen und umfassen Anforderungen an Nachvollziehbarkeit, Unveraenderbarkeit, Vollstaendigkeit und zeitgerechte Erfassung von Geschaeftsvorfaellen.\n\nEin zentraler Aspekt der GoBD ist die revisionssichere Archivierung: Elektronische Rechnungen muessen im Originalformat aufbewahrt werden — ein Ausdruck auf Papier genuegt nicht. Aenderungen an gespeicherten Dokumenten muessen protokolliert werden (Aenderungshistorie). Die Aufbewahrungsfrist betraegt in der Regel 10 Jahre fuer Rechnungen und 6 Jahre fuer Geschaeftsbriefe.\n\nRechnungsWerk speichert alle E-Rechnungen GoBD-konform mit Zeitstempel, Aenderungsprotokoll und Originalformat. Die integrierte Verfahrensdokumentation beschreibt alle Prozesse der Rechnungserstellung und -archivierung und erfuellt damit eine weitere zentrale GoBD-Anforderung.',
    relatedTerms: ['verfahrensdokumentation', 'datev', 'e-rechnungspflicht'],
    category: 'recht',
  },
  {
    slug: 'skr03',
    name: 'SKR03',
    shortDefinition:
      'SKR03 ist ein Standardkontenrahmen fuer die Buchfuehrung in Deutschland, der nach Prozessgliederung aufgebaut ist und vor allem von kleinen und mittleren Unternehmen genutzt wird.',
    longDefinition:
      'Der Standardkontenrahmen 03 (SKR03) ist einer der am haeufigsten verwendeten Kontenrahmen in der deutschen Buchfuehrung. Er wurde von DATEV entwickelt und folgt dem Prozessgliederungsprinzip — das bedeutet, die Konten sind nach betrieblichen Ablaeufen geordnet: Finanzkonten, Abgrenzungskonten, Wareneingangs- und Warenausgangskonten, Betriebliche Aufwendungen und Ertraege.\n\nFuer die Rechnungsstellung ist der SKR03 relevant, weil jede Buchung einem bestimmten Konto zugeordnet wird. Erloese aus Rechnungen werden typischerweise auf Konten der Klasse 8 (z. B. 8400 fuer Erloese 19 % USt.) gebucht. Die korrekte Kontenzuordnung ist entscheidend fuer die Umsatzsteuervoranmeldung und den Jahresabschluss.\n\nRechnungsWerk unterstuetzt sowohl SKR03 als auch SKR04 und ordnet Rechnungspositionen automatisch den richtigen Konten zu. Der DATEV-Export ermoeglicht die nahtlose Uebergabe der Buchungsdaten an den Steuerberater.',
    relatedTerms: ['skr04', 'kontenrahmen', 'datev'],
    category: 'buchhaltung',
  },
  {
    slug: 'skr04',
    name: 'SKR04',
    shortDefinition:
      'SKR04 ist ein erweiterter Standardkontenrahmen, der nach dem Abschlussgliederungsprinzip aufgebaut ist und sich an der Struktur von Bilanz und GuV orientiert.',
    longDefinition:
      'Der Standardkontenrahmen 04 (SKR04) folgt dem Abschlussgliederungsprinzip und orientiert sich an der Struktur von Bilanz und Gewinn-und-Verlustrechnung. Im Gegensatz zum prozessorientierten SKR03 sind die Konten im SKR04 so angeordnet, wie sie im Jahresabschluss erscheinen: Anlage- und Umlaufvermoegen, Eigenkapital, Verbindlichkeiten, Erloese und Aufwendungen.\n\nSKR04 wird haeufig von groesseren Unternehmen und Kapitalgesellschaften bevorzugt, da die Kontenstruktur die Erstellung von Bilanz und GuV vereinfacht. Im SKR04 werden Erloese auf Konten der Klasse 4 gebucht (z. B. 4400 fuer Erloese 19 % USt.), waehrend dies im SKR03 auf Konten der Klasse 8 erfolgt.\n\nBei der Einrichtung von RechnungsWerk waehlen Nutzer ihren bevorzugten Kontenrahmen. Das System passt die Kontenzuordnung fuer den DATEV-Export automatisch an und stellt sicher, dass Buchungssaetze korrekt uebermittelt werden — unabhaengig davon, ob SKR03 oder SKR04 verwendet wird.',
    relatedTerms: ['skr03', 'kontenrahmen', 'datev'],
    category: 'buchhaltung',
  },
  {
    slug: 'ust-idnr',
    name: 'USt-IdNr.',
    shortDefinition:
      'Die Umsatzsteuer-Identifikationsnummer (USt-IdNr.) ist eine eindeutige Kennung fuer Unternehmen im EU-Binnenmarkt, die fuer grenzueberschreitende B2B-Geschaefte erforderlich ist.',
    longDefinition:
      'Die Umsatzsteuer-Identifikationsnummer wird vom Bundeszentralamt fuer Steuern vergeben und dient der eindeutigen Identifikation von Unternehmen bei innergemeinschaftlichen Geschaeften in der EU. Sie beginnt mit dem Laenderkennzeichen (z. B. DE fuer Deutschland) gefolgt von einer neunstelligen Nummer.\n\nAuf Rechnungen ist die USt-IdNr. eine Pflichtangabe, sobald Umsatzsteuer ausgewiesen wird. Bei grenzueberschreitenden B2B-Lieferungen innerhalb der EU ist sie zudem Voraussetzung fuer die Anwendung des Reverse-Charge-Verfahrens und die steuerfreie innergemeinschaftliche Lieferung. Die Gueltigkeit einer auslaendischen USt-IdNr. kann ueber das VIES-System (VAT Information Exchange System) der EU geprueft werden.\n\nRechnungsWerk speichert die USt-IdNr. im Kundenstamm und traegt sie automatisch auf jede Rechnung ein. Bei EU-Geschaeftspartnern bietet das System eine VIES-Validierung an, um die Korrektheit der Nummer zu ueberpruefen und das Reverse-Charge-Verfahren automatisch anzuwenden.',
    relatedTerms: ['reverse-charge', 'rechnungspflichtangaben', 'umsatzsteuervoranmeldung'],
    category: 'steuer',
  },
  {
    slug: 'reverse-charge',
    name: 'Reverse Charge',
    shortDefinition:
      'Reverse Charge (Steuerschuldumkehr) ist ein Verfahren, bei dem nicht der Leistende, sondern der Leistungsempfaenger die Umsatzsteuer schuldet — relevant bei grenzueberschreitenden B2B-Geschaeften in der EU.',
    longDefinition:
      'Das Reverse-Charge-Verfahren nach Paragraph 13b UStG kehrt die Steuerschuldnerschaft um: Statt dass der leistende Unternehmer die Umsatzsteuer in Rechnung stellt und abfuehrt, uebernimmt der Leistungsempfaenger diese Pflicht. Er berechnet die Steuer selbst, meldet sie in seiner Umsatzsteuervoranmeldung an und kann sie gleichzeitig als Vorsteuer geltend machen.\n\nDas Verfahren gilt zwingend bei bestimmten grenzueberschreitenden B2B-Dienstleistungen innerhalb der EU, bei Bauleistungen nach Paragraph 13b Abs. 2 Nr. 4 UStG sowie bei der Lieferung bestimmter Waren wie Mobiltelefonen oder Metallen. Die Rechnung muss den Hinweis auf die Steuerschuldumkehr enthalten und darf keine deutsche Umsatzsteuer ausweisen.\n\nRechnungsWerk erkennt automatisch, wenn das Reverse-Charge-Verfahren anzuwenden ist — basierend auf dem Sitz des Geschaeftspartners und der Art der Leistung. Der korrekte Hinweistext wird automatisch eingefuegt und die Steuerberechnung entsprechend angepasst.',
    relatedTerms: ['ust-idnr', 'vorsteuerabzug', 'umsatzsteuervoranmeldung'],
    category: 'steuer',
  },
  {
    slug: 'kleinunternehmerregelung',
    name: 'Kleinunternehmerregelung',
    shortDefinition:
      'Die Kleinunternehmerregelung nach Paragraph 19 UStG befreit Unternehmen mit geringem Umsatz von der Umsatzsteuerpflicht, verbietet aber gleichzeitig den Vorsteuerabzug.',
    longDefinition:
      'Die Kleinunternehmerregelung ist eine Vereinfachung im deutschen Umsatzsteuerrecht fuer Unternehmen, deren Umsatz im Vorjahr 22.000 Euro nicht ueberschritten hat und im laufenden Jahr voraussichtlich 50.000 Euro nicht uebersteigen wird. Kleinunternehmer muessen keine Umsatzsteuer auf ihren Rechnungen ausweisen und keine Umsatzsteuervoranmeldungen abgeben.\n\nAuf Rechnungen von Kleinunternehmern muss ein Hinweis auf die Anwendung der Kleinunternehmerregelung stehen, beispielsweise: "Gemaess Paragraph 19 UStG wird keine Umsatzsteuer berechnet." Der fehlende USt-Ausweis bedeutet auch, dass Kleinunternehmer keinen Vorsteuerabzug aus Eingangsrechnungen geltend machen koennen.\n\nRechnungsWerk bietet einen speziellen Kleinunternehmer-Modus, der den USt-Ausweis automatisch unterdrueckt und den Pflichthinweis auf die Regelung in jede Rechnung einfuegt. Wenn ein Unternehmen die Umsatzgrenze ueberschreitet, kann der Modus einfach deaktiviert werden, und alle Folgerechnungen enthalten dann den regulaeren USt-Ausweis.',
    relatedTerms: ['vorsteuerabzug', 'umsatzsteuervoranmeldung', 'rechnungspflichtangaben'],
    category: 'steuer',
  },
  {
    slug: 'datev',
    name: 'DATEV',
    shortDefinition:
      'DATEV ist eine Genossenschaft fuer Steuerberater, Wirtschaftspruefer und Rechtsanwaelte, deren Software-Oekosystem den De-facto-Standard fuer den Datenaustausch in der deutschen Steuerberatung bildet.',
    longDefinition:
      'Die DATEV eG mit Sitz in Nuernberg ist der groesste europaeische IT-Dienstleister fuer Steuerberater, Wirtschaftspruefer und Rechtsanwaelte. Rund 40.000 Kanzleien und ueber 2,5 Millionen Unternehmen nutzen DATEV-Software fuer Buchfuehrung, Lohnabrechnung und Steuererklarerungen. Der DATEV-Export ist damit der wichtigste Schnittstelle zwischen Unternehmen und Steuerberater.\n\nDas DATEV-Format ermoeglicht die strukturierte Uebergabe von Buchungsdaten, Rechnungsdokumenten und Stammdaten. Gaengige Formate sind das DATEV-Buchungsstapel-Format (fuer Buchungssaetze) und DATEV Unternehmen online (fuer die direkte digitale Zusammenarbeit). Steuerberater koennen ueber diese Schnittstellen Rechnungsdaten direkt in die Finanzbuchfuehrung uebernehmen.\n\nRechnungsWerk bietet einen nativen DATEV-Export, der Buchungssaetze im DATEV-Format erzeugt und Rechnungsdokumente fuer DATEV Unternehmen online bereitstellt. So entfaellt das manuelle Abtippen von Rechnungsdaten beim Steuerberater vollstaendig.',
    relatedTerms: ['skr03', 'skr04', 'gobd'],
    category: 'technik',
  },
  {
    slug: 'verfahrensdokumentation',
    name: 'Verfahrensdokumentation',
    shortDefinition:
      'Die Verfahrensdokumentation ist ein GoBD-Pflichtdokument, das alle Prozesse der Buchfuehrung, Belegerfassung und Archivierung eines Unternehmens beschreibt.',
    longDefinition:
      'Die Verfahrensdokumentation ist eine der zentralen Anforderungen der GoBD und beschreibt lueckenlos, wie ein Unternehmen seine Buchfuehrung und Belegverwaltung organisiert. Sie umfasst vier Bestandteile: die allgemeine Beschreibung des Systems, die Anwenderdokumentation, die technische Systemdokumentation und die Betriebsdokumentation.\n\nJedes Unternehmen, das elektronische Rechnungen erstellt, empfaengt oder archiviert, benoetigt eine Verfahrensdokumentation. Diese muss beschreiben, welche Software eingesetzt wird, wie Belege erfasst und verarbeitet werden, wie die Archivierung erfolgt und welche internen Kontrollen existieren. Bei einer Betriebspruefung kann das Finanzamt die Verfahrensdokumentation anfordern.\n\nRechnungsWerk stellt eine vorgefertigte Verfahrensdokumentation fuer den E-Rechnungsprozess bereit, die Unternehmen an ihre individuellen Gegebenheiten anpassen koennen. Diese deckt den gesamten Prozess von der Rechnungserstellung ueber den Versand bis zur GoBD-konformen Archivierung ab.',
    relatedTerms: ['gobd', 'e-rechnungspflicht', 'datev'],
    category: 'recht',
  },
  {
    slug: 'e-rechnungspflicht',
    name: 'E-Rechnungspflicht',
    shortDefinition:
      'Die E-Rechnungspflicht verpflichtet Unternehmen in Deutschland seit 2025 zum Empfang und ab 2027/2028 zum Versand strukturierter elektronischer Rechnungen im B2B-Bereich.',
    longDefinition:
      'Mit dem Wachstumschancengesetz hat Deutschland die stufenweise Einfuehrung der E-Rechnungspflicht im B2B-Bereich beschlossen. Seit dem 1. Januar 2025 muessen alle Unternehmen in der Lage sein, E-Rechnungen zu empfangen. Ab 2027 muessen Unternehmen mit einem Vorjahresumsatz ueber 800.000 Euro E-Rechnungen versenden, ab 2028 gilt die Pflicht fuer alle Unternehmen.\n\nAls E-Rechnung im Sinne des Gesetzes gilt nur eine Rechnung in einem strukturierten elektronischen Format, das der EN 16931 entspricht — also XRechnung oder ZUGFeRD. Einfache PDF-Rechnungen zaehlen nicht als E-Rechnung. Im oeffentlichen Sektor gilt die E-Rechnungspflicht bereits seit 2020 (Bund) bzw. landesspezifisch.\n\nRechnungsWerk wurde speziell fuer die E-Rechnungspflicht entwickelt und unterstuetzt Unternehmen bei allen Aspekten: Erstellung konformer XRechnungen und ZUGFeRD-Rechnungen, Empfang und Verarbeitung eingehender E-Rechnungen sowie GoBD-konforme Archivierung. Mit dem kostenlosen Free-Plan koennen Unternehmen sofort starten.',
    relatedTerms: ['xrechnung', 'zugferd', 'en-16931'],
    category: 'recht',
  },
  {
    slug: 'rechnungspflichtangaben',
    name: 'Pflichtangaben einer Rechnung',
    shortDefinition:
      'Die Pflichtangaben einer Rechnung nach Paragraph 14 UStG umfassen alle gesetzlich vorgeschriebenen Informationen, die eine Rechnung enthalten muss, um zum Vorsteuerabzug zu berechtigen.',
    longDefinition:
      'Das Umsatzsteuergesetz schreibt in Paragraph 14 Abs. 4 UStG zehn Pflichtangaben vor, die jede Rechnung enthalten muss: vollstaendiger Name und Anschrift des leistenden Unternehmers und des Leistungsempfaengers, Steuernummer oder USt-IdNr. des leistenden Unternehmers, Ausstellungsdatum, fortlaufende Rechnungsnummer, Menge und Art der gelieferten Gegenstaende oder Umfang der Leistung, Zeitpunkt der Lieferung oder Leistung, Nettoentgelt aufgeschluesselt nach Steuersaetzen, anzuwendender Steuersatz und Steuerbetrag sowie ggf. Hinweis auf Steuerbefreiung.\n\nFehlt eine Pflichtangabe, kann der Rechnungsempfaenger den Vorsteuerabzug verlieren. Bei Kleinbetragsrechnungen bis 250 Euro gelten vereinfachte Anforderungen. Bei E-Rechnungen im XRechnung- oder ZUGFeRD-Format werden diese Pflichtangaben als strukturierte Datenfelder abgebildet.\n\nRechnungsWerk stellt durch Pflichtfeld-Validierung sicher, dass keine gesetzliche Angabe vergessen wird. Das System prueft vor der Rechnungserstellung, ob alle Pflichtangaben vollstaendig sind, und weist auf fehlende Informationen hin.',
    relatedTerms: ['ust-idnr', 'vorsteuerabzug', 'kleinunternehmerregelung'],
    category: 'recht',
  },
  {
    slug: 'vorsteuerabzug',
    name: 'Vorsteuerabzug',
    shortDefinition:
      'Der Vorsteuerabzug ermoeglicht Unternehmen, die in Eingangsrechnungen enthaltene Umsatzsteuer (Vorsteuer) mit der eigenen Umsatzsteuerschuld zu verrechnen.',
    longDefinition:
      'Der Vorsteuerabzug ist ein zentrales Prinzip des Umsatzsteuersystems und stellt sicher, dass die Umsatzsteuer letztlich nur den Endverbraucher belastet. Unternehmen koennen die Umsatzsteuer, die ihnen von Lieferanten in Rechnung gestellt wurde (Vorsteuer), von ihrer eigenen Umsatzsteuerschuld abziehen. Die Differenz wird an das Finanzamt abgefuehrt oder erstattet.\n\nVoraussetzung fuer den Vorsteuerabzug ist eine ordnungsgemaesse Rechnung mit allen Pflichtangaben nach Paragraph 14 UStG. Fehlt beispielsweise die Steuernummer des Rechnungsstellers oder ist die Rechnungsnummer nicht fortlaufend, kann das Finanzamt den Vorsteuerabzug versagen. Bei E-Rechnungen muessen die entsprechenden Datenfelder korrekt befuellt sein.\n\nRechnungsWerk unterstuetzt den Vorsteuerabzug auf beiden Seiten: Ausgangsrechnungen enthalten automatisch alle Pflichtangaben, und Eingangsrechnungen werden per OCR erfasst und auf Vollstaendigkeit geprueft. So koennen Unternehmen sicher sein, dass ihnen kein Vorsteuerabzug verloren geht.',
    relatedTerms: ['rechnungspflichtangaben', 'umsatzsteuervoranmeldung', 'reverse-charge'],
    category: 'steuer',
  },
  {
    slug: 'umsatzsteuervoranmeldung',
    name: 'Umsatzsteuervoranmeldung (UStVA)',
    shortDefinition:
      'Die Umsatzsteuervoranmeldung ist eine monatliche oder vierteljaehrliche Meldung an das Finanzamt, in der Unternehmen ihre Umsatzsteuer und Vorsteuer deklarieren.',
    longDefinition:
      'Die Umsatzsteuervoranmeldung (UStVA) ist eine periodische Steuererklarerung, die Unternehmen elektronisch ueber ELSTER an das Finanzamt uebermitteln muessen. Je nach Vorjahres-Steuerlast ist die Abgabe monatlich (Steuerlast ueber 7.500 Euro) oder vierteljaehrlich (Steuerlast unter 7.500 Euro) erforderlich. Die Abgabefrist ist der 10. des Folgemonats, mit Dauerfristverlaengerung der 10. des uebernachsten Monats.\n\nIn der UStVA werden alle steuerrelevanten Umsaetze zusammengefasst: steuerpflichtige Lieferungen und Leistungen zu verschiedenen Steuersaetzen, steuerfreie Umsaetze, innergemeinschaftliche Lieferungen, Reverse-Charge-Umsaetze und die abziehbare Vorsteuer. Die Differenz zwischen Umsatzsteuer und Vorsteuer ergibt die Zahllast oder den Erstattungsanspruch.\n\nRechnungsWerk bereitet die Daten fuer die UStVA automatisch vor: Alle Ausgangs- und Eingangsrechnungen werden nach den relevanten Steuerkennzeichen sortiert und summiert. Das Ergebnis kann direkt in ELSTER uebernommen oder dem Steuerberater via DATEV-Export bereitgestellt werden.',
    relatedTerms: ['vorsteuerabzug', 'reverse-charge', 'ust-idnr'],
    category: 'steuer',
  },
  {
    slug: 'buchungssatz',
    name: 'Buchungssatz',
    shortDefinition:
      'Ein Buchungssatz ist die Anweisung zur doppelten Buchfuehrung nach dem Prinzip "Soll an Haben", die jeden Geschaeftsvorfall auf mindestens zwei Konten erfasst.',
    longDefinition:
      'Der Buchungssatz ist das Grundelement der doppelten Buchfuehrung (Doppik), die in Deutschland fuer Kaufleute gesetzlich vorgeschrieben ist. Jeder Geschaeftsvorfall wird auf mindestens zwei Konten gebucht: eines im Soll und eines im Haben. Das Prinzip "Soll an Haben" stellt sicher, dass die Bilanz stets ausgeglichen bleibt.\n\nBei einer Ausgangsrechnung lautet ein typischer Buchungssatz beispielsweise: "Forderungen aus Lieferungen und Leistungen (Soll) an Erloese (Haben) und Umsatzsteuer (Haben)". Bei Zahlungseingang wird gebucht: "Bank (Soll) an Forderungen (Haben)". Zusammengesetzte Buchungssaetze mit mehr als zwei Konten sind ebenfalls ueblich.\n\nRechnungsWerk erzeugt fuer jede Rechnung automatisch den korrekten Buchungssatz auf Basis des gewaehlten Kontenrahmens (SKR03 oder SKR04). Im DATEV-Export werden diese Buchungssaetze in einem Format bereitgestellt, das der Steuerberater direkt in die Finanzbuchfuehrung uebernehmen kann.',
    relatedTerms: ['kontenrahmen', 'skr03', 'debitor'],
    category: 'buchhaltung',
  },
  {
    slug: 'kontenrahmen',
    name: 'Kontenrahmen',
    shortDefinition:
      'Ein Kontenrahmen ist ein systematisches Verzeichnis aller Konten, die in der Buchfuehrung eines Unternehmens verwendet werden koennen, und bildet die Grundlage fuer den Kontenplan.',
    longDefinition:
      'Der Kontenrahmen ist ein branchenuebergreifendes oder branchenspezifisches Ordnungssystem, das alle moeglichen Konten fuer die Buchfuehrung systematisch gliedert. In Deutschland werden hauptsaechlich die Standardkontenrahmen SKR03 (nach Prozessgliederungsprinzip) und SKR04 (nach Abschlussgliederungsprinzip) verwendet, die beide von DATEV entwickelt wurden.\n\nAus dem Kontenrahmen leitet jedes Unternehmen seinen individuellen Kontenplan ab, indem es nur die Konten uebernimmt, die fuer seine Geschaeftstaetigkeit relevant sind. Beispielsweise benoetigt ein IT-Dienstleister keine Konten fuer Warenbestand, waehrend ein Einzelhaendler diese zwingend braucht. Die Kontenklassen 0-3 enthalten Bestandskonten (Bilanz), die Klassen 4/5 bzw. 6/7 Aufwands- und Ertragskonten (GuV).\n\nRechnungsWerk unterstuetzt die gaengigen Kontenrahmen und ordnet Rechnungspositionen automatisch den richtigen Konten zu. Bei der Ersteinrichtung waehlen Nutzer zwischen SKR03 und SKR04, und das System generiert passende Buchungssaetze fuer den DATEV-Export.',
    relatedTerms: ['skr03', 'skr04', 'buchungssatz'],
    category: 'buchhaltung',
  },
  {
    slug: 'debitor',
    name: 'Debitor',
    shortDefinition:
      'Ein Debitor ist ein Schuldner, der einem Unternehmen Geld schuldet — typischerweise ein Kunde, dem eine Rechnung gestellt wurde, die noch nicht bezahlt ist.',
    longDefinition:
      'In der Buchfuehrung bezeichnet der Begriff Debitor den Schuldner einer Forderung. Wenn ein Unternehmen eine Rechnung an einen Kunden stellt, wird dieser zum Debitor: Er schuldet den Rechnungsbetrag bis zum Ablauf des Zahlungsziels. Die Gesamtheit aller offenen Forderungen wird in der Debitorenbuchhaltung verwaltet.\n\nDie Debitorenbuchhaltung ist ein Teilbereich der Finanzbuchfuehrung und umfasst die Erfassung von Ausgangsrechnungen, die Ueberwachung von Zahlungseingaengen, die Zuordnung von Zahlungen zu offenen Posten und das Mahnwesen bei Zahlungsverzug. Jeder Debitor erhaelt in der Regel ein eigenes Personenkonto (Debitorenkonto), das im Kontenrahmen in der Klasse 1 (SKR03) bzw. Klasse 1 (SKR04) gefuehrt wird.\n\nRechnungsWerk verwaltet Debitoren automatisch: Bei der Rechnungserstellung wird der Kunde als Debitor erfasst, Zahlungseingaenge koennen zugeordnet werden, und ueberfaellige Forderungen werden fuer das Mahnwesen markiert.',
    relatedTerms: ['kreditor', 'mahnung', 'zahlungsziel'],
    category: 'buchhaltung',
  },
  {
    slug: 'kreditor',
    name: 'Kreditor',
    shortDefinition:
      'Ein Kreditor ist ein Glaeubiger, dem ein Unternehmen Geld schuldet — typischerweise ein Lieferant, dessen Rechnung noch nicht bezahlt wurde.',
    longDefinition:
      'Der Kreditor ist das Gegenstueck zum Debitor: Es handelt sich um einen Geschaeftspartner, gegenueber dem ein Unternehmen eine Verbindlichkeit hat. Wenn ein Unternehmen eine Eingangsrechnung von einem Lieferanten erhaelt, wird dieser zum Kreditor. Die Verwaltung aller offenen Verbindlichkeiten erfolgt in der Kreditorenbuchhaltung.\n\nDie Kreditorenbuchhaltung umfasst die Erfassung von Eingangsrechnungen, die Pruefung auf sachliche und rechnerische Richtigkeit, die Freigabe zur Zahlung und die termingerechte Begleichung von Verbindlichkeiten. Jeder Kreditor erhaelt ein eigenes Personenkonto (Kreditorenkonto), das im Kontenrahmen in der Klasse 7 (SKR03) bzw. Klasse 3 (SKR04) gefuehrt wird.\n\nRechnungsWerk unterstuetzt die Kreditorenverwaltung durch die automatische Erfassung von Eingangsrechnungen per OCR-Erkennung. Eingehende PDF- und E-Rechnungen werden analysiert, die Rechnungsdaten extrahiert und dem entsprechenden Kreditorenkonto zugeordnet.',
    relatedTerms: ['debitor', 'vorsteuerabzug', 'buchungssatz'],
    category: 'buchhaltung',
  },
  {
    slug: 'mahnung',
    name: 'Mahnung',
    shortDefinition:
      'Eine Mahnung ist eine formelle Zahlungserinnerung an einen Schuldner, die nach Ablauf des Zahlungsziels versendet wird und im dreistufigen Mahnverfahren eskaliert werden kann.',
    longDefinition:
      'Die Mahnung ist ein wesentliches Instrument des Forderungsmanagements. Wenn ein Debitor eine Rechnung nicht innerhalb des vereinbarten Zahlungsziels begleicht, wird er mit einer Mahnung zur Zahlung aufgefordert. Das klassische Mahnverfahren erfolgt in drei Stufen: freundliche Zahlungserinnerung, erste Mahnung mit Fristsetzung und letzte Mahnung mit Androhung rechtlicher Schritte.\n\nRechtlich tritt der Verzug nach Paragraph 286 BGB ein, wenn der Schuldner trotz Faelligkeit und Mahnung nicht zahlt. Bei Rechnungen mit konkretem Zahlungsziel tritt der Verzug automatisch 30 Tage nach Faelligkeit ein (Paragraph 286 Abs. 3 BGB bei B2B). Ab Verzugseintritt kann der Glaeubiger Verzugszinsen (5 Prozentpunkte ueber Basiszinssatz bei B2C, 9 Prozentpunkte bei B2B) und eine Mahnpauschale von 40 Euro verlangen.\n\nRechnungsWerk ueberwacht automatisch die Zahlungsziele aller Ausgangsrechnungen und erzeugt Mahnvorschlaege fuer ueberfaellige Forderungen. Die Mahnungen koennen als E-Rechnung oder PDF erstellt und direkt versendet werden.',
    relatedTerms: ['debitor', 'zahlungsziel', 'skonto'],
    category: 'buchhaltung',
  },
  {
    slug: 'zahlungsziel',
    name: 'Zahlungsziel',
    shortDefinition:
      'Das Zahlungsziel ist die Frist, innerhalb derer ein Rechnungsbetrag beglichen werden muss, und wird auf der Rechnung als konkretes Datum oder Frist angegeben.',
    longDefinition:
      'Das Zahlungsziel definiert den Zeitraum, in dem der Rechnungsempfaenger die Rechnung begleichen muss. Uebliche Zahlungsziele in Deutschland liegen zwischen 14 und 30 Tagen netto, haeufig kombiniert mit Skonto-Angeboten (z. B. "2 % Skonto bei Zahlung innerhalb von 10 Tagen, 30 Tage netto"). Das Zahlungsziel ist eine Pflichtangabe auf der Rechnung.\n\nGesetzlich gilt nach Paragraph 271 BGB, dass Forderungen sofort faellig sind, wenn kein abweichendes Zahlungsziel vereinbart wurde. Im B2B-Bereich tritt der Verzug spaetestens 30 Tage nach Zugang der Rechnung ein (Paragraph 286 Abs. 3 BGB). Im B2C-Bereich muss auf diesen automatischen Verzugseintritt in der Rechnung hingewiesen werden.\n\nRechnungsWerk ermoeglicht die Konfiguration individueller Zahlungsziele pro Kunde. Das System berechnet automatisch das Faelligkeitsdatum, ueberwacht den Zahlungseingang und markiert ueberfaellige Rechnungen fuer das Mahnwesen. Skonto-Bedingungen werden separat erfasst und auf der Rechnung ausgewiesen.',
    relatedTerms: ['skonto', 'mahnung', 'debitor'],
    category: 'buchhaltung',
  },
  {
    slug: 'skonto',
    name: 'Skonto',
    shortDefinition:
      'Skonto ist ein prozentualer Preisnachlass, den der Rechnungssteller gewaehrt, wenn der Rechnungsempfaenger innerhalb einer verkuerzten Frist zahlt.',
    longDefinition:
      'Skonto ist ein gaengiges Instrument im Geschaeftsverkehr, um schnelle Zahlungen zu foerdern. Typischerweise wird ein Nachlass von 2 bis 3 Prozent auf den Rechnungsbetrag gewaehrt, wenn die Zahlung innerhalb einer verkuerzten Frist (z. B. 10 Tage statt 30 Tage) erfolgt. Die Skonto-Bedingungen werden auf der Rechnung vermerkt, beispielsweise: "Zahlbar innerhalb von 10 Tagen abzueglich 2 % Skonto oder innerhalb von 30 Tagen netto."\n\nAus buchhalterischer Sicht muss der Skontoabzug beim Zahlungsempfaenger als Erloesminderung und beim Zahlenden als Aufwandsminderung gebucht werden. Die Umsatzsteuer ist auf den geminderten Betrag zu berechnen. Die korrekte Verbuchung erfordert daher eine Anpassung der Umsatzsteuer sowohl beim Rechnungssteller als auch beim Rechnungsempfaenger.\n\nRechnungsWerk bildet Skonto-Vereinbarungen vollstaendig ab: Die Bedingungen werden auf der Rechnung ausgewiesen, bei Zahlungseingang mit Skontoabzug wird der Buchungssatz automatisch angepasst, und die korrigierte Umsatzsteuer wird in der naechsten UStVA beruecksichtigt.',
    relatedTerms: ['zahlungsziel', 'buchungssatz', 'vorsteuerabzug'],
    category: 'buchhaltung',
  },
  {
    slug: 'gutschrift',
    name: 'Gutschrift',
    shortDefinition:
      'Eine kaufmaennische Gutschrift ist eine Korrekturrechnung, die einen Rechnungsbetrag ganz oder teilweise storniert — zu unterscheiden von der umsatzsteuerlichen Gutschrift (Abrechnungsgutschrift).',
    longDefinition:
      'Im Geschaeftsalltag wird der Begriff Gutschrift in zwei verschiedenen Bedeutungen verwendet. Die kaufmaennische Gutschrift (auch Korrekturrechnung oder Stornorechnung) wird erstellt, wenn eine bereits gestellte Rechnung korrigiert werden muss — etwa bei Retouren, Rabatten oder fehlerhaften Rechnungen. Sie mindert die urspruengliche Forderung und muss die gleichen Pflichtangaben enthalten wie eine Rechnung, einschliesslich eines Verweises auf die Originalrechnung.\n\nDie umsatzsteuerliche Gutschrift nach Paragraph 14 Abs. 2 Satz 2 UStG ist dagegen eine Rechnung, die der Leistungsempfaenger anstelle des Leistenden erstellt (Abrechnungsgutschrift). Dies ist insbesondere bei komplexen Lieferbeziehungen ueblich, wenn der Empfaenger den Abrechnungsprozess uebernimmt.\n\nRechnungsWerk unterscheidet klar zwischen beiden Gutschriftarten. Kaufmaennische Gutschriften werden als Korrekturrechnung mit Bezug zur Originalrechnung erstellt und mindern den Umsatz in der UStVA automatisch. Alle Gutschriften erhalten eine eigene fortlaufende Nummer und werden GoBD-konform archiviert.',
    relatedTerms: ['storno', 'rechnungspflichtangaben', 'buchungssatz'],
    category: 'buchhaltung',
  },
  {
    slug: 'storno',
    name: 'Storno',
    shortDefinition:
      'Ein Storno ist die vollstaendige Rueckgaengigmachung einer Buchung oder Rechnung und erfordert eine Gegenbuchung, die den urspruenglichen Geschaeftsvorfall neutralisiert.',
    longDefinition:
      'Ein Storno macht eine fehlerhafte Buchung oder Rechnung vollstaendig rueckgaengig, indem eine Gegenbuchung mit identischem Betrag aber umgekehrten Vorzeichen erstellt wird. Im Gegensatz zu einer Korrektur, bei der nur einzelne Fehler behoben werden, neutralisiert ein Storno den gesamten Geschaeftsvorfall. Die GoBD schreiben vor, dass Stornierungen nachvollziehbar dokumentiert werden muessen — ein einfaches Loeschen der Originalbuchung ist nicht zulaessig.\n\nBei E-Rechnungen erfolgt ein Storno durch die Erstellung einer Stornorechnung (auch Korrekturbuchung oder Gutschrift). Diese muss einen eindeutigen Verweis auf die Originalrechnung enthalten, alle Pflichtangaben aufweisen und wird als negative Rechnung in der Buchfuehrung erfasst. Die Umsatzsteuer der stornierten Rechnung wird in der naechsten UStVA korrigiert.\n\nRechnungsWerk bietet eine Storno-Funktion, die mit einem Klick eine vollstaendige Stornorechnung erstellt. Diese enthaelt automatisch den Verweis auf die Originalrechnung, die korrekte Gegenbuchung und die Umsatzsteuerkorrektur. Die Aenderungshistorie wird lueckenlos dokumentiert.',
    relatedTerms: ['gutschrift', 'buchungssatz', 'gobd'],
    category: 'buchhaltung',
  },
  {
    slug: 'proforma-rechnung',
    name: 'Proforma-Rechnung',
    shortDefinition:
      'Eine Proforma-Rechnung ist ein Dokument, das den Wert einer Lieferung ausweist, aber keine Zahlungspflicht begruendet — haeufig fuer Zoll- oder Versicherungszwecke.',
    longDefinition:
      'Die Proforma-Rechnung (auch Pro-forma-Rechnung) ist ein Begleitdokument, das den Wert einer Warensendung dokumentiert, ohne eine tatsaechliche Zahlungsforderung darzustellen. Sie wird haeufig bei Mustersendungen, unentgeltlichen Lieferungen, Garantieersatzteilen oder fuer Zollzwecke im internationalen Warenverkehr verwendet. Die Proforma-Rechnung muss als solche gekennzeichnet sein, um eine Verwechslung mit einer regulaeren Rechnung zu vermeiden.\n\nIm Gegensatz zu einer regulaeren Rechnung berechtigt eine Proforma-Rechnung nicht zum Vorsteuerabzug und begruendet keine Umsatzsteuerpflicht. Sie enthaelt jedoch aehnliche Angaben wie eine regulaere Rechnung: Absender und Empfaenger, Warenbeschreibung, Wertangabe (z. B. fuer Zollzwecke), Ursprungsland und Lieferbedingungen (Incoterms).\n\nRechnungsWerk ermoeglicht die Erstellung von Proforma-Rechnungen als eigenen Dokumenttyp. Das System kennzeichnet das Dokument eindeutig als Proforma-Rechnung, weist keine Umsatzsteuer aus und verhindert die Aufnahme in die regulaere Umsatzstatistik und UStVA-Vorbereitung.',
    relatedTerms: ['rechnungspflichtangaben', 'abschlagsrechnung', 'gutschrift'],
    category: 'buchhaltung',
  },
  {
    slug: 'abschlagsrechnung',
    name: 'Abschlagsrechnung',
    shortDefinition:
      'Eine Abschlagsrechnung fordert eine Teilzahlung fuer eine noch nicht vollstaendig erbrachte Leistung an und muss spaeter in einer Schlussrechnung verrechnet werden.',
    longDefinition:
      'Die Abschlagsrechnung (auch Akontorechnung oder Anzahlungsrechnung) wird bei laengerfristigen Auftraegen erstellt, um bereits erbrachte Teilleistungen oder vereinbarte Meilensteine abzurechnen. Sie ist besonders im Handwerk, Baugewerbe und bei Projektarbeit ueblich. Paragraph 632a BGB gibt Unternehmern das Recht, Abschlagsrechnungen fuer in sich abgeschlossene Teile des Werks zu stellen.\n\nDie Umsatzsteuer wird bei Abschlagsrechnungen sofort faellig — nicht erst bei der Schlussrechnung. In der Schlussrechnung muessen alle zuvor gestellten Abschlagsrechnungen aufgefuehrt und vom Gesamtbetrag abgezogen werden. Die korrekte Verknuepfung von Abschlags- und Schlussrechnungen ist eine haeufige Fehlerquelle, insbesondere bei der Umsatzsteuerberechnung.\n\nRechnungsWerk verknuepft Abschlagsrechnungen automatisch mit dem zugrundeliegenden Auftrag und erstellt die Schlussrechnung unter korrekter Verrechnung aller Abschlaege. Die Umsatzsteuer wird in jeder Phase korrekt berechnet, und die Buchungssaetze werden automatisch angepasst.',
    relatedTerms: ['rechnungspflichtangaben', 'zahlungsziel', 'buchungssatz'],
    category: 'buchhaltung',
  },
]

export function getTermBySlug(slug: string): GlossaryTerm | undefined {
  return glossaryTerms.find((t) => t.slug === slug)
}
