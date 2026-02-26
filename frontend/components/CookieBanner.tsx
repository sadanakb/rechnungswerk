'use client'

import { useState, useEffect } from 'react'

export function CookieBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('rw-cookies-accepted')) {
      setShow(true)
    }
  }, [])

  if (!show) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 border-t"
         style={{
           backgroundColor: 'rgb(var(--card))',
           borderColor: 'rgb(var(--border))',
         }}>
      <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
        <p className="text-sm">
          Diese Website verwendet technisch notwendige Cookies.{' '}
          <a href="/datenschutz" className="underline" style={{ color: 'rgb(var(--primary))' }}>Datenschutzerklaerung</a>
        </p>
        <button
          onClick={() => {
            localStorage.setItem('rw-cookies-accepted', 'true')
            setShow(false)
          }}
          className="rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap"
          style={{
            backgroundColor: 'rgb(var(--primary))',
            color: 'rgb(var(--primary-foreground))',
          }}>
          Verstanden
        </button>
      </div>
    </div>
  )
}
