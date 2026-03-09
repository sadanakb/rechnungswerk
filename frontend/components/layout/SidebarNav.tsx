'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FilePlus,
  FileText,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Monitor,
  Users2,
  Settings,
  MoreHorizontal,
  X,
  ReceiptText,
} from 'lucide-react'
import { useTheme } from '@/components/design-system/theme-provider'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/manual', label: 'Neue Rechnung', icon: FilePlus },
  { href: '/invoices', label: 'Rechnungen', icon: FileText },
  { href: '/gutschriften', label: 'Gutschriften', icon: ReceiptText },
  { href: '/contacts', label: 'Kontakte', icon: Users2 },
]

const SETTINGS_ITEM: NavItem = { href: '/settings', label: 'Einstellungen', icon: Settings }

const MOBILE_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/manual', label: 'Neue Rechnung', icon: FilePlus },
  { href: '/invoices', label: 'Rechnungen', icon: FileText },
  { href: '/contacts', label: 'Kontakte', icon: Users2 },
]

export function SidebarNav() {
  const pathname = usePathname()
  const { theme, resolved, setTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

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

  const renderNavLink = (item: NavItem, options?: { onClick?: () => void }) => {
    const active = isActive(item.href)
    const Icon = item.icon
    return (
      <div key={item.href} className="relative group">
        <Link
          href={item.href}
          className={cn(
            'flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors duration-150',
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
          onClick={options?.onClick}
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
            size={20}
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

        {/* Tooltip for collapsed mode */}
        {collapsed && (
          <div
            className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded text-xs font-medium whitespace-nowrap
              invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity duration-150 z-50"
            style={{
              backgroundColor: 'rgb(var(--foreground))',
              color: 'rgb(var(--background))',
            }}
          >
            {item.label}
          </div>
        )}
      </div>
    )
  }

  if (!mounted) {
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
          <img src="/logo-icon.png" alt="RechnungsWerk" className="w-7 h-7 rounded-lg shrink-0" />

          {!collapsed && (
            <span
              className="font-bold text-sm tracking-tight truncate"
              style={{ color: 'rgb(var(--sidebar-brand))' }}
            >
              RechnungsWerk
            </span>
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
          {NAV_ITEMS.map((item) => renderNavLink(item))}
        </nav>

        {/* Footer: Settings + Theme toggle */}
        <div
          className="px-2 py-3 border-t shrink-0 space-y-0.5"
          style={{ borderColor: 'rgb(var(--sidebar-border))' }}
        >
          {renderNavLink(SETTINGS_ITEM)}

          <button
            onClick={cycleTheme}
            className={cn(
              'w-full flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors duration-150',
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
              size={20}
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
                href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-150"
                style={{
                  color: active
                    ? 'rgb(var(--sidebar-item-active-text))'
                    : 'rgb(var(--sidebar-icon))',
                }}
              >
                <Icon size={20} />
                <span className="text-[10px] font-medium leading-none">
                  {item.label.split(' ')[0]}
                </span>
              </Link>
            )
          })}
          {/* "Mehr" button */}
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-150"
            style={{ color: 'rgb(var(--sidebar-icon))' }}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-medium leading-none">Mehr</span>
          </button>
        </div>

        {/* Mobile full drawer overlay */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-[60]">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div
              className="absolute bottom-0 left-0 right-0 rounded-t-2xl pb-8 max-h-[85vh] overflow-y-auto"
              style={{
                backgroundColor: 'rgb(var(--card))',
                boxShadow: '0 -8px 32px rgb(0 0 0 / 0.15)',
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'rgb(var(--border))' }} />
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgb(var(--border))' }}>
                <div className="flex items-center gap-2">
                  <img src="/logo-icon.png" alt="RechnungsWerk" className="w-6 h-6 rounded-md shrink-0" />
                  <span className="text-sm font-semibold" style={{ color: 'rgb(var(--foreground))' }}>Navigation</span>
                </div>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Navigation schließen"
                  className="p-2 -mr-2 rounded-lg"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  <X size={20} />
                </button>
              </div>
              <nav className="px-2 py-2 space-y-0.5">
                {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => {
                  const active = isActive(item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileDrawerOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 rounded-lg transition-colors duration-150',
                        active ? '' : 'hover:opacity-80'
                      )}
                      style={{
                        minHeight: 44,
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: active ? 'rgb(var(--sidebar-item-active-bg))' : 'transparent',
                        color: active ? 'rgb(var(--sidebar-item-active-text))' : 'rgb(var(--foreground))',
                      }}
                    >
                      <Icon size={20} style={{ color: active ? 'rgb(var(--sidebar-item-active-text))' : 'rgb(var(--sidebar-icon))' }} />
                      <span className="text-sm font-medium">{item.label}</span>
                    </Link>
                  )
                })}
              </nav>
              {/* Theme toggle in drawer */}
              <div className="px-4 pt-2 border-t mt-2" style={{ borderColor: 'rgb(var(--border))' }}>
                <button
                  onClick={cycleTheme}
                  className="flex items-center gap-3 px-3 w-full rounded-lg transition-colors duration-150"
                  style={{
                    minHeight: 44,
                    color: 'rgb(var(--foreground))',
                  }}
                >
                  <ThemeIcon size={20} style={{ color: 'rgb(var(--sidebar-icon))' }} />
                  <span className="text-sm font-medium">
                    Design: {theme === 'light' ? 'Hell' : theme === 'dark' ? 'Dunkel' : 'System'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Safe area for iOS home indicator */}
        <div className="h-safe-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </nav>
    </>
  )
}
