'use client'

import { useState, useEffect, useCallback } from 'react'
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
  AlertCircle,
  Calendar,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import {
  getUserProfile,
  updateUserProfile,
  getOnboardingStatus,
  updateCompanyInfo,
  getSubscription,
  createCheckoutSession,
  createPortalSession,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  getErrorMessage,
  type UserProfile,
  type OnboardingStatus,
  type SubscriptionInfo,
  type ApiKeyItem,
  type ApiKeyCreateResult,
} from '@/lib/api'
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
// Feedback banner component
// ---------------------------------------------------------------------------
function FeedbackBanner({
  type,
  message,
}: {
  type: 'success' | 'error'
  message: string
}) {
  if (!message) return null

  const isError = type === 'error'
  return (
    <div
      className={[
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
        isError
          ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
      ].join(' ')}
    >
      {isError ? <AlertCircle size={16} /> : <Check size={16} />}
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Konto (Account)
// ---------------------------------------------------------------------------
function KontoTab() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [fullName, setFullName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  // Fetch profile on mount
  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true)
    try {
      const data = await getUserProfile()
      setProfile(data)
      setFullName(data.full_name ?? '')
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Profildaten konnten nicht geladen werden.') })
    } finally {
      setLoadingProfile(false)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const handleSave = async () => {
    setFeedback(null)

    // Validate password fields if user is trying to change password
    if (newPassword || currentPassword) {
      if (!currentPassword) {
        setFeedback({ type: 'error', message: 'Bitte geben Sie Ihr aktuelles Passwort ein.' })
        return
      }
      if (!newPassword) {
        setFeedback({ type: 'error', message: 'Bitte geben Sie ein neues Passwort ein.' })
        return
      }
      if (newPassword.length < 8) {
        setFeedback({ type: 'error', message: 'Das neue Passwort muss mindestens 8 Zeichen lang sein.' })
        return
      }
      if (newPassword !== confirmPassword) {
        setFeedback({ type: 'error', message: 'Die Passwoerter stimmen nicht ueberein.' })
        return
      }
    }

    setSaving(true)
    try {
      const payload: { full_name?: string; current_password?: string; new_password?: string } = {}

      // Always send full_name if it changed
      if (fullName !== (profile?.full_name ?? '')) {
        payload.full_name = fullName
      }

      // Only send password fields if user filled them in
      if (currentPassword && newPassword) {
        payload.current_password = currentPassword
        payload.new_password = newPassword
      }

      // Only call API if there are changes
      if (Object.keys(payload).length > 0) {
        const updated = await updateUserProfile(payload)
        setProfile(updated)
        setFullName(updated.full_name ?? '')
      }

      // Clear password fields on success
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setFeedback({ type: 'success', message: 'Aenderungen wurden erfolgreich gespeichert.' })
      setTimeout(() => setFeedback(null), 4000)
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Speichern fehlgeschlagen.') })
    } finally {
      setSaving(false)
    }
  }

  if (loadingProfile) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw size={20} className="animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Konto-Einstellungen</CardTitle>
        <CardDescription>Verwalten Sie Ihre persoenlichen Daten und Ihr Passwort.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Feedback */}
        {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}

        {/* Email (read-only) */}
        <Input
          label="E-Mail-Adresse"
          value={profile?.email ?? ''}
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
function OrganisationTab() {
  const [orgStatus, setOrgStatus] = useState<OnboardingStatus | null>(null)
  const [loadingOrg, setLoadingOrg] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [ustIdNr, setUstIdNr] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Fetch org data on mount
  const fetchOrgData = useCallback(async () => {
    setLoadingOrg(true)
    try {
      const data = await getOnboardingStatus()
      setOrgStatus(data)
      setCompanyName(data.org_name ?? '')
      setUstIdNr(data.vat_id ?? '')
      setAddress(data.address ?? '')
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Organisationsdaten konnten nicht geladen werden.') })
    } finally {
      setLoadingOrg(false)
    }
  }, [])

  useEffect(() => {
    fetchOrgData()
  }, [fetchOrgData])

  const handleSave = async () => {
    setFeedback(null)
    setSaving(true)
    try {
      const payload: { name?: string; vat_id?: string; address?: string } = {}

      if (companyName !== (orgStatus?.org_name ?? '')) {
        payload.name = companyName
      }
      if (ustIdNr !== (orgStatus?.vat_id ?? '')) {
        payload.vat_id = ustIdNr
      }
      if (address !== (orgStatus?.address ?? '')) {
        payload.address = address
      }

      if (Object.keys(payload).length > 0) {
        const updated = await updateCompanyInfo(payload)
        setOrgStatus(updated)
        setCompanyName(updated.org_name ?? '')
        setUstIdNr(updated.vat_id ?? '')
        setAddress(updated.address ?? '')
      }

      setFeedback({ type: 'success', message: 'Organisationsdaten wurden erfolgreich gespeichert.' })
      setTimeout(() => setFeedback(null), 4000)
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Speichern fehlgeschlagen.') })
    } finally {
      setSaving(false)
    }
  }

  if (loadingOrg) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw size={20} className="animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisation</CardTitle>
        <CardDescription>Firmendaten und Steuernummer fuer Ihre Rechnungen.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Feedback */}
        {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}

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
// Tab: Abonnement (Subscription) — live Stripe integration
// ---------------------------------------------------------------------------

/** Map plan_status to UI badge colour / label */
const STATUS_CONFIG: Record<string, { color: string; darkColor: string; bgColor: string; darkBgColor: string; label: string }> = {
  active:    { color: 'text-emerald-700', darkColor: 'dark:text-emerald-400', bgColor: 'bg-emerald-50', darkBgColor: 'dark:bg-emerald-900/20', label: 'Aktiv' },
  trialing:  { color: 'text-blue-700',    darkColor: 'dark:text-blue-400',    bgColor: 'bg-blue-50',    darkBgColor: 'dark:bg-blue-900/20',    label: 'Testphase' },
  past_due:  { color: 'text-amber-700',   darkColor: 'dark:text-amber-400',   bgColor: 'bg-amber-50',   darkBgColor: 'dark:bg-amber-900/20',   label: 'Zahlung ausstehend' },
  cancelled: { color: 'text-red-700',     darkColor: 'dark:text-red-400',     bgColor: 'bg-red-50',     darkBgColor: 'dark:bg-red-900/20',     label: 'Gekuendigt' },
}

function formatBillingDate(unixTimestamp: number | null): string {
  if (!unixTimestamp) return '—'
  const date = new Date(unixTimestamp * 1000)
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function AbonnementTab({
  plan: orgPlan,
}: {
  plan: string
}) {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Fetch subscription info on mount
  const fetchSubscription = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSubscription()
      setSubscription(data)
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Abonnement-Daten konnten nicht geladen werden.') })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  // Determine current plan from live subscription data, fall back to org prop
  const currentPlan = (subscription?.plan ?? orgPlan)?.toLowerCase() ?? 'free'
  const planStatus = subscription?.plan_status ?? 'active'
  const statusCfg = STATUS_CONFIG[planStatus] ?? STATUS_CONFIG.active

  // Handle "Jetzt upgraden" — redirect to Stripe Checkout
  const handleUpgrade = async (selectedPlan: 'starter' | 'professional') => {
    setActionLoading(true)
    setFeedback(null)
    try {
      const { url } = await createCheckoutSession(selectedPlan)
      window.location.href = url
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Checkout konnte nicht gestartet werden.') })
      setActionLoading(false)
    }
  }

  // Handle "Abo verwalten" — redirect to Stripe Customer Portal
  const handleManage = async () => {
    setActionLoading(true)
    setFeedback(null)
    try {
      const { url } = await createPortalSession()
      window.location.href = url
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Portal konnte nicht geoeffnet werden.') })
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw size={20} className="animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Feedback */}
      {feedback && (
        <FeedbackBanner type={feedback.type} message={feedback.message} />
      )}

      {/* Current plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Aktueller Plan</CardTitle>
              <CardDescription>Ihr derzeitiges Abonnement und dessen Leistungsumfang.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Status badge */}
              <span
                className={[
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  statusCfg.bgColor,
                  statusCfg.darkBgColor,
                  statusCfg.color,
                  statusCfg.darkColor,
                ].join(' ')}
              >
                <span className="relative flex h-2 w-2">
                  <span className={[
                    'absolute inline-flex h-full w-full rounded-full opacity-75',
                    planStatus === 'active' ? 'animate-ping bg-emerald-400' : '',
                    planStatus === 'trialing' ? 'animate-ping bg-blue-400' : '',
                    planStatus === 'past_due' ? 'bg-amber-400' : '',
                    planStatus === 'cancelled' ? 'bg-red-400' : '',
                  ].join(' ')} />
                  <span className={[
                    'relative inline-flex h-2 w-2 rounded-full',
                    planStatus === 'active' ? 'bg-emerald-500' : '',
                    planStatus === 'trialing' ? 'bg-blue-500' : '',
                    planStatus === 'past_due' ? 'bg-amber-500' : '',
                    planStatus === 'cancelled' ? 'bg-red-500' : '',
                  ].join(' ')} />
                </span>
                {statusCfg.label}
              </span>
              {/* Plan badge */}
              <Badge
                variant={PLAN_BADGE_VARIANT[currentPlan] ?? 'secondary'}
                className="text-sm px-3 py-1"
              >
                {currentPlan === 'professional' && <Crown size={14} className="mr-1" />}
                {currentPlan === 'starter' && <Zap size={14} className="mr-1" />}
                {PLAN_LABELS[currentPlan] ?? currentPlan}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {currentPlan === 'free' ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">
                Sie nutzen den kostenlosen Plan. Upgraden Sie fuer erweiterte Funktionen wie
                Analytics, Lieferanten-Verwaltung und wiederkehrende Rechnungen.
              </p>
              <Button onClick={() => handleUpgrade('starter')} disabled={actionLoading}>
                {actionLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Weiterleitung...
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    Jetzt upgraden
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">
                Verwalten Sie Ihr Abonnement, Zahlungsmethode oder kuendigen Sie ueber das Kundenportal.
              </p>
              <Button variant="outline" onClick={handleManage} disabled={actionLoading}>
                {actionLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Weiterleitung...
                  </>
                ) : (
                  <>
                    <ExternalLink size={16} />
                    Abo verwalten
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Plan info summary */}
          <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/50">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Plan</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {PLAN_LABELS[currentPlan] ?? currentPlan}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Rechnungen/Monat</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {currentPlan === 'professional' ? 'Unbegrenzt' : currentPlan === 'starter' ? '100' : '10'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Preis</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {currentPlan === 'professional' ? '49 EUR/Monat' : currentPlan === 'starter' ? '19 EUR/Monat' : 'Kostenlos'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {subscription?.period_end ? 'Naechste Abrechnung' : 'Status'}
                </p>
                <p className={[
                  'text-sm font-semibold',
                  statusCfg.color,
                  statusCfg.darkColor,
                ].join(' ')}>
                  {subscription?.period_end ? (
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={13} className="shrink-0" />
                      {formatBillingDate(subscription.period_end)}
                    </span>
                  ) : (
                    statusCfg.label
                  )}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upgrade cards for free users */}
      {currentPlan === 'free' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Starter */}
          <Card className="relative overflow-hidden border-blue-200 dark:border-blue-800">
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  <Zap size={18} className="inline mr-1.5 text-blue-500" />
                  Starter
                </CardTitle>
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  19 <span className="text-sm font-normal text-slate-500">EUR/Monat</span>
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-center gap-2"><Check size={15} className="text-emerald-500 shrink-0" /> 100 Rechnungen/Monat</li>
                <li className="flex items-center gap-2"><Check size={15} className="text-emerald-500 shrink-0" /> Analytics Dashboard</li>
                <li className="flex items-center gap-2"><Check size={15} className="text-emerald-500 shrink-0" /> Lieferanten-Verwaltung</li>
                <li className="flex items-center gap-2"><Check size={15} className="text-emerald-500 shrink-0" /> Wiederkehrende Rechnungen</li>
              </ul>
              <Button className="w-full" onClick={() => handleUpgrade('starter')} disabled={actionLoading}>
                {actionLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    Starter waehlen
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Professional */}
          <Card className="relative overflow-hidden border-emerald-200 dark:border-emerald-800">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  <Crown size={18} className="inline mr-1.5 text-emerald-500" />
                  Professional
                </CardTitle>
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  49 <span className="text-sm font-normal text-slate-500">EUR/Monat</span>
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-center gap-2"><Check size={15} className="text-emerald-500 shrink-0" /> Unbegrenzte Rechnungen</li>
                <li className="flex items-center gap-2"><Check size={15} className="text-emerald-500 shrink-0" /> Mahnwesen</li>
                <li className="flex items-center gap-2"><Check size={15} className="text-emerald-500 shrink-0" /> API-Zugriff</li>
                <li className="flex items-center gap-2"><Check size={15} className="text-emerald-500 shrink-0" /> Prioritaets-Support</li>
              </ul>
              <Button className="w-full" variant="outline" onClick={() => handleUpgrade('professional')} disabled={actionLoading}>
                {actionLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    Professional waehlen
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

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
                  {(['free', 'starter', 'professional'] as const).map((tier) => (
                    <th
                      key={tier}
                      className={[
                        'text-center py-3 px-4 font-medium',
                        tier === currentPlan
                          ? 'text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/50 rounded-t-md'
                          : 'text-slate-600 dark:text-slate-400',
                      ].join(' ')}
                    >
                      {tier === currentPlan && (
                        <span className="block text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-0.5">
                          Ihr Plan
                        </span>
                      )}
                      {tier === 'free' ? 'Free' : tier === 'starter' ? 'Starter' : 'Professional'}
                    </th>
                  ))}
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
                      <td
                        key={tier}
                        className={[
                          'text-center py-3 px-4',
                          tier === currentPlan ? 'bg-slate-50 dark:bg-slate-800/50' : '',
                        ].join(' ')}
                      >
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
// Available scopes
// ---------------------------------------------------------------------------
const AVAILABLE_SCOPES = [
  { value: 'read:invoices',   label: 'Rechnungen lesen' },
  { value: 'write:invoices',  label: 'Rechnungen schreiben' },
  { value: 'read:suppliers',  label: 'Lieferanten lesen' },
  { value: 'write:suppliers', label: 'Lieferanten schreiben' },
]

// ---------------------------------------------------------------------------
// Sub-component: One-time key display box
// ---------------------------------------------------------------------------
function NewKeyBox({ fullKey, onDismiss }: { fullKey: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          Dieser Schluessel wird nur einmal angezeigt. Bitte jetzt kopieren und sicher speichern.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className={[
          'flex-1 block rounded-md border bg-white dark:bg-slate-900 px-3 py-2',
          'text-sm font-mono text-slate-800 dark:text-slate-200',
          'border-slate-300 dark:border-slate-700 break-all',
        ].join(' ')}>
          {fullKey}
        </code>
        <Button variant="outline" size="sm" onClick={handleCopy} title="Kopieren">
          {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={onDismiss}>
        Verstanden, Schluessel gespeichert
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-component: Create key modal
// ---------------------------------------------------------------------------
function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (result: ApiKeyCreateResult) => void
}) {
  const [name, setName] = useState('')
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  const handleCreate = async () => {
    setError(null)
    if (!name.trim()) {
      setError('Bitte einen Namen eingeben.')
      return
    }
    if (selectedScopes.length === 0) {
      setError('Bitte mindestens einen Scope auswaehlen.')
      return
    }
    setCreating(true)
    try {
      const result = await createApiKey(name.trim(), selectedScopes, null)
      onCreated(result)
    } catch (err) {
      setError(getErrorMessage(err, 'Schluessel konnte nicht erstellt werden.'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={[
        'relative w-full max-w-md rounded-xl border shadow-lg p-6 space-y-5',
        'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700',
      ].join(' ')}>
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Neuen API-Schluessel erstellen
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Vergeben Sie einen Namen und waehlen Sie die gewuenschten Berechtigungen.
          </p>
        </div>

        {error && <FeedbackBanner type="error" message={error} />}

        {/* Name */}
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Produktion, CI/CD, Buchhaltungssystem"
          autoFocus
        />

        {/* Scopes */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Berechtigungen (Scopes)
          </label>
          <div className="grid grid-cols-1 gap-2">
            {AVAILABLE_SCOPES.map((scope) => (
              <label
                key={scope.value}
                className={[
                  'flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors',
                  selectedScopes.includes(scope.value)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={selectedScopes.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">{scope.label}</span>
                <code className="ml-auto text-xs text-slate-400 dark:text-slate-500 font-mono">
                  {scope.value}
                </code>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onClose} disabled={creating}>
            Abbrechen
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Erstellen...
              </>
            ) : (
              <>
                <Key size={16} />
                Schluessel erstellen
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: API-Schluessel (API Keys)
// ---------------------------------------------------------------------------
function ApiKeysTab({ plan }: { plan: string }) {
  const currentPlan = plan?.toLowerCase() ?? 'free'
  const isProfessional = currentPlan === 'professional'

  const [keys, setKeys] = useState<ApiKeyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKeyResult, setNewKeyResult] = useState<ApiKeyCreateResult | null>(null)
  const [revokingId, setRevokingId] = useState<number | null>(null)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listApiKeys()
      setKeys(data)
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'API-Schluessel konnten nicht geladen werden.') })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isProfessional) fetchKeys()
  }, [isProfessional, fetchKeys])

  const handleRevoke = async (id: number) => {
    if (!window.confirm('Diesen API-Schluessel wirklich widerrufen? Diese Aktion kann nicht rueckgaengig gemacht werden.')) return
    setRevokingId(id)
    try {
      await revokeApiKey(id)
      setKeys((prev) => prev.filter((k) => k.id !== id))
      setFeedback({ type: 'success', message: 'API-Schluessel wurde widerrufen.' })
      setTimeout(() => setFeedback(null), 4000)
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Widerrufen fehlgeschlagen.') })
    } finally {
      setRevokingId(null)
    }
  }

  const handleCreated = (result: ApiKeyCreateResult) => {
    setShowCreateModal(false)
    setNewKeyResult(result)
    setKeys((prev) => [result, ...prev])
    setFeedback(null)
  }

  if (!isProfessional) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API-Schluessel</CardTitle>
          <CardDescription>Programmatischer Zugriff auf die RechnungsWerk API.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border-2 border-dashed p-8 text-center border-slate-200 dark:border-slate-700">
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
    <>
      {showCreateModal && (
        <CreateKeyModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>API-Schluessel</CardTitle>
              <CardDescription>
                Verwenden Sie API-Schluessel fuer den programmatischen Zugriff auf die RechnungsWerk API.
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateModal(true)}>
              <Key size={16} />
              Neuen API-Schluessel erstellen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Feedback */}
          {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}

          {/* One-time key display after creation */}
          {newKeyResult && (
            <NewKeyBox
              fullKey={newKeyResult.full_key}
              onDismiss={() => setNewKeyResult(null)}
            />
          )}

          {/* Keys table */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw size={20} className="animate-spin text-slate-400" />
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center">
              <Key size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Noch keine API-Schluessel erstellt.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">Prefix</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">Scopes</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">Erstellt</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 dark:text-slate-400">Zuletzt genutzt</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600 dark:text-slate-400">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr
                      key={key.id}
                      className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {key.name}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 font-mono text-slate-700 dark:text-slate-300">
                          {key.key_prefix}...
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(key.scopes ?? []).map((s) => (
                            <span
                              key={s}
                              className="inline-block rounded-full px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {key.created_at
                          ? new Date(key.created_at).toLocaleDateString('de-DE')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {key.last_used_at
                          ? new Date(key.last_used_at).toLocaleDateString('de-DE')
                          : 'Noch nie'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(key.id)}
                          disabled={revokingId === key.id}
                          className="text-red-600 hover:text-red-700 hover:border-red-300 dark:text-red-400 dark:hover:text-red-300"
                        >
                          {revokingId === key.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            'Widerrufen'
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Security hint */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="flex items-start gap-3">
              <Shield size={18} className="shrink-0 mt-0.5 text-slate-500 dark:text-slate-400" />
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p>
                  <strong className="text-slate-700 dark:text-slate-300">Hinweis:</strong>{' '}
                  Geben Sie Ihre API-Schluessel niemals weiter und speichern Sie sie nicht
                  in oeffentlichen Repositories.
                </p>
                <p>
                  Dokumentation:{' '}
                  <Link href="/docs/api" className="text-blue-600 dark:text-blue-400 hover:underline">
                    API-Referenz ansehen
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
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
          <KontoTab />
        </TabsContent>

        <TabsContent value="organisation">
          <OrganisationTab />
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
