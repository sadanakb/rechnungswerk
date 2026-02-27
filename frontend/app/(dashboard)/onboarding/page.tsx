'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  ImagePlus,
  FileText,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Upload,
  Scan,
  PenLine,
  Check,
} from 'lucide-react'
import { updateCompanyInfo, uploadLogo } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormData {
  companyName: string
  vatId: string
  street: string
  zip: string
  city: string
}

// ---------------------------------------------------------------------------
// Progress Indicator
// ---------------------------------------------------------------------------

const STEP_LABELS = ['Unternehmen', 'Logo', 'Erste Rechnung', 'Fertig']

function ProgressIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full max-w-lg mb-8">
      <div className="flex items-center">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1
          const done = stepNum < currentStep
          const active = stepNum === currentStep
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 border-2"
                  style={{
                    backgroundColor: done
                      ? 'rgb(var(--accent))'
                      : active
                        ? 'rgb(var(--primary))'
                        : 'transparent',
                    borderColor: done
                      ? 'rgb(var(--accent))'
                      : active
                        ? 'rgb(var(--primary))'
                        : 'rgb(var(--border))',
                    color: done || active ? '#fff' : 'rgb(var(--foreground-muted))',
                  }}
                >
                  {done ? <Check size={16} strokeWidth={3} /> : stepNum}
                </div>
                <span
                  className="text-xs font-medium hidden sm:block"
                  style={{
                    color: active
                      ? 'rgb(var(--foreground))'
                      : done
                        ? 'rgb(var(--accent))'
                        : 'rgb(var(--foreground-muted))',
                  }}
                >
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div
                  className="flex-1 h-0.5 mx-2 rounded transition-all duration-500"
                  style={{
                    backgroundColor:
                      stepNum < currentStep ? 'rgb(var(--accent))' : 'rgb(var(--border))',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Input helper
// ---------------------------------------------------------------------------

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        className="block text-sm font-medium mb-1"
        style={{ color: 'rgb(var(--foreground))' }}
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors"
      style={{
        backgroundColor: 'rgb(var(--input))',
        borderColor: 'rgb(var(--input-border))',
        color: 'rgb(var(--foreground))',
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Step 1: Unternehmensdaten
// ---------------------------------------------------------------------------

function StepCompany({
  data,
  onChange,
}: {
  data: FormData
  onChange: (patch: Partial<FormData>) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'rgb(var(--accent) / 0.15)' }}
        >
          <Building2 size={20} style={{ color: 'rgb(var(--accent))' }} />
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Unternehmensdaten
          </h2>
          <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Diese Daten erscheinen auf Ihren Rechnungen.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Field label="Firmenname" required>
          <TextInput
            value={data.companyName}
            onChange={(v) => onChange({ companyName: v })}
            placeholder="Musterfirma GmbH"
          />
        </Field>
        <Field label="USt-IdNr.">
          <TextInput
            value={data.vatId}
            onChange={(v) => onChange({ vatId: v })}
            placeholder="DE123456789"
          />
        </Field>
        <Field label="Straße + Hausnummer" required>
          <TextInput
            value={data.street}
            onChange={(v) => onChange({ street: v })}
            placeholder="Musterstraße 1"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="PLZ">
            <TextInput
              value={data.zip}
              onChange={(v) => onChange({ zip: v })}
              placeholder="60311"
            />
          </Field>
          <Field label="Ort" required>
            <TextInput
              value={data.city}
              onChange={(v) => onChange({ city: v })}
              placeholder="Frankfurt am Main"
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Logo Upload
// ---------------------------------------------------------------------------

function StepLogo({
  onUploadDone,
  logoUrl,
}: {
  onUploadDone: (url: string) => void
  logoUrl: string | null
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
    if (!allowed.includes(file.type)) {
      setError('Ungültiges Format. Erlaubt: PNG, JPG, SVG, WebP')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Datei zu groß. Maximum: 2 MB')
      return
    }
    setError(null)
    setSelectedFile(file)
    setPreview(URL.createObjectURL(file))
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setError(null)
    try {
      const result = await uploadLogo(selectedFile)
      onUploadDone(result.logo_url)
    } catch {
      setError('Upload fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'rgb(var(--accent) / 0.15)' }}
        >
          <ImagePlus size={20} style={{ color: 'rgb(var(--accent))' }} />
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Firmenlogo hochladen
          </h2>
          <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Erscheint auf Ihren Rechnungen. Optional.
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200"
        style={{
          borderColor: dragOver ? 'rgb(var(--accent))' : 'rgb(var(--border))',
          backgroundColor: dragOver ? 'rgb(var(--accent) / 0.05)' : 'rgb(var(--muted))',
        }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Logo Vorschau"
            className="max-h-24 max-w-full object-contain rounded-lg"
          />
        ) : (
          <>
            <Upload size={36} style={{ color: 'rgb(var(--foreground-muted))' }} />
            <p className="text-sm font-medium" style={{ color: 'rgb(var(--foreground))' }}>
              Logo hier ablegen oder klicken
            </p>
            <p className="text-xs" style={{ color: 'rgb(var(--foreground-muted))' }}>
              PNG, JPG, SVG oder WebP · max. 2 MB
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}

      {logoUrl && !selectedFile && (
        <p className="mt-2 text-sm text-center" style={{ color: 'rgb(var(--accent))' }}>
          Logo bereits hochgeladen
        </p>
      )}

      {selectedFile && !logoUrl && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="mt-4 w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: 'rgb(var(--accent))' }}
        >
          {uploading ? 'Hochladen...' : 'Logo hochladen'}
        </button>
      )}

      {selectedFile && logoUrl && (
        <p className="mt-3 text-sm text-center font-medium" style={{ color: 'rgb(var(--accent))' }}>
          Erfolgreich hochgeladen!
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3: Erste Rechnung
// ---------------------------------------------------------------------------

function StepFirstInvoice() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'rgb(var(--accent) / 0.15)' }}
        >
          <FileText size={20} style={{ color: 'rgb(var(--accent))' }} />
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'rgb(var(--foreground))' }}>
            Erstellen Sie Ihre erste Rechnung
          </h2>
          <p className="text-sm" style={{ color: 'rgb(var(--foreground-muted))' }}>
            Wählen Sie, wie Sie starten möchten.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {/* Card: OCR Upload */}
        <Link
          href="/ocr"
          className="group rounded-xl border p-5 flex flex-col items-center text-center gap-3 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
          style={{
            backgroundColor: 'rgb(var(--muted))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
            style={{ backgroundColor: 'rgb(var(--primary) / 0.15)' }}
          >
            <Scan size={24} style={{ color: 'rgb(var(--primary))' }} />
          </div>
          <div>
            <p className="font-semibold text-sm mb-1" style={{ color: 'rgb(var(--foreground))' }}>
              Rechnung hochladen
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>
              PDF per OCR automatisch erfassen und als XRechnung konvertieren
            </p>
          </div>
        </Link>

        {/* Card: Manuell */}
        <Link
          href="/manual"
          className="group rounded-xl border p-5 flex flex-col items-center text-center gap-3 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
          style={{
            backgroundColor: 'rgb(var(--muted))',
            borderColor: 'rgb(var(--border))',
          }}
        >
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
            style={{ backgroundColor: 'rgb(var(--accent) / 0.15)' }}
          >
            <PenLine size={24} style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <p className="font-semibold text-sm mb-1" style={{ color: 'rgb(var(--foreground))' }}>
              Manuell erstellen
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'rgb(var(--foreground-muted))' }}>
              Felder selbst ausfüllen und XRechnung 3.0.2 direkt generieren
            </p>
          </div>
        </Link>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4: Fertig + Konfetti
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = [
  '#14b8a6', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#10b981', '#f97316',
  '#06b6d4', '#84cc16',
]

function Confetti() {
  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(600px) rotate(720deg); opacity: 0; }
        }
        .confetti-piece {
          position: absolute;
          top: 0;
          width: 10px;
          height: 10px;
          border-radius: 2px;
          animation: confetti-fall linear infinite;
        }
      `}</style>
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        {CONFETTI_COLORS.map((color, i) => (
          <div
            key={i}
            className="confetti-piece"
            style={{
              left: `${(i / CONFETTI_COLORS.length) * 90 + 5}%`,
              backgroundColor: color,
              animationDuration: `${2.2 + (i % 3) * 0.5}s`,
              animationDelay: `${(i * 0.18) % 1.5}s`,
              width: i % 2 === 0 ? '8px' : '12px',
              height: i % 3 === 0 ? '14px' : '8px',
              borderRadius: i % 2 === 0 ? '50%' : '2px',
            }}
          />
        ))}
      </div>
    </>
  )
}

function StepDone({
  companyName,
  logoUploaded,
}: {
  companyName: string
  logoUploaded: boolean
}) {
  return (
    <div className="relative text-center py-4 overflow-hidden">
      <Confetti />
      <div
        className="relative z-10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-lg"
        style={{ backgroundColor: 'rgb(var(--accent))' }}
      >
        <CheckCircle size={40} className="text-white" />
      </div>
      <h2
        className="relative z-10 text-2xl font-bold mb-2"
        style={{ color: 'rgb(var(--foreground))' }}
      >
        Ihr Setup ist abgeschlossen!
      </h2>
      <p
        className="relative z-10 text-sm mb-6 max-w-xs mx-auto"
        style={{ color: 'rgb(var(--foreground-muted))' }}
      >
        Alles eingerichtet. Sie können jetzt XRechnungen erstellen und versenden.
      </p>

      {/* Summary */}
      <div
        className="relative z-10 rounded-xl border p-4 text-left mb-6 space-y-2"
        style={{
          backgroundColor: 'rgb(var(--muted))',
          borderColor: 'rgb(var(--border))',
        }}
      >
        <div className="flex items-center gap-2 text-sm">
          <Check size={16} style={{ color: 'rgb(var(--accent))' }} />
          <span style={{ color: 'rgb(var(--foreground))' }}>
            Firmenname: <strong>{companyName || 'Gespeichert'}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Check size={16} style={{ color: logoUploaded ? 'rgb(var(--accent))' : 'rgb(var(--foreground-muted))' }} />
          <span style={{ color: logoUploaded ? 'rgb(var(--foreground))' : 'rgb(var(--foreground-muted))' }}>
            Logo: {logoUploaded ? <strong>Hochgeladen</strong> : 'Nicht hochgeladen'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Check size={16} style={{ color: 'rgb(var(--accent))' }} />
          <span style={{ color: 'rgb(var(--foreground))' }}>
            XRechnung 3.0.2 konform
          </span>
        </div>
      </div>

      <Link
        href="/dashboard"
        className="relative z-10 inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-md hover:opacity-90 transition-opacity"
        style={{ backgroundColor: 'rgb(var(--primary))' }}
      >
        Zum Dashboard
        <ArrowRight size={16} />
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const [formData, setFormData] = useState<FormData>({
    companyName: '',
    vatId: '',
    street: '',
    zip: '',
    city: '',
  })

  const patchForm = (patch: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }))
  }

  // Step 1 validation
  const step1Valid =
    formData.companyName.trim().length > 0 &&
    formData.street.trim().length > 0 &&
    formData.city.trim().length > 0

  // Step 2: logo is optional, can always proceed
  const step2CanNext = true

  const handleNextFromStep1 = async () => {
    if (!step1Valid) return
    setSaving(true)
    setSaveError(null)
    try {
      const address = [formData.street, formData.zip, formData.city]
        .filter(Boolean)
        .join(', ')
      await updateCompanyInfo({
        name: formData.companyName,
        vat_id: formData.vatId || undefined,
        address,
      })
      setCurrentStep(2)
    } catch {
      setSaveError('Speichern fehlgeschlagen. Bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  const handleNextFromStep2 = () => {
    setCurrentStep(3)
  }

  const handleNextFromStep3 = () => {
    setCurrentStep(4)
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-10">
      <ProgressIndicator currentStep={currentStep} />

      <div
        className="relative w-full max-w-lg rounded-2xl border p-6 sm:p-8"
        style={{
          backgroundColor: 'rgb(var(--card))',
          borderColor: 'rgb(var(--border))',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Step 1 */}
        {currentStep === 1 && (
          <>
            <StepCompany data={formData} onChange={patchForm} />
            {saveError && <p className="mt-3 text-sm text-red-500">{saveError}</p>}
            <div className="flex justify-end mt-8">
              <button
                type="button"
                onClick={handleNextFromStep1}
                disabled={!step1Valid || saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: 'rgb(var(--primary))' }}
              >
                {saving ? 'Speichern...' : 'Weiter'}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {/* Step 2 */}
        {currentStep === 2 && (
          <>
            <StepLogo
              onUploadDone={(url) => setLogoUrl(url)}
              logoUrl={logoUrl}
            />
            <div className="flex justify-between items-center mt-8">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity"
                style={{
                  backgroundColor: 'rgb(var(--muted))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                <ArrowLeft size={16} />
                Zurück
              </button>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleNextFromStep2}
                  className="text-sm"
                  style={{ color: 'rgb(var(--foreground-muted))' }}
                >
                  Überspringen
                </button>
                <button
                  type="button"
                  onClick={handleNextFromStep2}
                  disabled={!step2CanNext}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: 'rgb(var(--primary))' }}
                >
                  Weiter
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3 */}
        {currentStep === 3 && (
          <>
            <StepFirstInvoice />
            <div className="flex justify-between items-center mt-8">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-opacity"
                style={{
                  backgroundColor: 'rgb(var(--muted))',
                  color: 'rgb(var(--foreground))',
                }}
              >
                <ArrowLeft size={16} />
                Zurück
              </button>
              <button
                type="button"
                onClick={handleNextFromStep3}
                className="text-sm"
                style={{ color: 'rgb(var(--foreground-muted))' }}
              >
                Überspringen →
              </button>
            </div>
          </>
        )}

        {/* Step 4 */}
        {currentStep === 4 && (
          <StepDone
            companyName={formData.companyName}
            logoUploaded={!!logoUrl}
          />
        )}
      </div>
    </div>
  )
}
