'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, BarChart3, Bell, Bot, Check, ChevronDown, CircleHelp, CreditCard, FileText, FolderKanban, Inbox, KeyRound, LayoutDashboard, Menu, Moon, Network, Plus, Search, Settings, ShieldCheck, Sparkles, Sun, Upload, Users, Workflow, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOutAction } from '@/app/actions/auth'
import { createProjectAction, createTaskAction } from '@/app/actions/projects-tasks'
import { ProjectsView, TasksView } from '@/components/workspace/task-project-views'
import { OrgSwitcher, type OrgOption } from '@/components/workspace/org-switcher'
import { OrganizationSettings } from '@/components/workspace/organization-settings'
import { createConversationAction, deleteConversationAction, indexDocumentAction, listConversationsAction, sendMessageAction } from '@/app/actions/ai'
import AutomationsView from '@/components/workspace/automations-view'
import PlatformView from '@/components/workspace/platform-view'
import MetricsView from '@/components/workspace/metrics-view'
import BillingView from '@/components/workspace/billing-view'
import IntegrationsView from '@/components/workspace/integrations-view'
import { searchOrganizationAction } from '@/app/actions/platform'
import { deleteDocumentAction, reindexDocumentAction } from '@/app/actions/platform'

type WorkspaceUser = { id: string; name: string; email: string; avatarInitials: string; role: string; unreadCount: number }
type WorkspaceOrg = { id: string; name: string; type: string | null }

type View = 'Overview' | 'Inbox' | 'My Tasks' | 'Projects' | 'Documents' | 'AI Workspace' | 'Automations' | 'Analytics' | 'Team' | 'Integrations' | 'Billing' | 'Usage' | 'Settings' | 'API Keys' | 'Audit Logs'
type Theme = 'light' | 'dark' | 'system'
type TaskStatus = 'Todo' | 'In progress' | 'Review' | 'Done'
type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'

type Task = { id: string; title: string; description: string; project: string; projectId?: string; priority: Priority; status: TaskStatus; due: string; assignee: string; labels: string[]; estimatedMinutes?: number | null; comments?: { id: string; body: string; author: { name: string } }[]; subtasks?: { id: string; title: string; status: string }[]; activities?: { id: string; action: string; createdAt: string }[]; dependencies?: { dependsOnId: string }[] }
type Project = { id: string; name: string; description: string; status: string; priority: Priority; progress: number; startAt?: string | null; dueAt?: string | null; ownerId?: string | null; memberIds?: string[] }
type Document = { id: string; name: string; status: 'Processing' | 'Ready' | 'Failed'; size: string }

const nav = [
  { group: 'Workspace', items: [['Overview', LayoutDashboard], ['Inbox', Inbox], ['My Tasks', Check], ['Projects', FolderKanban], ['Documents', FileText], ['AI Workspace', Bot], ['Automations', Workflow], ['Analytics', BarChart3]] },
  { group: 'Organization', items: [['Team', Users], ['Integrations', Network], ['Billing', CreditCard], ['Usage', Activity]] },
  { group: 'Administration', items: [['Settings', Settings], ['API Keys', KeyRound], ['Audit Logs', ShieldCheck]] },
] as const

const searchActions: { id: string; title: string; type: string; target: View }[] = [
  { id: 'nav-overview', title: 'Overview', type: 'Navigate', target: 'Overview' },
  { id: 'create-task', title: 'Open tasks', type: 'Navigate', target: 'My Tasks' },
  { id: 'create-project', title: 'Open projects', type: 'Navigate', target: 'Projects' },
  { id: 'open-ai', title: 'Open AI Workspace', type: 'Navigate', target: 'AI Workspace' },
  { id: 'open-docs', title: 'Search Documents', type: 'Navigate', target: 'Documents' },
  { id: 'open-workflows', title: 'Open Automations', type: 'Navigate', target: 'Automations' },
  { id: 'open-analytics', title: 'Open Analytics', type: 'Navigate', target: 'Analytics' },
  { id: 'invite-member', title: 'Open team', type: 'Navigate', target: 'Team' },
  { id: 'open-settings', title: 'Open Settings', type: 'Navigate', target: 'Settings' },
]

