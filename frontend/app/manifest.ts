import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RechnungsWerk',
    short_name: 'RechnungsWerk',
    description: 'E-Rechnungen erstellen — XRechnung & ZUGFeRD konform',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#14b8a6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
