'use client'

import { useState, useRef, useEffect } from 'react'
import { streamChatMessage } from '@/lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || streaming) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)

    await streamChatMessage(
      userMsg.content,
      history,
      (token) => {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + token,
          }
          return updated
        })
      },
      (toolResult) => {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + '\n\n' + toolResult,
          }
          return updated
        })
      },
      () => setStreaming(false),
    )
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
        style={{ backgroundColor: 'rgb(var(--primary))', color: 'white' }}
        title="KI-Assistent"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className="fixed bottom-22 right-6 z-50 w-80 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ height: '420px', backgroundColor: 'rgb(var(--card))', border: '1px solid rgb(var(--border))' }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center gap-2 shrink-0"
            style={{ backgroundColor: 'rgb(var(--primary))', color: 'white' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-sm font-semibold">KI-Assistent</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center pt-8">
                <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  Frag mich zu deinen Rechnungen!
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgb(var(--foreground-muted))' }}>
                  z.B. „Welche Rechnungen sind offen?"
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                  style={msg.role === 'user'
                    ? { backgroundColor: 'rgb(var(--primary))', color: 'white' }
                    : { backgroundColor: 'rgb(var(--muted))', color: 'rgb(var(--foreground))' }
                  }
                >
                  {msg.content || (msg.role === 'assistant' && streaming && i === messages.length - 1 ? '…' : '')}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="p-3 flex gap-2 shrink-0"
            style={{ borderTop: '1px solid rgb(var(--border))' }}
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Frage stellen…"
              disabled={streaming}
              className="flex-1 text-sm rounded-lg px-3 py-2 focus:outline-none disabled:opacity-50"
              style={{
                border: '1px solid rgb(var(--border))',
                backgroundColor: 'rgb(var(--card))',
                color: 'rgb(var(--foreground))',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              className="px-3 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  )
}