function Logo() { return <div className="flex items-center gap-2.5 font-semibold tracking-tight"><span className="grid size-8 place-items-center rounded-lg bg-foreground text-background"><span className="relative block size-4"><span className="absolute left-0 top-0 size-2 rounded-[2px] bg-background" /><span className="absolute bottom-0 right-0 size-2 rounded-[2px] bg-background" /></span></span>Nexus<span className="text-primary">Flow</span></div> }
function Status({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted'|'green'|'orange'|'red'|'blue' }) { const styles = { muted:'bg-muted text-muted-foreground', green:'bg-emerald-500/10 text-emerald-600', orange:'bg-amber-500/10 text-amber-600', red:'bg-destructive/10 text-destructive', blue:'bg-primary/10 text-primary' }; return <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${styles[tone]}`}>{children}</span> }
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <div className={`rounded-xl border border-border bg-card p-5 shadow-sm ${className}`}>{children}</div> }
function SectionHeader({ title, description, action }: { title:string; description:string; action?: React.ReactNode }) { return <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div> }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-[60] grid place-items-center bg-background/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}><div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl"><div className="flex items-center justify-between"><h2 className="font-semibold">{title}</h2><button onClick={onClose} aria-label="Close dialog" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>{children}</div></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1.5 text-xs font-medium">{label}{children}</label> }
function inputClass() { return 'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring' }

