export const metadata = {
  title: 'Datenschutzerklaerung — RechnungsWerk',
  description: 'Datenschutzerklaerung gemaess DSGVO fuer RechnungsWerk',
}

export default function DatenschutzPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Datenschutzerklaerung</h1>

      <div className="space-y-8 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold mb-2">1. Verantwortlicher</h2>
          <p>
            Verantwortlich fuer die Datenverarbeitung auf dieser Website ist:<br />
            RechnungsWerk<br />
            [Adresse]<br />
            E-Mail: datenschutz@rechnungswerk.de
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">2. Erhebung und Verarbeitung personenbezogener Daten</h2>
          <p>
            Wir verarbeiten personenbezogene Daten nur, soweit dies zur Bereitstellung unserer Dienste
            erforderlich ist. Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO
            (Vertragsdurchfuehrung) und Art. 6 Abs. 1 lit. f DSGVO (berechtigte Interessen).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">3. Datenkategorien</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Bestandsdaten (Name, E-Mail-Adresse, Firmenname)</li>
            <li>Rechnungsdaten (Rechnungsinhalte, Betraege, Steuernummern)</li>
            <li>Nutzungsdaten (Zugriffszeiten, IP-Adressen — anonymisiert)</li>
            <li>Zahlungsdaten (ueber Stripe verarbeitet — wir speichern keine Kreditkartendaten)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">4. Drittanbieter</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Stripe (Zahlungsabwicklung)</h3>
              <p>Stripe, Inc., 510 Townsend Street, San Francisco, CA 94103, USA. Datenschutzerklaerung: stripe.com/privacy</p>
            </div>
            <div>
              <h3 className="font-semibold">Brevo (E-Mail-Versand)</h3>
              <p>Sendinblue GmbH, Koepernikusstr. 35, 10243 Berlin. EU-Datenresidenz. Datenschutzerklaerung: brevo.com/legal/privacypolicy</p>
            </div>
            <div>
              <h3 className="font-semibold">PostHog (Analytics — Self-Hosted)</h3>
              <p>Self-hosted auf unserer eigenen Infrastruktur. Keine Daten verlassen unsere Server. Cookieless Tracking.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">5. Ihre Rechte</h2>
          <p>Sie haben gemaess DSGVO folgende Rechte:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Auskunftsrecht (Art. 15 DSGVO)</li>
            <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
            <li>Recht auf Loeschung (Art. 17 DSGVO)</li>
            <li>Recht auf Einschraenkung der Verarbeitung (Art. 18 DSGVO)</li>
            <li>Recht auf Datenuebertragbarkeit (Art. 20 DSGVO)</li>
            <li>Widerspruchsrecht (Art. 21 DSGVO)</li>
          </ul>
          <p className="mt-2">
            Kontaktieren Sie uns unter datenschutz@rechnungswerk.de oder wenden Sie sich an die zustaendige Aufsichtsbehoerde.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">6. Aufbewahrung</h2>
          <p>
            Rechnungsdaten werden gemaess den handels- und steuerrechtlichen Aufbewahrungsfristen
            (§ 147 AO, § 257 HGB) fuer 10 Jahre aufbewahrt. Nach Ablauf der Fristen werden die Daten
            geloescht.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">7. SSL/TLS-Verschluesselung</h2>
          <p>
            Diese Website nutzt aus Sicherheitsgruenden eine SSL/TLS-Verschluesselung.
            Eine verschluesselte Verbindung erkennen Sie an dem Praefix &quot;https://&quot; in der Adresszeile.
          </p>
        </section>

        <p className="text-sm opacity-50 mt-8">Stand: Februar 2026</p>
      </div>
    </main>
  )
}
