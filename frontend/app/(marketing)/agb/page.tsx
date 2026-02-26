export const metadata = {
  title: 'AGB — RechnungsWerk',
  description: 'Allgemeine Geschaeftsbedingungen von RechnungsWerk',
}

export default function AGBPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Allgemeine Geschaeftsbedingungen</h1>
      <div className="rounded-lg border p-8 text-center" style={{ borderColor: 'rgb(var(--border))', backgroundColor: 'rgb(var(--card))' }}>
        <p className="text-lg">
          Unsere AGB werden derzeit anwaltlich erstellt und in Kuerze veroeffentlicht.
        </p>
        <p className="mt-4 opacity-60">
          Bei Fragen wenden Sie sich bitte an{' '}
          <a href="mailto:kontakt@rechnungswerk.de" className="underline" style={{ color: 'rgb(var(--primary))' }}>
            kontakt@rechnungswerk.de
          </a>
        </p>
      </div>
    </main>
  )
}
