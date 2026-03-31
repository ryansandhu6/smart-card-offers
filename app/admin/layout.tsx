import Link from 'next/link'
import { cookies } from 'next/headers'

const NAV_LINKS = [
  { href: '/admin',          label: 'Dashboard' },
  { href: '/admin/cards',    label: 'Cards' },
  { href: '/admin/offers',   label: 'Offers' },
  { href: '/admin/scrapers', label: 'Scrapers' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const hasSession = jar.get('admin_session')?.value === process.env.ADMIN_PASSWORD

  // Login page — no chrome
  if (!hasSession) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Top nav */}
      <nav className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-12 gap-1">
          <span className="text-sm font-semibold text-white mr-4">SCO Admin</span>
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-gray-300 hover:text-white px-3 py-1.5 rounded hover:bg-gray-700 transition-colors"
            >
              {label}
            </Link>
          ))}
          <a
            href="/api/admin/logout"
            className="ml-auto text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded hover:bg-gray-700 transition-colors"
          >
            Logout
          </a>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
