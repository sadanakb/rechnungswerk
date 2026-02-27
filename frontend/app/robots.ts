import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/login', '/register', '/onboarding', '/settings', '/api/'],
      },
    ],
    sitemap: 'https://rechnungswerk.de/sitemap.xml',
  }
}
