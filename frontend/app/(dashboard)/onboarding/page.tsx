'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  ImagePlus,
  FileText,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Upload,
} from 'lucide-react'

const STEPS = [
  { title: 'Firmendaten', icon: Building2 },
  { title: 'Logo', icon: ImagePlus },
  { title: 'Erste Rechnung', icon: FileText },
  { title: 'Fertig', icon: CheckCircle },
] as const

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [vatId, setVatId] = useState('')
  const [street, setStreet] = useState('')
  const [zip, setZip] = useState('')
  const [city, setCity] = useState('')

  const progress = ((step + 1) / STEPS.length) * 100

  const canNext =
    step === 0 ? vatId.trim().length > 0 && street.trim().length > 0 && city.trim().length > 0 : true

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-10">
      {/* Progress bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = i < step
            const active = i === step
            return (
              <div key={s.title} className="flex flex-col items-center gap-1">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    backgroundColor: done
                      ? 'rgb(var(--accent))'
                      : active
                        ? 'rgb(var(--primary))'
                        : 'rgb(var(--muted))',
                    color: done || active ? '#fff' : 'rgb(var(--foreground-muted))',
                  }}
                >
                  {done ? <CheckCircle size={18} /> : <Icon size={18} />}
                </div>
                <span
                  className="text-xs font-medium"
                  style={{
                    color: active ? 'rgb(var(--foreground))' : 'rgb(var(--foreground-muted))',
                  }}
                >
                  {s.title}
                </span>
              </div>
            )
          })}
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: 'rgb(var(--muted))' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              backgroundColor: 'rgb(var(--accent))',
            }}
          />
        </div>
      </div>

      {/* Step content card */}
      <div
        className="w-full max-w-lg rounded-2xl border p-6 sm:p-8"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Step 0: Firmendaten */}
        {step === 0 && (
          <div>
            <h2 className="text-xl font-bold mb-1" style={{ color: 'rgb(var(--foreground))' }}>
              Firmendaten
            </h2>
            <p className="text-sm mb-6" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Diese Daten werden auf Ihren Rechnungen verwendet.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'rgb(var(--foreground))' }}>
                  USt-IdNr. <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={vatId}
                  onChange={(e) => setVatId(e.target.value)}
                  placeholder="DE123456789"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={{
                    backgroundColor: 'rgb(var(--input))',
                    borderColor: 'rgb(var(--input-border))',
                    color: 'rgb(var(--foreground))',
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'rgb(var(--foreground))' }}>
                  Strasse <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Musterstrasse 1"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                  style={{
                    backgroundColor: 'rgb(var(--input))',
                    borderColor: 'rgb(var(--input-border))',
                    color: 'rgb(var(--foreground))',
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'rgb(var(--foreground))' }}>
                    PLZ
                  </label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    placeholder="60311"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                    style={{
                      backgroundColor: 'rgb(var(--input))',
                      borderColor: 'rgb(var(--input-border))',
                      color: 'rgb(var(--foreground))',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'rgb(var(--foreground))' }}>
                    Stadt <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Frankfurt am Main"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
                    style={{
                      backgroundColor: 'rgb(var(--input))',
                      borderColor: 'rgb(var(--input-border))',
                      color: 'rgb(var(--foreground))',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Logo Upload */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold mb-1" style={{ color: 'rgb(var(--foreground))' }}>
              Firmenlogo
            </h2>
            <p className="text-sm mb-6" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Laden Sie Ihr Logo hoch. Es erscheint auf Ihren Rechnungen.
            </p>

            <div
              className="border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              style={{
                borderColor: 'rgb(var(--border))',
                backgroundColor: 'rgb(var(--muted))',
              }}
            >
              <Upload size={36} style={{ color: 'rgb(var(--foreground-muted))' }} />
              <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
                Logo hierher ziehen
              </p>
              <p className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
                PNG, JPG oder SVG, max. 2 MB
              </p>
              <button
                type="button"
                className="mt-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: 'rgb(var(--primary))' }}
              >
                Datei auswaehlen
              </button>
            </div>
            <p className="text-xs mt-3 text-center" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Dieser Schritt ist optional. Sie koennen das Logo spaeter in den Einstellungen aendern.
            </p>
          </div>
        )}

        {/* Step 2: Erste Rechnung */}
        {step === 2 && (
          <div className="text-center">
            <h2 className="text-xl font-bold mb-1" style={{ color: 'rgb(var(--foreground))' }}>
              Erste Rechnung erstellen
            </h2>
            <p className="text-sm mb-6" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Erstellen Sie jetzt Ihre erste XRechnung oder ueberspringen Sie diesen Schritt.
            </p>

            <div
              className="rounded-xl border p-6 mb-4"
              style={{
                backgroundColor: 'rgb(var(--muted))',
                borderColor: 'rgb(var(--border))',
              }}
            >
              <FileText
                size={40}
                className="mx-auto mb-3"
                style={{ color: 'rgb(var(--accent))' }}
              />
              <p className="text-sm font-medium mb-4" style={{ color: 'rgb(var(--foreground))' }}>
                XRechnung 3.0.2 konform, GoBD-sicher archiviert
              </p>
              <Link
                href="/manual"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: 'rgb(var(--accent))' }}
              >
                <FileText size={16} />
                Rechnung erstellen
              </Link>
            </div>
          </div>
        )}

        {/* Step 3: Fertig */}
        {step === 3 && (
          <div className="text-center py-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'rgb(var(--accent))' }}
            >
              <CheckCircle size={32} className="text-white" />
            </div>
            <h2 className="text-xl font-bold mb-1" style={{ color: 'rgb(var(--foreground))' }}>
              Alles eingerichtet!
            </h2>
            <p className="text-sm mb-6" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Ihr Konto ist bereit. Sie koennen jetzt Rechnungen erstellen, per OCR erfassen
              und als XRechnung versenden.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              Zum Dashboard
              <ArrowRight size={16} />
            </Link>
          </div>
        )}

        {/* Navigation buttons */}
        {step < 3 && (
          <div className="flex justify-between mt-8">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-30 transition-opacity"
              style={{
                backgroundColor: 'rgb(var(--muted))',
                color: 'rgb(var(--foreground))',
              }}
            >
              <ArrowLeft size={16} />
              Zurueck
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canNext}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: 'rgb(var(--primary))' }}
            >
              {step === 2 ? 'Ueberspringen' : 'Weiter'}
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
