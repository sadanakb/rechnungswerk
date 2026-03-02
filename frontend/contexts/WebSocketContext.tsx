'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'

export interface WSEvent {
  event: string
  data: Record<string, unknown>
}

interface WebSocketContextValue {
  lastEvent: WSEvent | null
  connected: boolean
  sendMessage: (msg: string) => void
}

const WebSocketContext = createContext<WebSocketContextValue>({
  lastEvent: null,
  connected: false,
  sendMessage: () => {},
})

export function useWebSocket() {
  return useContext(WebSocketContext)
}

function getToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('rw-access-token') || ''
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
const WS_BASE = API_BASE.replace(/^http/, 'ws')

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(1000)

  const connect = useCallback(() => {
    const token = getToken()
    if (!token) return

    const url = `${WS_BASE}/ws`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      // Send token as first message (first-message auth — keeps token out of URL)
      ws.send(JSON.stringify({ token }))
      setConnected(true)
      reconnectDelay.current = 1000  // reset backoff
    }

    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as WSEvent
        setLastEvent(payload)
        handleEvent(payload)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      // Reconnect with exponential backoff (max 30s)
      const delay = Math.min(reconnectDelay.current, 30000)
      reconnectDelay.current = delay * 2
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [connect])

  const sendMessage = useCallback((msg: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg)
    }
  }, [])

  return (
    <WebSocketContext.Provider value={{ lastEvent, connected, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  )
}

function handleEvent(event: WSEvent) {
  switch (event.event) {
    case 'invoice.paid':
      toast.success(`Rechnung ${event.data.invoice_id} als bezahlt bestätigt`, {
        description: `Betrag: ${Number(event.data.amount ?? 0).toFixed(2)} EUR`,
      })
      break
    case 'invoice.overdue':
      toast.error(`Rechnung ${event.data.invoice_id} ist überfällig`, {
        description: `Fällig seit: ${event.data.due_date}`,
      })
      break
    case 'portal.visited':
      toast.info(`Kunde hat Rechnung ${event.data.invoice_id} angesehen`, {
        description: `Aufrufe gesamt: ${event.data.access_count}`,
      })
      break
    case 'recurring.created':
      toast.success(`Wiederkehrende Rechnung ${event.data.invoice_id} erstellt`)
      break
    case 'invoice.categorized':
      toast.info(`Rechnung kategorisiert: ${event.data.category} (SKR03: ${event.data.skr03})`)
      break
  }
}
