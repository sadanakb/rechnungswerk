import type { MetadataRoute } from 'next'
import { industries } from '@/data/pseo/industries'
import { bundeslaender } from '@/data/pseo/bundeslaender'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'https://rechnungswerk.de'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString()

  // Static marketing pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/preise`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/impressum`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/datenschutz`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/agb`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/docs`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/kontakt`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/ueber-uns`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ]

  // Blog posts
  const blogDir = path.join(process.cwd(), 'content/blog')
  const blogSlugs = fs.existsSync(blogDir)
    ? fs.readdirSync(blogDir).filter(f => f.endsWith('.mdx')).map(f => f.replace('.mdx', ''))
    : []
  const blogPages: MetadataRoute.Sitemap = blogSlugs.map(slug => ({
    url: `${BASE_URL}/blog/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  // Industry pSEO pages
  const industryPages: MetadataRoute.Sitemap = industries.map(ind => ({
    url: `${BASE_URL}/e-rechnung/${ind.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // Bundesland pSEO pages
  const bundeslandPages: MetadataRoute.Sitemap = bundeslaender.map(bl => ({
    url: `${BASE_URL}/e-rechnung/bundesland/${bl.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  return [...staticPages, ...blogPages, ...industryPages, ...bundeslandPages]
}
