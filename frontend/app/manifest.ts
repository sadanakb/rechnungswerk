import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RechnungsWerk',
    short_name: 'RechnungsWerk',
    description: 'E-Rechnungen einfach erstellen, validieren und verwalten. XRechnung & ZUGFeRD konform.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#14b8a6',
    orientation: 'portrait-primary',
    categories: ['finance', 'business', 'productivity'],
    lang: 'de',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Neue Rechnung',
        short_name: 'Neu',
        description: 'Rechnung manuell erfassen',
        url: '/manual',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Rechnungen',
        short_name: 'Liste',
        description: 'Alle Rechnungen anzeigen',
        url: '/invoices',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
    screenshots: [
      {
        src: '/screenshots/dashboard.png',
        sizes: '1280x800',
        type: 'image/png',
        label: 'Dashboard Übersicht',
      },
    ],
  }
}
