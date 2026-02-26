'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Upload,
  FileText,
  List,
  CheckCircle,
  BarChart3,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Monitor,
  Users,
  Repeat,
} from 'lucide-react'
import { useTheme } from '@/components/design-system/theme-provider'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  comingSoon?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/ocr', label: 'OCR Upload', icon: Upload },
  { href: '/manual', label: 'Manuelle Eingabe', icon: FileText },
  { href: '/invoices', label: 'Rechnungen', icon: List },
  { href: '/validator', label: 'Validator', icon: CheckCircle },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/suppliers', label: 'Lieferanten', icon: Users },
  { href: '/recurring', label: 'Wiederkehrend', icon: Repeat },
]

const MOBILE_NAV_ITEMS = NAV_ITEMS.slice(0, 5)

export function SidebarNav() {
  const pathname = usePathname()
  const { theme, resolved, setTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('rw-sidebar-collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('rw-sidebar-collapsed', String(next))
  }

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  if (!mounted) {
    // Render a minimal placeholder to avoid layout shift
    return (
      <aside className="hidden lg:flex flex-col w-[220px] border-r shrink-0"
        style={{
          backgroundColor: 'rgb(var(--sidebar-bg))',
          borderColor: 'rgb(var(--sidebar-border))',
        }}
      />
    )
  }

  return (
    <>
      {/* ===== Desktop Sidebar ===== */}
      <aside
        className={cn(
          'hidden lg:flex flex-col shrink-0 border-r transition-all duration-300 ease-in-out relative',
          collapsed ? 'w-[64px]' : 'w-[220px]'
        )}
        style={{
          backgroundColor: 'rgb(var(--sidebar-bg))',
          borderColor: 'rgb(var(--sidebar-border))',
        }}
      >
        {/* Brand header */}
        <div
          className="flex items-center gap-2.5 px-4 h-14 border-b shrink-0"
          style={{ borderColor: 'rgb(var(--sidebar-border))' }}
        >
          {/* Logo mark */}
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm text-white"
            style={{ backgroundColor: 'rgb(var(--primary))' }}
          >
            R
          </div>

          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <span
                className="font-bold text-sm tracking-tight truncate"
                style={{ color: 'rgb(var(--sidebar-brand))' }}
              >
                RechnungsWerk
              </span>
              <span
                className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'rgb(var(--primary-light))',
                  color: 'rgb(var(--primary))',
                }}
              >
                3.0.2
              </span>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapsed}
          className={cn(
            'absolute -right-3 top-[52px] z-10 w-6 h-6 rounded-full border flex items-center justify-center',
            'hover:scale-110 transition-transform duration-150'
          )}
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
            color: 'rgb(var(--foreground-muted))',
            boxShadow: 'var(--shadow-sm)',
          }}
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
        >
          {collapsed
            ? <PanelLeft size={12} />
            : <PanelLeftClose size={12} />
          }
        </button>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {!collapsed && (
            <p
              className="text-[10px] font-semibold uppercase tracking-wider px-2 mb-2"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              Navigation
            </p>
          )}
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <div key={item.href} className="relative">
                {item.comingSoon ? (
                  <div
                    className={cn(
                      'flex items-center gap-3 px-2 py-2 rounded-lg cursor-not-allowed opacity-50 select-none',
                      collapsed ? 'justify-center' : ''
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      size={18}
                      className="shrink-0"
                      style={{ color: 'rgb(var(--sidebar-icon))' }}
                    />
                    {!collapsed && (
                      <>
                        <span
                          className="text-sm font-medium truncate flex-1"
                          style={{ color: 'rgb(var(--sidebar-text))' }}
                        >
                          {item.label}
                        </span>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: 'rgb(var(--muted))',
                            color: 'rgb(var(--foreground-muted))',
                          }}
                        >
                          bald
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-2 py-2 rounded-lg transition-colors duration-150',
                      collapsed ? 'justify-center' : '',
                      active ? '' : 'hover:opacity-100'
                    )}
                    style={{
                      backgroundColor: active
                        ? 'rgb(var(--sidebar-item-active-bg))'
                        : 'transparent',
                      color: active
                        ? 'rgb(var(--sidebar-item-active-text))'
                        : 'rgb(var(--sidebar-text))',
                    }}
                    title={collapsed ? item.label : undefined}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.backgroundColor = 'rgb(var(--sidebar-item-hover))'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    <Icon
                      size={18}
                      className="shrink-0"
                      style={{
                        color: active
                          ? 'rgb(var(--sidebar-item-active-text))'
                          : 'rgb(var(--sidebar-icon))',
                      }}
                    />
                    {!collapsed && (
                      <span className="text-sm font-medium truncate">
                        {item.label}
                      </span>
                    )}
                  </Link>
                )}

                {/* Tooltip for collapsed mode */}
                {collapsed && (
                  <div
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded text-xs font-medium whitespace-nowrap
                      opacity-0 pointer-events-none group-hover:opacity-100 z-50 hidden"
                    style={{
                      backgroundColor: 'rgb(var(--foreground))',
                      color: 'rgb(var(--background))',
                    }}
                  >
                    {item.label}
                    {item.comingSoon && ' (bald)'}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer: Theme toggle */}
        <div
          className="px-2 py-3 border-t shrink-0"
          style={{ borderColor: 'rgb(var(--sidebar-border))' }}
        >
          <button
            onClick={cycleTheme}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors duration-150',
              collapsed ? 'justify-center' : ''
            )}
            style={{ color: 'rgb(var(--sidebar-text))' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgb(var(--sidebar-item-hover))'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            title={
              theme === 'light'
                ? 'Zu Dunkelmodus wechseln'
                : theme === 'dark'
                ? 'Zu Systemmodus wechseln'
                : 'Zu Hellmodus wechseln'
            }
          >
            <ThemeIcon
              size={18}
              className="shrink-0"
              style={{ color: 'rgb(var(--sidebar-icon))' }}
            />
            {!collapsed && (
              <span className="text-sm font-medium">
                {theme === 'light'
                  ? 'Hell'
                  : theme === 'dark'
                  ? 'Dunkel'
                  : 'System'}
              </span>
            )}
          </button>

          {!collapsed && (
            <p
              className="mt-3 text-[10px] px-2 leading-relaxed"
              style={{ color: 'rgb(var(--foreground-muted))' }}
            >
              RechnungsWerk v0.1 · EN 16931
            </p>
          )}
        </div>
      </aside>

      {/* ===== Mobile Bottom Navigation ===== */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t"
        style={{
          backgroundColor: 'rgb(var(--sidebar-bg))',
          borderColor: 'rgb(var(--sidebar-border))',
          boxShadow: '0 -4px 16px rgb(0 0 0 / 0.08)',
        }}
      >
        <div className="flex items-stretch h-16">
          {MOBILE_NAV_ITEMS.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.comingSoon ? '#' : item.href}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-150',
                  item.comingSoon ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
                )}
                style={{
                  color: active
                    ? 'rgb(var(--sidebar-item-active-text))'
                    : 'rgb(var(--sidebar-icon))',
                }}
                onClick={(e) => item.comingSoon && e.preventDefault()}
              >
                <Icon size={20} />
                <span className="text-[10px] font-medium leading-none">
                  {item.label.split(' ')[0]}
                </span>
              </Link>
            )
          })}
        </div>
        {/* Safe area for iOS home indicator */}
        <div className="h-safe-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </nav>
    </>
  )
}
