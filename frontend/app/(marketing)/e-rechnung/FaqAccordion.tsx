'use client'

import { useState } from 'react'

interface FaqItem {
  question: string
  answer: string
}

interface FaqAccordionProps {
  faqs: FaqItem[]
}

export function FaqAccordion({ faqs }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <dl className="space-y-3">
      {faqs.map((faq, idx) => {
        const isOpen = openIndex === idx
        return (
          <div
            key={faq.question}
            className="rounded-xl border overflow-hidden"
            style={{
              backgroundColor: 'rgb(var(--card))',
              borderColor: isOpen ? 'rgb(var(--primary))' : 'rgb(var(--border))',
              transition: 'border-color 0.2s',
            }}
          >
            <button
              type="button"
              className="w-full flex items-center justify-between px-5 py-4 text-left"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? null : idx)}
            >
              <dt
                className="text-sm font-semibold pr-4"
                style={{ color: 'rgb(var(--foreground))' }}
              >
                {faq.question}
              </dt>
              <span
                className="shrink-0 text-base font-bold transition-transform"
                style={{
                  color: 'rgb(var(--primary))',
                  transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
                aria-hidden="true"
              >
                +
              </span>
            </button>
            {isOpen && (
              <dd
                className="px-5 pb-5 text-sm leading-relaxed"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                {faq.answer}
              </dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}
