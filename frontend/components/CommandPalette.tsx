'use client'

import { Command } from 'cmdk'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  ScanLine,
  PenLine,
  RefreshCw,
  Users,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Plus,
  Upload,
  Settings,
} from 'lucide-react'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const navigationItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Rechnungen', href: '/invoices', icon: FileText },
  { label: 'Neue Rechnung OCR', href: '/ocr', icon: ScanLine },
  { label: 'Manuelle Rechnung', href: '/manual', icon: PenLine },
  { label: 'Wiederkehrende Rechnungen', href: '/recurring', icon: RefreshCw },
  { label: 'Lieferanten', href: '/suppliers', icon: Users },
  { label: 'Mahnwesen', href: '/mahnwesen', icon: AlertTriangle },
  { label: 'Validierung', href: '/validator', icon: CheckCircle },
  { label: 'Analytik', href: '/analytics', icon: BarChart3 },
]

const actionItems = [
  { label: 'Neue Rechnung erstellen', href: '/manual', icon: Plus },
  { label: 'PDF hochladen OCR', href: '/ocr', icon: Upload },
  { label: 'Einstellungen', href: '/settings', icon: Settings },
]

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()

  const handleSelect = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Befehlspalette"
      overlayClassName="cmdk-overlay"
      contentClassName="cmdk-content"
    >
      <div
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxWidth: '560px',
          width: '100%',
          margin: '0 auto',
        }}
      >
        <Command.Input
          placeholder="Suchen oder navigieren..."
          style={{
            width: '100%',
            padding: '14px 16px',
            fontSize: '15px',
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            color: 'rgb(var(--foreground))',
            borderBottom: '1px solid rgb(var(--border))',
          }}
        />

        <Command.List
          style={{
            maxHeight: '360px',
            overflowY: 'auto',
            padding: '8px',
          }}
        >
          <Command.Empty
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              fontSize: '14px',
              color: 'rgb(var(--muted-foreground))',
            }}
          >
            Keine Ergebnisse gefunden.
          </Command.Empty>

          <Command.Group
            heading="Navigation"
            style={{ marginBottom: '4px' }}
          >
            {navigationItems.map((item) => (
              <Command.Item
                key={item.href + item.label}
                value={item.label}
                onSelect={() => handleSelect(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: 'rgb(var(--foreground))',
                }}
              >
                <item.icon size={18} style={{ opacity: 0.6 }} />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Separator
            style={{
              height: '1px',
              backgroundColor: 'rgb(var(--border))',
              margin: '4px 8px',
            }}
          />

          <Command.Group
            heading="Aktionen"
            style={{ marginBottom: '4px' }}
          >
            {actionItems.map((item) => (
              <Command.Item
                key={item.href + item.label}
                value={item.label}
                onSelect={() => handleSelect(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  color: 'rgb(var(--foreground))',
                }}
              >
                <item.icon size={18} style={{ opacity: 0.6 }} />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>

        <div
          style={{
            display: 'flex',
            gap: '16px',
            justifyContent: 'center',
            padding: '10px 16px',
            borderTop: '1px solid rgb(var(--border))',
            fontSize: '12px',
            color: 'rgb(var(--muted-foreground))',
          }}
        >
          <span>↑↓ Navigieren</span>
          <span>↵ Öffnen</span>
          <span>Esc Schließen</span>
        </div>
      </div>
    </Command.Dialog>
  )
}
