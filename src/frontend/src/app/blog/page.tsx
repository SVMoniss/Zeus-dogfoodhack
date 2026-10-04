'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Clock, Search } from 'lucide-react';
import AppShell from '@/components/AppShell';
import {
  BLOG_CATEGORIES,
  BLOG_POSTS,
  FEATURED_POST,
  type BlogCategory,
  type BlogPost,
} from '@/lib/blog';

function AuthorChip({ name, initials, role }: { name: string; initials: string; role: string }) {
  return (
    <span className="flex items-center gap-2.5" title={role}>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
      >
        {initials}
      </span>
      <span className="text-sm font-medium">{name}</span>
    </span>
  );
}

function FeaturedCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="listing-card group grid overflow-hidden md:grid-cols-2"
      aria-label={`Read: ${post.title}`}
    >
      <div
        aria-hidden="true"
        className="relative min-h-56 overflow-hidden md:min-h-72"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="badge absolute bottom-6 left-6 border-white/30 bg-black/45 text-white">{post.category}</span>
      </div>
      <div className="flex flex-col p-6 sm:p-8">
        <p className="text-sm text-muted-foreground">
          {post.date} · {post.readMinutes} min read
        </p>
        <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight group-hover:text-primary sm:text-[1.7rem]">
          {post.title}
        </h2>
        <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted-foreground">
          {post.excerpt}
        </p>
        <span className="mt-6 flex items-center justify-between gap-4">
          <AuthorChip name={post.author.name} initials={post.author.initials} role={post.author.role} />
          <span className="text-link text-sm">
            Read now
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </span>
      </div>
    </Link>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="listing-card group flex flex-col"
      aria-label={`Read: ${post.title}`}
    >
      <div aria-hidden="true" className="relative h-36 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="ribbon bg-black/45">{post.category}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-[13px] text-muted-foreground">
          {post.date} · {post.readMinutes} min read
        </p>
        <h3 className="mt-1.5 text-lg font-bold leading-snug group-hover:text-primary">
          {post.title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
          {post.excerpt}
        </p>
        <span className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <AuthorChip name={post.author.name} initials={post.author.initials} role={post.author.role} />
          <span className="text-link text-sm">
            Read
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </span>
      </div>
    </Link>
  );
}

export default function BlogIndexPage() {
  const [category, setCategory] = useState<'All' | BlogCategory>('All');
  const [query, setQuery] = useState('');

  const posts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BLOG_POSTS.filter((p) => {
      const inCategory = category === 'All' || p.category === category;
      const inQuery =
        q.length === 0 ||
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q));
      return inCategory && inQuery;
    });
  }, [category, query]);

  return (
    <AppShell>
      <div className="py-10">
        <div className="max-w-2xl">
          <p className="eyebrow-accent">dogfood. blog</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">DOGFOOD Blog</h1>
          <p className="mt-2 text-muted-foreground">
            Build logs, judging math and self-host guides from the team building the
            platform that judges itself.
          </p>
        </div>

        <div className="mt-8">
          <FeaturedCard post={FEATURED_POST} />
        </div>

        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Blog categories">
            {BLOG_CATEGORIES.map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={category === c ? 'chip chip-active' : 'chip'}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="search-wrap max-w-sm lg:ml-auto">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search posts…"
              aria-label="Search blog posts"
              className="search-input h-10 pl-10 text-sm"
            />
          </div>
        </div>

        <p className="mt-4 font-mono text-xs text-muted-foreground" aria-live="polite">
          {posts.length} post{posts.length === 1 ? '' : 's'}
          {category !== 'All' ? ` in ${category}` : ''}
          {query.trim() ? ` matching “${query.trim()}”` : ''}
        </p>

        {posts.length === 0 ? (
          <div className="card mt-4 text-center">
            <p className="font-semibold">No posts found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different category or search term.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-sm">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Page 1 of 1 · {BLOG_POSTS.length} posts · more after judging
          </p>
          <span className="flex gap-2">
            <span className="chip chip-active" aria-current="page">1</span>
            <span className="chip opacity-50" aria-disabled="true">Next →</span>
          </span>
        </div>
      </div>
    </AppShell>
  );
}
