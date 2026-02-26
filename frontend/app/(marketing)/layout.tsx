import type { ReactNode } from 'react'
import Link from 'next/link'
import { NewsletterForm } from '@/components/NewsletterForm'

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(var(--background))' }}>
      {/* Marketing header */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-md"
        style={{
          borderColor: 'rgb(var(--border))',
          backgroundColor: 'rgb(var(--background) / 0.8)',
        }}
      >
        <nav className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            RechnungsWerk
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/preise"
              className="text-sm font-medium hover:opacity-80"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Preise
            </Link>
            <Link
              href="/blog"
              className="text-sm font-medium hover:opacity-80"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Blog
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium hover:opacity-80"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Anmelden
            </Link>
            <Link
              href="/register"
              className="rounded-lg px-4 py-2 text-sm font-medium"
              style={{
                backgroundColor: 'rgb(var(--primary))',
                color: 'rgb(var(--primary-foreground))',
              }}
            >
              Kostenlos testen
            </Link>
          </div>
        </nav>
      </header>

      {children}

      {/* Footer */}
      <footer className="border-t py-12 mt-20" style={{ borderColor: 'rgb(var(--border))' }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-bold mb-3" style={{ color: 'rgb(var(--foreground))' }}>Produkt</h3>
              <ul className="space-y-2 text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                <li><Link href="/preise" className="hover:opacity-80">Preise</Link></li>
                <li><Link href="/register" className="hover:opacity-80">Kostenlos starten</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-3" style={{ color: 'rgb(var(--foreground))' }}>Ressourcen</h3>
              <ul className="space-y-2 text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                <li><Link href="/blog" className="hover:opacity-80">Blog</Link></li>
                <li>
                  <a
                    href="https://github.com/sadanakb/rechnungswerk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:opacity-80"
                  >
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-3" style={{ color: 'rgb(var(--foreground))' }}>Rechtliches</h3>
              <ul className="space-y-2 text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                <li><Link href="/impressum" className="hover:opacity-80">Impressum</Link></li>
                <li><Link href="/datenschutz" className="hover:opacity-80">Datenschutz</Link></li>
                <li><Link href="/agb" className="hover:opacity-80">AGB</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-3" style={{ color: 'rgb(var(--foreground))' }}>Newsletter</h3>
              <p className="text-sm mb-3" style={{ color: 'rgb(var(--foreground-muted))' }}>
                Erhalten Sie Updates zur E-Rechnungspflicht.
              </p>
              <NewsletterForm />
            </div>
          </div>
          <div
            className="mt-8 pt-8 border-t text-center text-sm"
            style={{
              borderColor: 'rgb(var(--border))',
              color: 'rgb(var(--foreground-muted))',
              opacity: 0.7,
            }}
          >
            &copy; 2026 RechnungsWerk. Made in Germany.
          </div>
        </div>
      </footer>
    </div>
  )
}