function Sidebar({ view, setView, open, close, setTheme, user, organization, organizations }: { view:View; setView:(v:View)=>void; open:boolean; close:()=>void; setTheme:(t:Theme)=>void; user:WorkspaceUser; organization:WorkspaceOrg; organizations:OrgOption[] }) {
  return <aside className={`${open ? 'fixed inset-y-0 left-0 z-50 flex w-72' : 'hidden'} w-64 shrink-0 flex-col border-r border-border bg-card lg:flex`}>
    <div className="flex h-16 items-center justify-between border-b border-border px-5"><Logo /><button className="lg:hidden" onClick={close} aria-label="Close navigation"><X className="size-4" /></button></div>
    <div className="border-b border-border p-3"><OrgSwitcher organization={organization} organizations={organizations} /></div>
    <nav className="flex-1 overflow-y-auto px-3 py-4">{nav.map(section => <div key={section.group} className="mb-5"><p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{section.group}</p><div className="flex flex-col gap-0.5">{section.items.map(([label, Icon]) => <button key={label} onClick={() => { setView(label as View); close() }} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring ${view === label ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon className="size-4" />{label}{label === 'Inbox' && user.unreadCount > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">{user.unreadCount}</span>}</button>)}</div></div>)}</nav>
    <div className="border-t border-border p-3"><button onClick={() => setView('Settings')} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted"><span className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{user.avatarInitials}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{user.name}</span><span className="block text-[10px] text-muted-foreground">{user.role}</span></span><ChevronDown className="size-3.5 text-muted-foreground" /></button><div className="mt-2 flex gap-1"><button onClick={() => setTheme('light')} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Light theme"><Sun className="size-3.5" /></button><button onClick={() => setTheme('dark')} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Dark theme"><Moon className="size-3.5" /></button><button onClick={() => setTheme('system')} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="System theme"><CircleHelp className="size-3.5" /></button></div><button type="button" onClick={() => void signOutAction()} className="mt-2 w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted">Sign out</button></div>
  </aside>
}
function Header({ view, organization, unreadCount, onSearch, onMenu, onNotifications }: { view: View; organization: WorkspaceOrg; unreadCount: number; onSearch: () => void; onMenu: () => void; onNotifications: () => void }) {
  return <header className="flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6">
    <button className="lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu className="size-5" /></button>
    <div className="flex-1"><h1 className="text-sm font-semibold">{view}</h1><p className="hidden text-xs text-muted-foreground sm:block">{organization.name} · {organization.type || 'Business workspace'}</p></div>
    <button onClick={onSearch} className="hidden h-9 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-xs text-muted-foreground sm:flex"><Search className="size-3.5" />Search<span className="ml-4 rounded border border-border px-1.5 py-0.5 text-[10px]">⌘ K</span></button>
    <button onClick={onNotifications} className="relative rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={unreadCount ? `${unreadCount} unread notifications` : 'Notifications'}>
      <Bell className="size-4" />
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
  </header>
}

function Overview({ setView, tasks, projects, user, organization }: { setView:(v:View)=>void; tasks:Task[]; projects:Project[]; user:WorkspaceUser; organization:WorkspaceOrg }) {
  const activeProjects = projects.filter(project => project.status === 'Active').length
  const completedTasks = tasks.filter(task => task.status === 'Done').length
  const overdueTasks = tasks.filter(task => task.due !== 'No due date' && task.due < new Date().toISOString().slice(0, 10) && task.status !== 'Done').length
  return <div className="flex flex-col gap-6">
    <SectionHeader title={`Good morning, ${user.name.split(' ')[0]}.`} description={`Here's what's happening across ${organization.name}.`} action={<Button onClick={() => setView('Projects')}><Plus data-icon="inline-start" />New project</Button>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Card><p className="text-xs text-muted-foreground">Active projects</p><p className="mt-3 text-2xl font-semibold">{activeProjects}</p></Card>
      <Card><p className="text-xs text-muted-foreground">Tasks completed</p><p className="mt-3 text-2xl font-semibold">{completedTasks}</p></Card>
      <Card><p className="text-xs text-muted-foreground">Overdue tasks</p><p className="mt-3 text-2xl font-semibold">{overdueTasks}</p></Card>
    </div>
    <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
      <Card><div className="flex items-start justify-between"><div><h3 className="font-semibold">My work</h3><p className="mt-1 text-xs text-muted-foreground">Your highest priority tasks</p></div><button onClick={() => setView('My Tasks')} className="text-xs font-medium text-primary">View all</button></div>
        <div className="mt-5 flex flex-col gap-2">{tasks.slice(0,3).map(task => <div key={task.id} className="flex items-center gap-3 rounded-lg border border-border/70 p-3"><span className={`size-2 shrink-0 rounded-full ${task.priority === 'High' || task.priority === 'Urgent' ? 'bg-destructive' : 'bg-amber-500'}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{task.title}</span><span className="mt-1 block text-[11px] text-muted-foreground">{task.project}</span></span><Status tone={task.due === 'Overdue' ? 'red' : 'muted'}>{task.due}</Status><span className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-medium">{task.assignee}</span></div>)}</div>
      </Card>
      <Card className="border-primary/20 bg-primary/[.04]"><div className="flex items-center gap-2 text-primary"><Sparkles className="size-4" /><h3 className="font-semibold">Task overview</h3></div><p className="mt-4 text-sm leading-6 text-foreground/80">{overdueTasks ? `${overdueTasks} task${overdueTasks === 1 ? '' : 's'} need attention because they are overdue.` : 'No overdue tasks in the currently loaded workspace tasks.'}</p><div className="mt-5 flex gap-2"><Button size="sm" onClick={() => setView('My Tasks')}>Review tasks</Button><Button size="sm" variant="outline" onClick={() => setView('Analytics')}>View analytics</Button></div></Card>
    </div>
  </div>
}

function DocumentsView({ documents, setDocuments, notify }: { documents:Document[]; setDocuments:React.Dispatch<React.SetStateAction<Document[]>>; notify:(message:string)=>void }) {
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const add = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    setError('')
    setBusy(true)
    try {
    let doc: { id:string; name:string; status:string }
    if (file) {
      const form = new FormData()
      form.set('file', file)
      const response = await fetch('/api/documents/upload', { method: 'POST', body: form })
      const result = await response.json() as { id?:string; name?:string; status?:string; error?:string }
      if (!response.ok || !result.id || !result.name || !result.status) {
        setBusy(false)
        setError(result.error ?? 'Unable to upload and index this document.')
        return
      }
      doc = result as { id:string; name:string; status:string }
    } else {
      const result = await indexDocumentAction({ name, content })
      if ('error' in result) { setBusy(false); setError(result.error); return }
      doc = result.data as { id:string; name:string; status:string }
    }
    const size = file?.size ?? content.length
    setDocuments(items => [{ id:doc.id, name:doc.name, status:doc.status==='READY'?'Ready':doc.status==='FAILED'?'Failed':'Processing', size:`${Math.ceil(size/1024)} KB` }, ...items])
    setName('')
    setContent('')
    setFile(null)
    formElement.reset()
    notify('Document indexed and ready for AI')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to upload and index this document.')
    } finally {
      setBusy(false)
    }
  }
  const visible = documents.filter(document => document.name.toLowerCase().includes(query.toLowerCase()))
  return <div className="flex flex-col gap-6">
    <SectionHeader title="Documents" description="Your team's source of truth, indexed and ready for AI." />
    <Card>
      <form onSubmit={event => void add(event)} className="grid gap-3">
        <input required maxLength={255} value={name} onChange={event=>setName(event.target.value)} placeholder="Document name" className={inputClass()} />
        <input type="file" accept=".txt,.md,.markdown,.csv,.json,.xml,.html,.log,text/plain,text/markdown,text/csv,application/json" onChange={event=>{const selected=event.target.files?.[0]??null;setFile(selected);if(selected&&!name)setName(selected.name)}} className={inputClass()} />
        <textarea required={!file} disabled={Boolean(file)} maxLength={2_000_000} value={content} onChange={event=>setContent(event.target.value)} placeholder="Or paste document text to index" rows={4} className={inputClass()} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || !name.trim() || !content.trim()}><Upload data-icon="inline-start" />{busy?'Indexing…':'Index document'}</Button>
      </form>
    </Card>
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2"><Search className="size-3.5 text-muted-foreground" /><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search documents" className="w-full bg-transparent text-xs outline-none" /></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {visible.map(document=><Card key={document.id}>
        <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="size-5" /></span>
        <h3 className="mt-5 truncate text-sm font-medium">{document.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">Organization document · {document.size}</p>
        <div className="mt-5 flex items-center justify-between"><Status tone={document.status==='Ready'?'green':document.status==='Failed'?'red':'orange'}>{document.status}</Status><span className="text-[10px] text-muted-foreground">{document.status==='Ready'?'Searchable':'Not searchable'}</span></div>
        <div className="mt-4 flex gap-3 text-xs">
          <button disabled={busy} onClick={async()=>{setBusy(true);const result=await reindexDocumentAction({id:document.id});setBusy(false);if('error' in result){notify(result.error);return};setDocuments(items=>items.map(item=>item.id===document.id?{...item,status:'Ready'}:item));notify('Document re-indexed')}} className="text-primary disabled:opacity-50">Re-index</button>
          {deleteId === document.id
            ? <><span className="text-muted-foreground">Delete?</span><button disabled={busy} onClick={async()=>{setBusy(true);const result=await deleteDocumentAction({id:document.id});setBusy(false);if('error' in result){notify(result.error);return};setDocuments(items=>items.filter(item=>item.id!==document.id));setDeleteId(null);notify('Document deleted')}} className="text-destructive disabled:opacity-50">Confirm</button><button onClick={()=>setDeleteId(null)} className="text-muted-foreground">Cancel</button></>
            : <button disabled={busy} onClick={()=>setDeleteId(document.id)} className="text-destructive disabled:opacity-50">Delete</button>}
        </div>
      </Card>)}
      {visible.length===0&&<Card className="sm:col-span-2 xl:col-span-4 text-center"><p className="font-medium">No documents found</p><p className="mt-1 text-sm text-muted-foreground">Index your first knowledge document.</p></Card>}
    </div>
  </div>
}
function AIView({ notify }: { notify: (message: string) => void }) {
  type Message = { role: 'user' | 'assistant'; text: string }
  type Conversation = { id: string; title: string; messages: { role: string; content: string }[] }
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const selected = conversations.find((conversation) => conversation.id === selectedId)

  useEffect(() => {
    void listConversationsAction().then((result) => {
      if ('error' in result) { notify(result.error); return }
      const items = result.data as Conversation[]
      setConversations(items)
      if (items[0]) {
        setSelectedId(items[0].id)
        setMessages(items[0].messages.map((message) => ({ role: message.role as Message['role'], text: message.content })))
      }
    }).catch(() => notify('Unable to load AI conversations.'))
  }, [notify])

  const select = (conversation: Conversation) => {
    setSelectedId(conversation.id)
    setMessages(conversation.messages.map((message) => ({ role: message.role as Message['role'], text: message.content })))
  }
  const create = async () => {
    try {
      const result = await createConversationAction({ title: 'New conversation' })
      if ('error' in result) { notify(result.error); return }
      const conversation = result.data as Conversation
      setConversations((items) => [conversation, ...items])
      setSelectedId(conversation.id)
      setMessages([])
    } catch {
      notify('Unable to create a conversation.')
    }
  }
  const remove = async () => {
    if (!selectedId) return
    setLoading(true)
    try {
      const result = await deleteConversationAction({ conversationId: selectedId })
      if ('error' in result) { notify(result.error); return }
      const remaining = conversations.filter((conversation) => conversation.id !== selectedId)
      setConversations(remaining)
      setConfirmDelete(false)
      if (remaining[0]) select(remaining[0])
      else { setSelectedId(null); setMessages([]) }
      notify('Conversation deleted.')
    } catch {
      notify('Unable to delete this conversation.')
    } finally {
      setLoading(false)
    }
  }
  const send = async (text = prompt) => {
    if (!text.trim() || loading) return
    const value = text.trim()
    setPrompt('')
    setMessages((items) => [...items, { role: 'user', text: value }])
    setLoading(true)
    try {
      const result = await sendMessageAction({ conversationId: selectedId ?? undefined, content: value })
      if ('error' in result) { notify(result.error); return }
      const data = result.data as { conversationId: string; assistant: { content: string } }
      if (!selectedId) {
        const refreshed = await listConversationsAction()
        if ('ok' in refreshed) {
          const items = refreshed.data as Conversation[]
          setConversations(items)
          setSelectedId(data.conversationId)
        }
      }
      setMessages((items) => [...items, { role: 'assistant', text: data.assistant.content }])
    } catch {
      notify('Unable to send your message. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="grid min-h-[calc(100vh-9rem)] gap-4 xl:grid-cols-[220px_1fr_240px]">
    {confirmDelete && <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-conversation-title">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
        <h3 id="delete-conversation-title" className="font-semibold">Delete this conversation?</h3>
        <p className="mt-2 text-sm text-muted-foreground">This permanently removes the conversation and its messages.</p>
        <div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={loading} onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="destructive" disabled={loading} onClick={() => void remove()}>{loading ? 'Deleting…' : 'Delete conversation'}</Button></div>
      </div>
    </div>}
    <aside className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between"><h3 className="text-xs font-semibold">Conversations</h3><button onClick={() => void create()} aria-label="New conversation" className="text-primary"><Plus className="size-4" /></button></div>
      <div className="mt-4 flex max-h-[520px] flex-col gap-1 overflow-y-auto">
        {conversations.map((conversation) => <button key={conversation.id} onClick={() => select(conversation)} className={`rounded-md px-2 py-2 text-left text-xs font-medium ${conversation.id === selectedId ? 'bg-muted' : 'hover:bg-muted/60'}`}>{conversation.title}<span className="mt-1 block text-[10px] text-muted-foreground">{conversation.messages.length} messages</span></button>)}
        {!conversations.length && <p className="text-xs text-muted-foreground">No conversations yet.</p>}
      </div>
      {selected && <button onClick={() => setConfirmDelete(true)} className="mt-4 text-xs text-destructive">Delete conversation</button>}
    </aside>
    <section className="flex min-h-[560px] flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary"><Bot className="size-4" /></span><div><h3 className="text-sm font-semibold">{selected?.title ?? 'Nexus AI'}</h3><p className="text-[10px] text-emerald-600">Organization RAG · OpenAI</p></div></div></div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'ml-auto max-w-[80%] rounded-xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground' : 'max-w-[90%]'}>{message.role === 'assistant' && <div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="size-3.5 text-primary" />Nexus AI</div>}<p className={message.role === 'assistant' ? 'mt-3 text-sm leading-6 text-foreground/85' : ''}>{message.text}</p></div>)}
        {loading && <div role="status" className="text-xs text-muted-foreground">Nexus AI is thinking...</div>}
      </div>
      <div className="border-t border-border p-4"><form onSubmit={(event) => { event.preventDefault(); void send() }} className="flex items-end gap-2"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask about your organization…" rows={2} className="min-h-10 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /><Button disabled={loading}>Send</Button></form></div>
    </section>
    <Card><h3 className="text-xs font-semibold">AI safeguards</h3><p className="mt-3 text-xs leading-5 text-muted-foreground">Responses use only documents indexed in your current organization. Document access is enforced server-side.</p></Card>
  </div>
}
function GenericView({ view, notify, setTheme: _setTheme, organization }: { view:View; notify:(message:string)=>void; setTheme:(t:Theme)=>void; organization?:WorkspaceOrg }) {
  if (view === 'Analytics' || view === 'Usage') return <MetricsView view={view} />
  if (view === 'Billing') return <BillingView />
  if (view === 'Integrations') return <IntegrationsView />
  const title = view
  const descriptions: Partial<Record<View, string>> = {
    Settings: 'Configure organization details, account security, and active sessions.',
  }
  return <div className="flex flex-col gap-6">
    <SectionHeader title={title} description={descriptions[view] ?? `${title} for this organization.`} />
    {view === 'Settings' && organization
      ? <Card><OrganizationSettings organization={organization} onSaved={notify} /></Card>
      : <Card><p className="text-sm text-muted-foreground">{descriptions[view] ?? 'This feature is not available.'}</p></Card>}
  </div>
}

function SearchPalette({ onClose, setView, tasks, projects }: { onClose:()=>void; setView:(v:View)=>void; tasks:Task[]; projects:Project[] }) {
  type Result = { id: string; title: string; type: string; target: View }
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState(0)
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      const local: Result[] = [
        ...searchActions.filter(item => item.title.toLowerCase().includes(term.toLowerCase())),
        ...tasks.filter(task => task.title.toLowerCase().includes(term.toLowerCase())).map(task => ({ id: task.id, title: task.title, type: 'Task', target: 'My Tasks' as View })),
        ...projects.filter(project => project.name.toLowerCase().includes(term.toLowerCase())).map(project => ({ id: project.id, title: project.name, type: 'Project', target: 'Projects' as View })),
      ]
      setResults(local)
      setActive(0)
      return
    }
    let activeRequest = true
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      const response = await searchOrganizationAction({ query: term })
      if (!activeRequest) return
      setLoading(false)
      if ('error' in response) {
        setError(response.error)
        setResults([])
        return
      }
      const data = response.data as {
        projects: { id: string; name: string }[]
        tasks: { id: string; title: string }[]
        documents: { id: string; name: string }[]
        members: { id: string; name: string; email: string }[]
        workflows: { id: string; name: string }[]
        conversations: { id: string; title: string }[]
      }
      setResults([
        ...searchActions.filter(item => item.title.toLowerCase().includes(term.toLowerCase())),
        ...data.projects.map(item => ({ id: item.id, title: item.name, type: 'Project', target: 'Projects' as View })),
        ...data.tasks.map(item => ({ id: item.id, title: item.title, type: 'Task', target: 'My Tasks' as View })),
        ...data.documents.map(item => ({ id: item.id, title: item.name, type: 'Document', target: 'Documents' as View })),
        ...data.members.map(item => ({ id: item.id, title: `${item.name} (${item.email})`, type: 'Member', target: 'Team' as View })),
        ...data.workflows.map(item => ({ id: item.id, title: item.name, type: 'Workflow', target: 'Automations' as View })),
        ...data.conversations.map(item => ({ id: item.id, title: item.title, type: 'Conversation', target: 'AI Workspace' as View })),
      ])
      setActive(0)
    }, 275)
    return () => { activeRequest = false; clearTimeout(timer) }
  }, [query, tasks, projects])
  const choose = (result: Result) => { setView(result.target); onClose() }
  return <Modal title="Search or jump to..." onClose={onClose}>
    <div className="mt-4 flex items-center gap-2 rounded-md border border-border px-3 py-2">
      <Search className="size-4 text-muted-foreground" />
      <input autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(index + 1, results.length - 1)) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
        if (event.key === 'Enter' && results[active]) { event.preventDefault(); choose(results[active]) }
      }} placeholder="Search pages, actions, tasks..." className="w-full bg-transparent text-sm outline-none" />
    </div>
    {loading && <p className="mt-2 text-xs text-muted-foreground" role="status">Searching organization…</p>}
    {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
    <div className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
      {results.map((result, index) => <button key={`${result.type}-${result.id}`} onClick={() => choose(result)} className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm ${index === active ? 'bg-muted' : 'hover:bg-muted'}`}>
        <span className="truncate">{result.title}</span><span className="ml-2 text-[10px] text-muted-foreground">{result.type}</span>
      </button>)}
      {!loading && !error && results.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">No results found.</p>}
    </div>
  </Modal>
}

export default function WorkspaceApp({ user, organization, organizations, initialProjects = [], initialTasks = [], initialDocuments = [], initialWorkflows = [], initialMembers = [], initialNotifications = [] }: {
  user: WorkspaceUser
  organization: WorkspaceOrg
  organizations: OrgOption[]
  initialProjects?: Project[]
  initialTasks?: Task[]
  initialDocuments?: Document[]
  initialWorkflows?: {
    id: string
    name: string
    description: string
    status: string
    schedule: string
    scheduleTime?: string | null
    scheduleDay?: number | null
    definition: { trigger: string; conditions: { field: string; operator: string; value?: string }[]; actions: { type: string; title?: string; body?: string; projectId?: string; taskId?: string }[] }
    _count: { executions: number }
  }[]
  initialMembers?: { id: string; role: string; user: { id: string; name: string; email: string; avatarInitials: string | null } }[]
  initialNotifications?: { id: string; title: string; body: string; readAt: string | null; createdAt: string }[]
}) {
  const [view, setView] = useState<View>('Overview')
  const [theme, setTheme] = useState<Theme>('system')
  const [unreadCount, setUnreadCount] = useState(user.unreadCount)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const [toast, setToast] = useState('')
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [modal, setModal] = useState<'task' | 'project' | null>(null)
  const notify = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(''), 2200)
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem('nexus-theme') as Theme | null
    if (saved) setTheme(saved)
  }, [])
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const resolved = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme
      root.classList.remove('light', 'dark')
      root.classList.add(resolved)
      root.style.colorScheme = resolved
      window.localStorage.setItem('nexus-theme', theme)
    }
    apply()
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(true) }
      if (event.key === 'Escape') { setPalette(false); setModal(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const content = view === 'Overview'
    ? <Overview setView={setView} tasks={tasks} projects={projects} user={user} organization={organization} />
    : view === 'My Tasks'
      ? <TasksView tasks={tasks} setTasks={setTasks} notify={notify} openCreate={() => setModal('task')} />
      : view === 'Projects'
        ? <ProjectsView projects={projects} setProjects={setProjects} openCreate={() => setModal('project')} notify={notify} />
        : view === 'Documents'
          ? <DocumentsView documents={documents} setDocuments={setDocuments} notify={notify} />
          : view === 'AI Workspace'
            ? <AIView notify={notify} />
            : view === 'Automations'
              ? <AutomationsView initialWorkflows={initialWorkflows} />
              : view === 'Team'
                ? <PlatformView kind="Team" initialMembers={initialMembers} />
                : view === 'Inbox'
                  ? <PlatformView kind="Inbox" initialNotifications={initialNotifications} onUnreadCountChange={setUnreadCount} />
                  : view === 'API Keys'
                    ? <PlatformView kind="API Keys" />
                    : view === 'Audit Logs'
                      ? <PlatformView kind="Audit Logs" />
                      : <GenericView view={view} notify={notify} setTheme={setTheme} organization={organization} />

  return <div className="flex min-h-screen bg-background text-foreground">
    <Sidebar view={view} setView={setView} open={mobileOpen} close={() => setMobileOpen(false)} setTheme={setTheme} user={user} organization={organization} organizations={organizations} />
    <div className="flex min-w-0 flex-1 flex-col">
      <Header view={view} organization={organization} unreadCount={unreadCount} onSearch={() => setPalette(true)} onMenu={() => setMobileOpen(true)} onNotifications={() => setView('Inbox')} />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait"><motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}>{content}</motion.div></AnimatePresence>
      </main>
    </div>
    {palette && <SearchPalette onClose={() => setPalette(false)} setView={setView} tasks={tasks} projects={projects} />}
    {modal === 'project' && <Modal title="Create project" onClose={() => setModal(null)}>
      <ProjectForm onClose={() => setModal(null)} onCreate={async (projectInput) => {
        const result = await createProjectAction({ name: projectInput.name, description: projectInput.description, priority: projectInput.priority.toUpperCase(), status: 'PLANNING', startAt: projectInput.startAt, dueAt: projectInput.dueAt })
        if ('error' in result) { notify(result.error); return }
        const created = result.data as { id: string }
        setProjects((items) => [{ ...projectInput, id: created.id, progress: 0 }, ...items])
        setModal(null)
        notify('Project created successfully.')
      }} />
    </Modal>}
    {modal === 'task' && <Modal title="Create task" onClose={() => setModal(null)}>
      <TaskForm projects={projects} onClose={() => setModal(null)} onCreate={async (taskInput) => {
        const project = projects.find((item) => item.name === taskInput.project)
        if (!project) { notify('Create a project first.'); return }
        const result = await createTaskAction({
          projectId: project.id,
          title: taskInput.title,
          description: taskInput.description,
          priority: taskInput.priority.toUpperCase(),
          labels: taskInput.labels,
          estimatedMinutes: taskInput.estimatedMinutes,
          dueAt: taskInput.due === 'No due date' ? null : taskInput.due,
        })
        if ('error' in result) { notify(result.error); return }
        setTasks((items) => [{ ...taskInput, id: (result.data as { id: string }).id, projectId: project.id }, ...items])
        setModal(null)
        notify('Task created successfully.')
      }} />
    </Modal>}
    {toast && <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg" role="status">{toast}</div>}
  </div>
}

function ProjectForm({ onClose, onCreate }: { onClose:()=>void; onCreate:(p:Omit<Project,'id'|'progress'>)=>void }) {
 const [name,setName]=useState(''); const [description,setDescription]=useState(''); const [priority,setPriority]=useState<Priority>('Medium'); const [ownerId,setOwnerId]=useState(''); const [memberIds,setMemberIds]=useState(''); const [startAt,setStartAt]=useState(''); const [dueAt,setDueAt]=useState(''); const [error,setError]=useState('');
 return <form className="mt-5 flex flex-col gap-4" onSubmit={e=>{e.preventDefault();if(name.trim().length<3){setError('Project name must be at least 3 characters.');return}onCreate({name:name.trim(),description:description.trim()||'New workspace project',status:'Planning',priority,startAt:startAt||null,dueAt:dueAt||null,ownerId:ownerId||null,memberIds:memberIds.split(',').map(x=>x.trim()).filter(Boolean)})}}><Field label="Project name"><input autoFocus value={name} onChange={e=>setName(e.target.value)} className={inputClass()} placeholder="e.g. Customer portal" /></Field><Field label="Description"><textarea value={description} onChange={e=>setDescription(e.target.value)} className={inputClass()} rows={3} placeholder="What is this project about?" /></Field><Field label="Priority"><select value={priority} onChange={e=>setPriority(e.target.value as Priority)} className={inputClass()}>{['Low','Medium','High','Urgent'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Owner user ID"><input value={ownerId} onChange={e=>setOwnerId(e.target.value)} className={inputClass()} placeholder="UUID (defaults to you)" /></Field><Field label="Member user IDs (comma separated)"><input value={memberIds} onChange={e=>setMemberIds(e.target.value)} className={inputClass()} placeholder="UUIDs" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Start date"><input type="date" value={startAt} onChange={e=>setStartAt(e.target.value)} className={inputClass()} /></Field><Field label="Due date"><input type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)} className={inputClass()} /></Field></div>{error&&<p className="text-xs text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create project</Button></div></form>
}
function TaskForm({ projects, onClose, onCreate }: { projects:Project[]; onClose:()=>void; onCreate:(t:Omit<Task,'id'>)=>void }) {
 const [title,setTitle]=useState(''); const [description,setDescription]=useState(''); const [project,setProject]=useState(projects[0]?.name||''); const [priority,setPriority]=useState<Priority>('Medium'); const [dueAt,setDueAt]=useState(''); const [estimatedMinutes,setEstimatedMinutes]=useState(''); const [labels,setLabels]=useState(''); const [error,setError]=useState('');
 return <form className="mt-5 flex flex-col gap-4" onSubmit={e=>{e.preventDefault();if(title.trim().length<3){setError('Task title must be at least 3 characters.');return}onCreate({title:title.trim(),description:description.trim()||'New task',project,priority,status:'Todo',due:dueAt||'No due date',assignee:'AM',labels:labels.split(',').map(x=>x.trim()).filter(Boolean),estimatedMinutes:estimatedMinutes?Number(estimatedMinutes):null})}}><Field label="Title"><input autoFocus value={title} onChange={e=>setTitle(e.target.value)} className={inputClass()} placeholder="e.g. Review launch checklist" /></Field><Field label="Description"><textarea value={description} onChange={e=>setDescription(e.target.value)} className={inputClass()} rows={3} placeholder="Add context for your team" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Project"><select value={project} onChange={e=>setProject(e.target.value)} className={inputClass()}>{projects.map(p=><option key={p.id}>{p.name}</option>)}</select></Field><Field label="Priority"><select value={priority} onChange={e=>setPriority(e.target.value as Priority)} className={inputClass()}>{['Low','Medium','High','Urgent'].map(x=><option key={x}>{x}</option>)}</select></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Due date"><input type="date" value={dueAt} onChange={e=>setDueAt(e.target.value)} className={inputClass()} /></Field><Field label="Estimated minutes"><input type="number" min="0" value={estimatedMinutes} onChange={e=>setEstimatedMinutes(e.target.value)} className={inputClass()} /></Field></div><Field label="Labels (comma separated)"><input value={labels} onChange={e=>setLabels(e.target.value)} className={inputClass()} placeholder="backend, blocked" /></Field>{error&&<p className="text-xs text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create task</Button></div></form>
}
