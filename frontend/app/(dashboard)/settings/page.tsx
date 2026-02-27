'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  User,
  Building2,
  CreditCard,
  Key,
  Save,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Check,
  ExternalLink,
  Lock,
  Crown,
  Zap,
  Shield,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

// ---------------------------------------------------------------------------
// Plan config
// ---------------------------------------------------------------------------
interface PlanFeature {
  label: string
  free: boolean | string
  starter: boolean | string
  professional: boolean | string
}

const PLAN_FEATURES: PlanFeature[] = [
  { label: 'Rechnungen pro Monat', free: '10', starter: '100', professional: 'Unbegrenzt' },
  { label: 'OCR-Erkennung', free: true, starter: true, professional: true },
  { label: 'XRechnung / ZUGFeRD Export', free: true, starter: true, professional: true },
  { label: 'Validator', free: true, starter: true, professional: true },
  { label: 'Analytics Dashboard', free: false, starter: true, professional: true },
  { label: 'Lieferanten-Verwaltung', free: false, starter: true, professional: true },
  { label: 'Wiederkehrende Rechnungen', free: false, starter: true, professional: true },
  { label: 'Mahnwesen', free: false, starter: false, professional: true },
  { label: 'API-Zugriff', free: false, starter: false, professional: true },
  { label: 'Prioritaets-Support', free: false, starter: false, professional: true },
]

const PLAN_BADGE_VARIANT: Record<string, 'secondary' | 'default' | 'success'> = {
  free: 'secondary',
  starter: 'default',
  professional: 'success',
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
}

