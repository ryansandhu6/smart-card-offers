import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/admin/login', req.url), 302)
  res.cookies.delete('admin_session')
  return res
}
