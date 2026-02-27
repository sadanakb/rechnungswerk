'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  UsersRound,
  UserPlus,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  Check,
  AlertCircle,
  Crown,
  Shield,
  Lock,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { api, getErrorMessage } from '@/lib/api'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TeamMember {
  id: number
  user_id: number
  email: string
  full_name: string | null
  role: 'owner' | 'admin' | 'member'
  joined_at: string | null
}

// ---------------------------------------------------------------------------
// Role badge styling
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'success'; icon: React.ElementType }> = {
  owner: { label: 'Owner', variant: 'success', icon: Crown },
  admin: { label: 'Admin', variant: 'default', icon: Shield },
  member: { label: 'Mitglied', variant: 'secondary', icon: UsersRound },
}

function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.member
  const Icon = config.icon
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon size={12} />
      {config.label}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Feedback banner (same pattern as settings page)
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
// Invite Dialog
// ---------------------------------------------------------------------------

function InviteDialog({
  onInvited,
}: {
  onInvited: () => void
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleInvite = async () => {
    setFeedback(null)
    if (!email) {
      setFeedback({ type: 'error', message: 'Bitte geben Sie eine E-Mail-Adresse ein.' })
      return
    }
    setSending(true)
    try {
      await api.post('/api/teams/invite', { email, role })
      setFeedback({ type: 'success', message: 'Einladung wurde gesendet.' })
      setEmail('')
      setRole('member')
      onInvited()
      setTimeout(() => {
        setOpen(false)
        setFeedback(null)
      }, 1500)
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Einladung fehlgeschlagen.') })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus size={16} />
          Mitglied einladen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neues Mitglied einladen</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Geben Sie die E-Mail-Adresse des neuen Teammitglieds ein.
        </DialogDescription>
        <div className="px-6 pb-2 space-y-4">
          {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}

          <Input
            label="E-Mail-Adresse"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kollege@firma.de"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Rolle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
              className={[
                'flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm',
                'text-slate-900 border-slate-300',
                'focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-blue-500',
                'dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:focus:ring-blue-400',
              ].join(' ')}
            >
              <option value="member">Mitglied</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Admins koennen weitere Mitglieder einladen.
            </p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Abbrechen</Button>
          </DialogClose>
          <Button onClick={handleInvite} disabled={sending}>
            {sending ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Senden...
              </>
            ) : (
              <>
                <UserPlus size={16} />
                Einladung senden
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Upgrade Prompt (shown for non-professional plans)
// ---------------------------------------------------------------------------

function UpgradePrompt() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Team
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Verwalten Sie Ihr Team und laden Sie Mitglieder ein.
        </p>
      </div>

      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <Lock size={48} className="mx-auto mb-4 text-slate-400 dark:text-slate-500" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Team-Verwaltung ist im Professional-Plan verfuegbar
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
              Mit dem Professional-Plan koennen Sie Teammitglieder einladen, Rollen verwalten
              und gemeinsam an Rechnungen arbeiten.
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Team Page
// ---------------------------------------------------------------------------

export default function TeamPage() {
  const { user, loading: authLoading } = useAuth()
  const plan = user?.organization?.plan ?? 'free'
  const isProfessional = plan?.toLowerCase() === 'professional'

  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Determine current user's role in the organization
  const currentUserId = user?.id
  const currentMember = members.find((m) => m.user_id === currentUserId)
  const isOwner = currentMember?.role === 'owner'

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await api.get('/api/teams/members')
      setMembers(resp.data)
    } catch (err) {
      // If 403 from feature gate, just set empty — the upgrade prompt handles this
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && isProfessional) {
      fetchMembers()
    } else {
      setLoading(false)
    }
  }, [authLoading, isProfessional, fetchMembers])

  const handleRemoveMember = async (userId: number, memberName: string) => {
    if (!confirm(`Moechten Sie ${memberName} wirklich aus dem Team entfernen?`)) return
    setFeedback(null)
    try {
      await api.delete(`/api/teams/members/${userId}`)
      setFeedback({ type: 'success', message: `${memberName} wurde entfernt.` })
      fetchMembers()
      setTimeout(() => setFeedback(null), 4000)
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Entfernen fehlgeschlagen.') })
    }
  }

  const handleChangeRole = async (userId: number, newRole: string) => {
    setFeedback(null)
    try {
      await api.patch(`/api/teams/members/${userId}`, { role: newRole })
      setFeedback({ type: 'success', message: 'Rolle wurde geaendert.' })
      fetchMembers()
      setTimeout(() => setFeedback(null), 4000)
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'Rollenaenderung fehlgeschlagen.') })
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw size={24} className="animate-spin text-slate-400" />
      </div>
    )
  }

  // Show upgrade prompt for non-professional plans
  if (!isProfessional) {
    return <UpgradePrompt />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Team
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Verwalten Sie Ihr Team und laden Sie neue Mitglieder ein.
          </p>
        </div>
        {(isOwner || currentMember?.role === 'admin') && (
          <InviteDialog onInvited={fetchMembers} />
        )}
      </div>

      {/* Feedback */}
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} />}

      {/* Members table */}
      <Card>
        <CardHeader>
          <CardTitle>Mitglieder ({members.length})</CardTitle>
          <CardDescription>Alle Mitglieder Ihrer Organisation.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={20} className="animate-spin text-slate-400" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <UsersRound size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Keine Mitglieder gefunden.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 pr-4 font-medium text-slate-600 dark:text-slate-400">
                      Name
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                      E-Mail
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                      Rolle
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">
                      Beigetreten
                    </th>
                    {isOwner && (
                      <th className="text-right py-3 pl-4 font-medium text-slate-600 dark:text-slate-400">
                        Aktionen
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                    >
                      <td className="py-3 pr-4 text-slate-900 dark:text-slate-100">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white shrink-0"
                            style={{ backgroundColor: 'rgb(var(--primary))' }}
                          >
                            {(member.full_name ?? member.email)[0].toUpperCase()}
                          </div>
                          <span className="font-medium">
                            {member.full_name ?? '-'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {member.email}
                      </td>
                      <td className="py-3 px-4">
                        <RoleBadge role={member.role} />
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                        {member.joined_at
                          ? new Date(member.joined_at).toLocaleDateString('de-DE', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : '-'}
                      </td>
                      {isOwner && (
                        <td className="py-3 pl-4 text-right">
                          {member.role !== 'owner' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal size={16} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Rolle aendern</DropdownMenuLabel>
                                {member.role !== 'admin' && (
                                  <DropdownMenuItem
                                    onClick={() => handleChangeRole(member.user_id, 'admin')}
                                  >
                                    <Shield size={14} />
                                    Zum Admin machen
                                  </DropdownMenuItem>
                                )}
                                {member.role !== 'member' && (
                                  <DropdownMenuItem
                                    onClick={() => handleChangeRole(member.user_id, 'member')}
                                  >
                                    <UsersRound size={14} />
                                    Zum Mitglied machen
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  destructive
                                  onClick={() =>
                                    handleRemoveMember(
                                      member.user_id,
                                      member.full_name ?? member.email,
                                    )
                                  }
                                >
                                  <Trash2 size={14} />
                                  Entfernen
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