// ---------------------------------------------------------------------------
// Tab: Konto (Account)
// ---------------------------------------------------------------------------
function KontoTab({ user }: { user: { email: string; full_name: string } | null }) {
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  const handleSave = async () => {
    setSaving(true)
    // TODO: call PATCH /api/users/me
    await new Promise((r) => setTimeout(r, 600))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Konto-Einstellungen</CardTitle>
        <CardDescription>Verwalten Sie Ihre persoenlichen Daten und Ihr Passwort.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Email (read-only) */}
        <Input
          label="E-Mail-Adresse"
          value={user?.email ?? ''}
          disabled
          hint="Die E-Mail-Adresse kann nicht geaendert werden."
        />

        {/* Full name */}
        <Input
          label="Vollstaendiger Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Max Mustermann"
        />

        {/* Divider */}
        <div className="border-t border-slate-200 dark:border-slate-700" />

        {/* Password change */}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Passwort aendern
          </h4>
          <div className="space-y-4">
            <Input
              label="Aktuelles Passwort"
              type={showCurrentPw ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Aktuelles Passwort eingeben"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowCurrentPw((p) => !p)}
                  className="pointer-events-auto cursor-pointer"
                >
                  {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            <Input
              label="Neues Passwort"
              type={showNewPw ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Neues Passwort eingeben"
              hint="Mindestens 8 Zeichen"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowNewPw((p) => !p)}
                  className="pointer-events-auto cursor-pointer"
                >
                  {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            <Input
              label="Passwort bestaetigen"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Neues Passwort wiederholen"
              error={passwordMismatch ? 'Passwoerter stimmen nicht ueberein.' : undefined}
            />
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Speichern...
              </>
            ) : saved ? (
              <>
                <Check size={16} />
                Gespeichert
              </>
            ) : (
              <>
                <Save size={16} />
                Aenderungen speichern
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab: Organisation
// ---------------------------------------------------------------------------
function OrganisationTab({
  user,
}: {
  user: { organization: { name: string; plan: string } } | null
}) {
  const [companyName, setCompanyName] = useState(user?.organization?.name ?? '')
  const [ustIdNr, setUstIdNr] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    // TODO: call PATCH /api/onboarding/company
    await new Promise((r) => setTimeout(r, 600))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisation</CardTitle>
        <CardDescription>Firmendaten und Steuernummer fuer Ihre Rechnungen.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Input
          label="Firmenname"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Muster GmbH"
        />

        <Input
          label="USt-IdNr"
          value={ustIdNr}
          onChange={(e) => setUstIdNr(e.target.value)}
          placeholder="DE123456789"
          hint="Umsatzsteuer-Identifikationsnummer gemaess §27a UStG"
        />

        {/* Address textarea */}
        <div className="flex flex-col gap-1.5 w-full">
          <label className="text-sm font-medium leading-none text-slate-700 dark:text-slate-200">
            Adresse
          </label>
          <textarea
            className={[
              'flex min-h-[100px] w-full rounded-md border bg-white px-3 py-2 text-sm',
              'text-slate-900 placeholder:text-slate-400',
              'transition-colors duration-150',
              'focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500',
              'border-slate-300',
              'dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:border-slate-700 dark:focus:ring-blue-400',
              'resize-y',
            ].join(' ')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={'Musterstrasse 1\n12345 Berlin\nDeutschland'}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Wird auf allen ausgehenden Rechnungen angezeigt.
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Speichern...
              </>
            ) : saved ? (
              <>
                <Check size={16} />
                Gespeichert
              </>
            ) : (
              <>
                <Save size={16} />
                Aenderungen speichern
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tab: Abonnement (Subscription)
// ---------------------------------------------------------------------------
function AbonnementTab({
  plan,
}: {
  plan: string
}) {
  const currentPlan = plan?.toLowerCase() ?? 'free'
  const [portalLoading, setPortalLoading] = useState(false)

  const handleManageSubscription = async () => {
    setPortalLoading(true)
    try {
      // TODO: call POST /api/billing/portal to get Stripe portal URL
      await new Promise((r) => setTimeout(r, 600))
      // window.location.href = data.url
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Aktueller Plan</CardTitle>
              <CardDescription>Ihr derzeitiges Abonnement und dessen Leistungsumfang.</CardDescription>
            </div>
            <Badge
              variant={PLAN_BADGE_VARIANT[currentPlan] ?? 'secondary'}
              className="text-sm px-3 py-1"
            >
              {currentPlan === 'professional' && <Crown size={14} className="mr-1" />}
              {currentPlan === 'starter' && <Zap size={14} className="mr-1" />}
              {PLAN_LABELS[currentPlan] ?? currentPlan}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {currentPlan === 'free' ? (
            <div className="flex items-center gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">
                Sie nutzen den kostenlosen Plan. Upgraden Sie fuer erweiterte Funktionen.
              </p>
              <Button asChild>
                <Link href="/preise">
                  <Zap size={16} />
                  Jetzt upgraden
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">
                Verwalten Sie Ihr Abonnement, Zahlungsmethode oder kuendigen Sie ueber das Kundenportal.
              </p>
              <Button variant="outline" onClick={handleManageSubscription} disabled={portalLoading}>
                {portalLoading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <ExternalLink size={16} />
                )}
                Abo verwalten
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feature comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Funktionsvergleich</CardTitle>
          <CardDescription>Was in jedem Plan enthalten ist.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 pr-4 font-medium text-slate-600 dark:text-slate-400">
                    Funktion
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                    Free
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                    Starter
                  </th>
                  <th className="text-center py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                    Professional
                  </th>
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURES.map((feature) => (
                  <tr
                    key={feature.label}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <td className="py-3 pr-4 text-slate-900 dark:text-slate-100">
                      {feature.label}
                    </td>
                    {(['free', 'starter', 'professional'] as const).map((tier) => (
                      <td key={tier} className="text-center py-3 px-4">
                        {typeof feature[tier] === 'string' ? (
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {feature[tier]}
                          </span>
                        ) : feature[tier] ? (
                          <Check size={18} className="inline-block text-emerald-500" />
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">&mdash;</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: API-Schluessel (API Keys)
// ---------------------------------------------------------------------------
function ApiKeysTab({ plan }: { plan: string }) {
  const currentPlan = plan?.toLowerCase() ?? 'free'
  const isProfessional = currentPlan === 'professional'

  const [apiKey] = useState('rw_live_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)

  const maskedKey = apiKey.slice(0, 12) + '...' + apiKey.slice(-4)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isProfessional) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API-Schluessel</CardTitle>
          <CardDescription>Programmatischer Zugriff auf die RechnungsWerk API.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="rounded-lg border-2 border-dashed p-8 text-center"
            style={{
              borderColor: 'rgb(var(--border))',
            }}
          >
            <Lock size={40} className="mx-auto mb-4 text-slate-400 dark:text-slate-500" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-2">
              API-Zugriff ist im Professional-Plan verfuegbar
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-md mx-auto">
              Mit dem Professional-Plan erhalten Sie API-Schluessel fuer die programmatische
              Erstellung und Verwaltung von E-Rechnungen.
            </p>
            <Button asChild>
              <Link href="/preise">
                <Crown size={16} />
                Auf Professional upgraden
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API-Schluessel</CardTitle>
        <CardDescription>
          Verwenden Sie diesen Schluessel fuer den programmatischen Zugriff auf die RechnungsWerk API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* API key display */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Live API-Schluessel
          </label>
          <div className="flex items-center gap-2">
            <div
              className={[
                'flex-1 flex items-center h-10 rounded-md border bg-slate-50 px-3 text-sm font-mono',
                'text-slate-700 border-slate-300',
                'dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700',
              ].join(' ')}
            >
              {showKey ? apiKey : maskedKey}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowKey((s) => !s)}
              title={showKey ? 'Schluessel verbergen' : 'Schluessel anzeigen'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              title="In Zwischenablage kopieren"
            >
              {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
            </Button>
          </div>
        </div>

        {/* Regenerate */}
        <div
          className="rounded-lg border p-4 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
        >
          <div className="flex items-start gap-3">
            <Shield size={20} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
                Schluessel neu generieren
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                Das Neugenerieren Ihres API-Schluessels macht den bisherigen Schluessel sofort
                ungueltig. Alle Integrationen muessen aktualisiert werden.
              </p>
              <Button variant="outline" size="sm">
                <RefreshCw size={14} />
                Neuen Schluessel generieren
              </Button>
            </div>
          </div>
        </div>

        {/* Usage hint */}
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p>
            <strong>Hinweis:</strong> Geben Sie Ihren API-Schluessel niemals weiter und speichern
            Sie ihn nicht in oeffentlichen Repositories.
          </p>
          <p>
            Dokumentation:{' '}
            <Link
              href="/docs/api"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              API-Referenz ansehen
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------
export default function SettingsPage() {
  const { user, loading } = useAuth()
  const plan = user?.organization?.plan ?? 'free'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw size={24} className="animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Einstellungen
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Verwalten Sie Ihr Konto, Ihre Organisation und Ihr Abonnement.
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="konto" className="w-full">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="konto" className="gap-1.5">
            <User size={14} />
            <span className="hidden sm:inline">Konto</span>
          </TabsTrigger>
          <TabsTrigger value="organisation" className="gap-1.5">
            <Building2 size={14} />
            <span className="hidden sm:inline">Organisation</span>
          </TabsTrigger>
          <TabsTrigger value="abonnement" className="gap-1.5">
            <CreditCard size={14} />
            <span className="hidden sm:inline">Abonnement</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5">
            <Key size={14} />
            <span className="hidden sm:inline">API-Schluessel</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="konto">
          <KontoTab user={user} />
        </TabsContent>

        <TabsContent value="organisation">
          <OrganisationTab user={user} />
        </TabsContent>

        <TabsContent value="abonnement">
          <AbonnementTab plan={plan} />
        </TabsContent>

        <TabsContent value="api">
          <ApiKeysTab plan={plan} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
