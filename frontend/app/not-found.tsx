import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgb(var(--background))' }}
    >
      <div className="text-center max-w-md">
        {/* Large 404 */}
        <p
          className="text-[8rem] font-extrabold leading-none select-none"
          style={{ color: 'rgb(var(--primary))' }}
        >
          404
        </p>

        {/* Heading */}
        <h1
          className="mt-4 text-3xl font-bold tracking-tight"
          style={{ color: 'rgb(var(--foreground))' }}
        >
          Seite nicht gefunden
        </h1>

        {/* Subtext */}
        <p
          className="mt-3 text-base leading-relaxed"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>

        {/* Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'rgb(var(--primary))',
              color: 'rgb(var(--primary-foreground))',
            }}
          >
            Zur Startseite
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium border transition-colors"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground))',
            }}
          >
            Zum Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
