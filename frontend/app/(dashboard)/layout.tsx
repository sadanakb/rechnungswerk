'use client'

import { useState, useEffect } from 'react'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { CommandPalette } from '@/components/CommandPalette'
import { NotificationBell } from '@/components/layout/NotificationBell'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [cmdkOpen, setCmdkOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdkOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar — desktop only */}
      <SidebarNav />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <div
          className="flex items-center justify-end h-14 px-6 border-b shrink-0"
          style={{ borderColor: 'rgb(var(--border))' }}
        >
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      <CommandPalette open={cmdkOpen} onOpenChange={setCmdkOpen} />
    </div>
  )
}
