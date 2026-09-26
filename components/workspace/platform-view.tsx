'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/workspace/automation-primitives'
import { createApiKeyAction, inviteMemberAction, listApiKeysAction, listAuditLogsAction, listNotificationsAction, listPendingInvitationsAction, markAllNotificationsReadAction, markNotificationReadAction, removeMemberAction, revokeApiKeyAction, revokeInvitationAction, updateMemberRoleAction } from '@/app/actions/platform'

type Member = { id: string; role: string; user: { id: string; name: string; email: string; avatarInitials: string | null } }
type Notification = { id: string; title: string; body: string; readAt: string | null; createdAt: string }
type ApiKey = { id: string; name: string; keyPrefix: string; createdAt: string }
type Invitation = { id: string; email: string; role: string; createdAt: string; expiresAt: string }

export default function PlatformView({ kind, initialMembers = [], initialNotifications = [], initialApiKeys = [], onUnreadCountChange }: {
  kind: 'Team' | 'Inbox' | 'API Keys' | 'Audit Logs'
  initialMembers?: Member[]
  initialNotifications?: Notification[]
  initialApiKeys?: ApiKey[]
  onUnreadCountChange?: (value: number | ((previous: number) => number)) => void
}) {
  const [members, setMembers] = useState(initialMembers)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [notifications, setNotifications] = useState(initialNotifications)
  const [keys, setKeys] = useState(initialApiKeys)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [keyName, setKeyName] = useState('')
  const [secret, setSecret] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [audit, setAudit] = useState<{ id: string; action: string; entityType: string; createdAt: string; actor: { name: string } | null }[]>([])
  useEffect(() => {
    if (kind === 'Team') void listPendingInvitationsAction().then(result => { if ('ok' in result) setInvitations(result.data as Invitation[]) })
    if (kind === 'API Keys') void listApiKeysAction().then(result => { if ('ok' in result) setKeys(result.data as ApiKey[]) })
    if (kind === 'Inbox' && !initialNotifications.length) void listNotificationsAction().then(result => { if ('ok' in result) setNotifications(result.data as Notification[]) })
    if (kind === 'Audit Logs') void listAuditLogsAction().then(result => { if ('ok' in result) setAudit(result.data as typeof audit) })
  }, [kind, initialNotifications.length])
  const run = async (fn: () => Promise<{ ok: true; data: unknown } | { error: string }>, success: string) => {
    setBusy(true)
    setError('')
    try {
      const result = await fn()
      if ('error' in result) setError(result.error)
      else setMessage(success)
    } catch {
      setError('The request could not be completed. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  if (kind === 'Team') return <div className="flex flex-col gap-6"><Section title="Team" description="Manage organization members and roles." /><Card><div className="flex gap-2"><input value={email} onChange={e => setEmail(e.target.value)} placeholder="member@example.com" className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" /><Button disabled={busy} onClick={() => void run(async () => { const result = await inviteMemberAction({ email, role: 'MEMBER' }); if ('ok' in result) { setEmail(''); setInviteLink(`${window.location.origin}/invitations/${(result.data as {token:string}).token}`); const pending = await listPendingInvitationsAction(); if ('ok' in pending) setInvitations(pending.data as Invitation[]) } return result }, 'Invitation created.')}>Invite</Button></div>{inviteLink && <p className="mt-3 break-all rounded bg-muted p-2 text-xs">Share this invitation link: <a className="text-primary underline" href={inviteLink}>{inviteLink}</a></p>}<div className="mt-4 divide-y divide-border">{members.map(member => <div key={member.id} className="flex items-center gap-3 py-3 text-sm"><span className="flex-1">{member.user.name}<span className="ml-2 text-xs text-muted-foreground">{member.user.email}</span></span><select value={member.role} onChange={e => void run(async () => { const result = await updateMemberRoleAction({ userId: member.user.id, role: e.target.value }); if ('ok' in result) setMembers(items => items.map(item => item.id === member.id ? { ...item, role: e.target.value } : item)); return result }, 'Role updated.')} className="rounded border border-border bg-background px-2 py-1 text-xs">{['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'].map(role => <option key={role}>{role}</option>)}</select><button onClick={() => void run(async () => { const result = await removeMemberAction({ userId: member.user.id }); if ('ok' in result) setMembers(items => items.filter(item => item.id !== member.id)); return result }, 'Member removed.')} className="text-xs text-destructive">Remove</button></div>)}</div><h3 className="mt-6 text-sm font-semibold">Pending invitations</h3><div className="divide-y divide-border">{invitations.map(invitation => <div key={invitation.id} className="flex items-center gap-3 py-3 text-xs"><span className="flex-1">{invitation.email} <span className="text-muted-foreground">({invitation.role})</span></span><span className="text-muted-foreground">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span><button onClick={() => void run(async () => { const result = await revokeInvitationAction({ id: invitation.id }); if ('ok' in result) setInvitations(items => items.filter(item => item.id !== invitation.id)); return result }, 'Invitation revoked.')} className="text-destructive">Revoke</button></div>)}</div>{!invitations.length && <p className="py-2 text-xs text-muted-foreground">No pending invitations.</p>}</Card><Feedback message={message} error={error}/></div>
  if (kind === 'Inbox') return <div className="flex flex-col gap-6"><Section title="Inbox" description="Notifications and updates for your organization." /><Card><div className="flex justify-end"><Button variant="outline" disabled={busy || notifications.every(item => item.readAt)} onClick={() => void run(async () => { const result = await markAllNotificationsReadAction(); if ('ok' in result) { setNotifications(items => items.map(item => ({ ...item, readAt: new Date().toISOString() }))); onUnreadCountChange?.(0) } return result }, 'All notifications marked read.')}>Mark all read</Button></div><div className="mt-3 divide-y divide-border">{notifications.map(item => <button key={item.id} onClick={() => void run(async () => { const result = await markNotificationReadAction({ id: item.id }); if ('ok' in result) { setNotifications(items => items.map(notification => notification.id === item.id ? { ...notification, readAt: new Date().toISOString() } : notification)); if (!item.readAt) onUnreadCountChange?.(count => Math.max(0, count - 1)) } return result }, 'Notification marked read.')} className={`block w-full py-3 text-left ${item.readAt ? 'opacity-60' : ''}`}><b className="text-sm">{item.title}</b><p className="text-xs text-muted-foreground">{item.body}</p></button>)}</div>{!notifications.length && <p className="py-8 text-center text-sm text-muted-foreground">No notifications.</p>}</Card><Feedback message={message} error={error}/></div>
  if (kind === 'API Keys') return <div className="flex flex-col gap-6"><Section title="API Keys" description="Manage organization access keys. Secrets are shown once." /><Card><div className="flex gap-2"><input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Key name" className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" /><Button onClick={() => void run(async () => { const result = await createApiKeyAction({ name: keyName }); if ('ok' in result) { setKeys(items => [{ ...(result.data as ApiKey), keyPrefix: (result.data as { secret: string }).secret.slice(0, 12), createdAt: new Date().toISOString() }, ...items]); setSecret((result.data as { secret: string }).secret); setKeyName('') } return result }, 'API key created.')}>Create key</Button></div>{secret && <p className="mt-3 break-all rounded bg-muted p-2 text-xs">Copy this secret now: {secret}</p>}<div className="mt-4 divide-y divide-border">{keys.map(key => <div key={key.id} className="flex py-3 text-sm"><span className="flex-1">{key.name} <span className="text-xs text-muted-foreground">{key.keyPrefix}...</span></span><button onClick={() => void run(async () => { const result = await revokeApiKeyAction({ id: key.id }); if ('ok' in result) setKeys(items => items.filter(item => item.id !== key.id)); return result }, 'API key revoked.')} className="text-xs text-destructive">Revoke</button></div>)}</div></Card><Feedback message={message} error={error}/></div>
  return <div className="flex flex-col gap-6"><Section title="Audit Logs" description="Review organization security and administration activity." /><Card><div className="flex gap-2"><input aria-label="Search audit logs" value={auditSearch} onChange={event => setAuditSearch(event.target.value)} placeholder="Search action or resource type" className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" /><Button variant="outline" onClick={() => void run(async () => { const result = await listAuditLogsAction({ search: auditSearch }); if ('ok' in result) setAudit(result.data as typeof audit); return result }, 'Audit logs loaded.')}>Search logs</Button></div><div className="mt-4 divide-y divide-border">{audit.map(item => <div key={item.id} className="py-3 text-xs"><b>{item.action}</b> · {item.entityType}<span className="ml-2 text-muted-foreground">{item.actor?.name ?? 'System'} · {new Date(item.createdAt).toLocaleString()}</span></div>)}</div>{!audit.length && <p className="py-5 text-center text-sm text-muted-foreground">No audit records match the current search.</p>}</Card><Feedback message={message} error={error}/></div>
}
function Section({ title, description }: { title: string; description: string }) { return <div><h2 className="text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div> }
function Feedback({ message, error }: { message: string; error: string }) { return <>{message && <p className="text-sm text-emerald-600">{message}</p>}{error && <p className="text-sm text-destructive">{error}</p>}</> }
