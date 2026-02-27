'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Loader2 } from 'lucide-react'
import {
  getNotifications,
  getUnreadCount,
  markNotificationsRead,
  type AppNotification,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000) // seconds

  if (diff < 60) return 'Gerade eben'
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`
  return `vor ${Math.floor(diff / 86400)} Tagen`
}

const TYPE_COLORS: Record<string, string> = {
  invoice_created: '#14b8a6',   // teal
  mahnung_sent: '#f97316',      // orange
  payment_failed: '#ef4444',    // red
}

function dotColor(type: string): string {
  return TYPE_COLORS[type] ?? '#9ca3af' // default gray
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface NotificationItemProps {
  notification: AppNotification
  onRead: (n: AppNotification) => void
}

function NotificationItem({ notification, onRead }: NotificationItemProps) {
  return (
    <button
      type="button"
      onClick={() => onRead(notification)}
      className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-100"
      style={{
        backgroundColor: notification.is_read
          ? 'transparent'
          : 'rgb(var(--sidebar-item-hover))',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgb(var(--sidebar-item-hover))'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = notification.is_read
          ? 'transparent'
          : 'rgb(var(--sidebar-item-hover))'
      }}
    >
      {/* Colored dot */}
      <span
        className="mt-1.5 w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: dotColor(notification.type) }}
      />

      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-semibold leading-snug truncate"
          style={{ color: 'rgb(var(--foreground))' }}
        >
          {notification.title}
        </p>
        <p
          className="text-xs mt-0.5 leading-snug line-clamp-2"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          {notification.message}
        </p>
        <p
          className="text-[10px] mt-1"
          style={{ color: 'rgb(var(--foreground-muted))' }}
        >
          {relativeTime(notification.created_at)}
        </p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Poll unread count every 60 seconds
  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      const count = await getUnreadCount()
      if (!cancelled) setUnreadCount(count)
    }

    poll()
    const id = setInterval(poll, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Close on click outside
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Load notifications when panel opens
  const handleOpen = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      const data = await getNotifications()
      setNotifications(data)
      setLoading(false)
    }
  }

  const handleMarkAllRead = useCallback(async () => {
    await markNotificationsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }, [])

  const handleReadOne = useCallback(
    async (n: AppNotification) => {
      if (!n.is_read) {
        await markNotificationsRead([n.id])
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      }
      if (n.link) {
        setOpen(false)
        router.push(n.link)
      }
    },
    [router]
  )

  const hasUnread = unreadCount > 0

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleOpen}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors duration-150"
        style={{ color: 'rgb(var(--foreground-muted))' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgb(var(--sidebar-item-hover))'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
        aria-label="Benachrichtigungen"
        title="Benachrichtigungen"
      >
        <Bell size={18} />
        {/* Unread badge */}
        {hasUnread && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: 'rgb(var(--primary))' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 rounded-xl border shadow-lg z-50 overflow-hidden"
          style={{
            backgroundColor: 'rgb(var(--card))',
            borderColor: 'rgb(var(--border))',
            boxShadow: '0 8px 32px rgb(0 0 0 / 0.12)',
          }}
        >
          {/* Panel header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'rgb(var(--border))' }}
          >
            <span
              className="text-sm font-semibold"
              style={{ color: 'rgb(var(--foreground))' }}
            >
              Benachrichtigungen
            </span>
            {hasUnread && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: 'rgb(var(--primary))' }}
              >
                Alle als gelesen markieren
              </button>
            )}
          </div>

          {/* Content */}
          <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2
                  size={20}
                  className="animate-spin"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell
                  size={28}
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                  strokeWidth={1.5}
                />
                <p
                  className="text-sm"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  Keine Benachrichtigungen
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
                {notifications.map((n) => (
                  <NotificationItem key={n.id} notification={n} onRead={handleReadOne} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
