import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { notFound } from 'next/navigation'

interface Props {
  params: Promise<{ slug: string }>
}

function getPost(slug: string) {
  const filePath = path.join(process.cwd(), 'content', 'blog', `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)
  return { meta: data, content }
}

function getAllSlugs() {
  const contentDir = path.join(process.cwd(), 'content', 'blog')
  if (!fs.existsSync(contentDir)) return []
  return fs.readdirSync(contentDir)
    .filter(f => f.endsWith('.mdx'))
    .map(f => f.replace('.mdx', ''))
}

export async function generateStaticParams() {
  return getAllSlugs().map(slug => ({ slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) return {}
  return {
    title: `${post.meta.title} — RechnungsWerk Blog`,
    description: post.meta.description,
  }
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params
  const post = getPost(slug)
  if (!post) notFound()

  // Simple content rendering: split by paragraphs
  const paragraphs = post.content
    .split(/\n\n+/)
    .filter(p => p.trim())

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <article>
        <header className="mb-8">
          <time className="text-sm opacity-50">
            {new Date(post.meta.date).toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
          <h1 className="text-3xl font-bold mt-2">{post.meta.title}</h1>
          <p className="mt-2 opacity-60">{post.meta.description}</p>
          <p className="mt-1 text-sm opacity-50">Von {post.meta.author || 'RechnungsWerk Team'}</p>
        </header>

        <div className="prose prose-lg max-w-none space-y-4">
          {paragraphs.map((p, i) => {
            const trimmed = p.trim()
            if (trimmed.startsWith('## ')) {
              return <h2 key={i} className="text-2xl font-bold mt-8 mb-4">{trimmed.replace('## ', '')}</h2>
            }
            if (trimmed.startsWith('### ')) {
              return <h3 key={i} className="text-xl font-semibold mt-6 mb-3">{trimmed.replace('### ', '')}</h3>
            }
            if (trimmed.startsWith('- ')) {
              const items = trimmed.split('\n').filter(l => l.startsWith('- '))
              return (
                <ul key={i} className="list-disc pl-6 space-y-1">
                  {items.map((item, j) => <li key={j}>{item.replace('- ', '')}</li>)}
                </ul>
              )
            }
            if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
              return <p key={i} className="font-semibold">{trimmed.replace(/\*\*/g, '')}</p>
            }
            return <p key={i} className="leading-relaxed opacity-90">{trimmed}</p>
          })}
        </div>
      </article>

      {/* JSON-LD Article schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: post.meta.title,
            description: post.meta.description,
            datePublished: post.meta.date,
            author: { '@type': 'Organization', name: 'RechnungsWerk' },
          }),
        }}
      />
    </main>
  )
}
