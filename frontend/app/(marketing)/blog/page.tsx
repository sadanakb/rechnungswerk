import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import Link from 'next/link'

export const metadata = {
  title: 'Blog — RechnungsWerk',
  description: 'Artikel zu E-Rechnungen, XRechnung, ZUGFeRD und der E-Rechnungspflicht in Deutschland.',
}

interface PostMeta {
  slug: string
  title: string
  description: string
  date: string
  author: string
}

function getPosts(): PostMeta[] {
  const contentDir = path.join(process.cwd(), 'content', 'blog')
  if (!fs.existsSync(contentDir)) return []

  const files = fs.readdirSync(contentDir).filter(f => f.endsWith('.mdx'))

  return files.map(file => {
    const raw = fs.readFileSync(path.join(contentDir, file), 'utf-8')
    const { data } = matter(raw)
    return {
      slug: file.replace('.mdx', ''),
      title: data.title || '',
      description: data.description || '',
      date: data.date || '',
      author: data.author || 'RechnungsWerk Team',
    }
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export default function BlogPage() {
  const posts = getPosts()

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Blog</h1>
      <p className="opacity-60 mb-12">Wissen rund um E-Rechnungen und digitale Buchhaltung</p>

      <div className="space-y-8">
        {posts.map(post => (
          <article key={post.slug} className="group">
            <Link href={`/blog/${post.slug}`}>
              <time className="text-sm opacity-50">{new Date(post.date).toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
              <h2 className="text-xl font-semibold mt-1 group-hover:opacity-80 transition-opacity">{post.title}</h2>
              <p className="mt-2 opacity-70">{post.description}</p>
            </Link>
          </article>
        ))}
        {posts.length === 0 && <p className="opacity-60">Noch keine Artikel vorhanden.</p>}
      </div>
    </main>
  )
}
