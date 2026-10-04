import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, CalendarDays, Clock } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { TrophyMark } from '@/components/Brand';
import { BLOG_POSTS, getPost, getRelated } from '@/lib/blog';

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) return { title: 'Post not found — DOGFOOD Blog' };
  return {
    title: `${post.title} — DOGFOOD Blog`,
    description: post.excerpt,
  };
}

export default function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();
  const related = getRelated(post);

  return (
    <AppShell>
      <article className="py-10">
        <Link href="/blog" className="text-link text-sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All posts
        </Link>

        <div
          aria-hidden="true"
          className="relative mt-6 overflow-hidden rounded-[0.625rem]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.image}
            alt=""
            className="h-64 w-full object-cover sm:h-80"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 px-6 py-8 sm:px-10">
            <p className="flex flex-wrap items-center gap-2 text-sm text-white/85">
              <span className="badge border-white/30 bg-white/15 text-white">{post.category}</span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {post.date}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {post.readMinutes} min read
              </span>
            </p>
            <h1 className="mt-3 max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
              {post.title}
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/85">
              {post.excerpt}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-border pb-6">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
          >
            {post.author.initials}
          </span>
          <span>
            <span className="block text-sm font-bold">{post.author.name}</span>
            <span className="block text-sm text-muted-foreground">{post.author.role}</span>
          </span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            {post.tags.map((t) => (
              <span key={t} className="badge font-mono text-[11px]">
                {t}
              </span>
            ))}
          </span>
        </div>

        <div className="mx-auto mt-8 max-w-3xl space-y-8">
          {post.blocks.map((b, i) => (
            <section key={i}>
              {b.heading ? (
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{b.heading}</h2>
              ) : null}
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-foreground/90">
                {b.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
              {b.code ? (
                <pre className="mt-4 overflow-auto rounded-lg border border-border bg-muted p-4 font-mono text-[13px] leading-relaxed">
                  <code>{b.code}</code>
                </pre>
              ) : null}
            </section>
          ))}
        </div>

        <div className="card mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="font-bold">Run it yourself</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every post maps to a real route or file in this repo. Start with the gallery,
              then the docs.
            </p>
          </div>
          <span className="flex flex-wrap gap-2 sm:ml-auto">
            <Link href="/projects" className="btn-primary h-9 px-4 text-sm">
              Browse projects
            </Link>
            <Link href="/blog" className="btn-board h-9 px-4 text-sm">
              More posts
            </Link>
          </span>
        </div>

        <section className="mt-10" aria-label="Related posts">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Keep reading</h2>
            <Link href="/blog" className="text-link text-sm">
              View all
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <Link key={r.slug} href={`/blog/${r.slug}`} className="listing-card group p-5">
                <p className="text-[13px] text-muted-foreground">
                  {r.date} · {r.category}
                </p>
                <h3 className="mt-1.5 font-bold leading-snug group-hover:text-primary">
                  {r.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      </article>
    </AppShell>
  );
}
