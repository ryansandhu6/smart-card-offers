// Public API — for external frontend use only
// app/api/blog/route.ts
// GET /api/blog — published blog posts with pagination
// Query params: ?page=1&limit=10&category=card-review

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page     = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
    const limit    = Math.min(50, parseInt(searchParams.get('limit') ?? '10'))
    const category = searchParams.get('category')
    const offset   = (page - 1) * limit

    let query = supabaseAdmin
      .from('blog_posts')
      .select(
        'id, title, slug, excerpt, author, cover_image, category, tags, published_at, seo_title, seo_description'
      )
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (category) query = query.eq('category', category)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ posts: data, page, limit, count: data.length })
  } catch (err) {
    console.error('/api/blog error:', err)
    return NextResponse.json({ error: 'Failed to fetch blog posts' }, { status: 500 })
  }
}
