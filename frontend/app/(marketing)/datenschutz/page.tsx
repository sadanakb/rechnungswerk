import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Datenschutzerklärung | RechnungsWerk',
  description: 'Datenschutzerklärung von RechnungsWerk gemäß DSGVO (Art. 13, 14 DSGVO).',
}

export default function DatenschutzPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Datenschutzerklärung</h1>
      <p className="text-sm mb-10" style={{ color: 'rgb(var(--foreground-muted))' }}>
        Zuletzt aktualisiert: Februar 2026
      </p>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Verantwortlicher</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Verantwortlicher im Sinne der DSGVO ist: RechnungsWerk GmbH,
            [Adresse], Deutschland. Kontakt: datenschutz@rechnungswerk.de
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. Erhobene Daten</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Wir verarbeiten folgende personenbezogene Daten:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
            <li>Kontodaten: E-Mail-Adresse, Name</li>
            <li>Rechnungsdaten: Lieferantennamen, Beträge, Datumsangaben</li>
            <li>Nutzungsdaten: Login-Zeitstempel</li>
            <li>Gerätedaten für Push-Benachrichtigungen (nur mit ausdrücklicher Einwilligung)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">3. Zweck der Verarbeitung</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Daten werden ausschließlich zur Bereitstellung des RechnungsWerk-Dienstes verarbeitet
            (E-Invoicing, Buchhaltung, DATEV-Export). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
            (Vertragserfüllung).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. Aufbewahrungsfristen</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Rechnungsdaten werden gemäß § 147 AO für 10 Jahre aufbewahrt.
            Kontodaten werden nach Account-Löschung sofort und vollständig entfernt.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Deine Rechte (Art. 15–22 DSGVO)</h2>
          <ul className="list-disc pl-5 space-y-2 text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
            <li><strong>Auskunft (Art. 15):</strong> Welche Daten wir über dich speichern</li>
            <li><strong>Berichtigung (Art. 16):</strong> Korrektur unrichtiger Daten</li>
            <li><strong>Löschung (Art. 17):</strong> In Einstellungen → Datenschutz → Account löschen</li>
            <li><strong>Datenübertragbarkeit (Art. 20):</strong> In Einstellungen → Datenschutz → Daten herunterladen</li>
            <li><strong>Einschränkung (Art. 18):</strong> Auf Anfrage per E-Mail</li>
            <li><strong>Widerspruch (Art. 21):</strong> datenschutz@rechnungswerk.de</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">6. Push-Benachrichtigungen</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Push-Benachrichtigungen werden nur mit deiner ausdrücklichen Einwilligung über
            Firebase Cloud Messaging (Google LLC, USA) gesendet. Du kannst sie jederzeit unter
            Einstellungen → Benachrichtigungen deaktivieren.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">7. Drittanbieter</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Stripe (Zahlungsabwicklung), Brevo (transaktionale E-Mails),
            Firebase (Push-Benachrichtigungen). Alle Anbieter sind DSGVO-konform
            und verarbeiten Daten ausschließlich im Auftrag von RechnungsWerk.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">8. Kontakt</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Bei Fragen zum Datenschutz: datenschutz@rechnungswerk.de
          </p>
        </section>
      </div>
    </main>
  )
}
