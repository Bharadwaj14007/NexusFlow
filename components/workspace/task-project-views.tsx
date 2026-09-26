'use client'

import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  addTaskCommentAction,
  addTaskDependencyAction,
  archiveProjectAction,
  archiveTaskAction,
  completeSubtaskAction,
  createSubtaskAction,
  deleteProjectAction,
  deleteSubtaskAction,
  deleteTaskAction,
  deleteTaskCommentAction,
  duplicateTaskAction,
  removeTaskDependencyAction,
  updateProjectAction,
  updateTaskAction,
  updateTaskCommentAction,
} from '@/app/actions/projects-tasks'

export type WorkspaceTaskStatus = 'Todo' | 'In progress' | 'Review' | 'Done'
export type WorkspacePriority = 'Low' | 'Medium' | 'High' | 'Urgent'

export type WorkspaceTask = {
  id: string
  title: string
  description: string
  project: string
  projectId?: string
  priority: WorkspacePriority
  status: WorkspaceTaskStatus
  due: string
  assignee: string
  labels: string[]
  estimatedMinutes?: number | null
  comments?: { id: string; body: string; author: { name: string } }[]
  subtasks?: { id: string; title: string; status: string }[]
  activities?: { id: string; action: string; createdAt: string }[]
  dependencies?: { dependsOnId: string }[]
}

export type WorkspaceProject = {
  id: string
  name: string
  description: string
  status: string
  priority: WorkspacePriority
  progress: number
  startAt?: string | null
  dueAt?: string | null
  ownerId?: string | null
  memberIds?: string[]
}

type SharedViewProps = {
  openCreate: () => void
  notify: (message: string) => void
}

export type TasksViewProps = SharedViewProps & {
  tasks: WorkspaceTask[]
  setTasks: Dispatch<SetStateAction<WorkspaceTask[]>>
}
export type ProjectsViewProps = SharedViewProps & {
  projects: WorkspaceProject[]
  setProjects: Dispatch<SetStateAction<WorkspaceProject[]>>
}

const inputClass = 'rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Status({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'green' | 'orange' | 'red' | 'blue' }) {
  const styles = {
    muted: 'bg-muted text-muted-foreground',
    green: 'bg-emerald-500/10 text-emerald-600',
    orange: 'bg-amber-500/10 text-amber-600',
    red: 'bg-destructive/10 text-destructive',
    blue: 'bg-primary/10 text-primary',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${styles[tone]}`}>{children}</span>
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-border bg-card p-5 shadow-sm ${className}`}>{children}</div>
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 className="text-2xl font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div>
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`my-auto w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-xl border border-border bg-card p-5 shadow-xl`}>
      <div className="flex items-center justify-between"><h2 className="font-semibold">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button></div>
      {children}
    </div>
  </div>
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border px-3 py-2"><Search className="size-3.5 text-muted-foreground" /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-xs outline-none" /></div>
}

function ConfirmDialog({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) {
  return <Modal title={title} onClose={onCancel}><p className="mt-4 text-sm text-muted-foreground">This action cannot be undone.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button variant="destructive" onClick={onConfirm}>Confirm</Button></div></Modal>
}

function TaskDetails({ task, tasks, setTasks, notify, onClose }: { task: WorkspaceTask; tasks: WorkspaceTask[]; setTasks: TasksViewProps['setTasks']; notify: TasksViewProps['notify']; onClose: () => void }) {
  const [subtaskTitle, setSubtaskTitle] = useState('')
  const [commentBody, setCommentBody] = useState('')
  const [dependencyId, setDependencyId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [commentEdit, setCommentEdit] = useState<{ id: string; body: string } | null>(null)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const refreshTask = (patch: Partial<WorkspaceTask>) => {
    setTasks(items => items.map(item => item.id === task.id ? { ...item, ...patch } : item))
  }
  const submit = async (event: FormEvent<HTMLFormElement>, action: () => Promise<void>) => {
    event.preventDefault()
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }

  return <Modal title={task.title} onClose={onClose} wide>
    <div className="mt-4 flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{task.description || 'No description provided.'}</p>
      <div className="grid grid-cols-2 gap-3 text-xs"><div><span className="text-muted-foreground">Project</span><p className="font-medium">{task.project}</p></div><div><span className="text-muted-foreground">Assignee</span><p className="font-medium">{task.assignee || 'Unassigned'}</p></div><div><span className="text-muted-foreground">Priority</span><p className="font-medium">{task.priority}</p></div><div><span className="text-muted-foreground">Status</span><p className="font-medium">{task.status}</p></div></div>

      <section>
        <h3 className="text-xs font-semibold">Subtasks</h3>
        {(task.subtasks ?? []).map(subtask => <div key={subtask.id} className="mt-2 flex items-center gap-2 text-xs"><span className={subtask.status === 'DONE' ? 'text-emerald-600' : 'text-muted-foreground'}>{subtask.status === 'DONE' ? '✓' : '○'}</span><span>{subtask.title}</span><button type="button" className="ml-auto text-primary" onClick={async () => {
          const result = await completeSubtaskAction({ id: subtask.id })
          if ('error' in result) { notify(result.error); return }
          const status = subtask.status === 'DONE' ? 'TODO' : 'DONE'
          refreshTask({ subtasks: (task.subtasks ?? []).map(item => item.id === subtask.id ? { ...item, status } : item) })
          notify(status === 'DONE' ? 'Subtask completed' : 'Subtask reopened')
        }}>{subtask.status === 'DONE' ? 'Reopen' : 'Complete'}</button><button type="button" className="text-destructive" onClick={async () => {
          const result = await deleteSubtaskAction({ id: subtask.id })
          if ('error' in result) { notify(result.error); return }
          refreshTask({ subtasks: (task.subtasks ?? []).filter(item => item.id !== subtask.id) })
          notify('Subtask deleted')
        }}>Delete</button></div>)}
        {!(task.subtasks ?? []).length && <p className="mt-1 text-xs text-muted-foreground">No subtasks.</p>}
        <form className="mt-2 flex gap-2" onSubmit={event => submit(event, async () => {
          const title = subtaskTitle.trim()
          if (!title || !task.projectId) { if (!task.projectId) notify('A project is required to add a subtask.'); return }
          const result = await createSubtaskAction({ parentId: task.id, projectId: task.projectId, title })
          if ('error' in result) { notify(result.error); return }
          refreshTask({ subtasks: [...(task.subtasks ?? []), result.data as NonNullable<WorkspaceTask['subtasks']>[number]] })
          setSubtaskTitle('')
          notify('Subtask added')
        })}><input value={subtaskTitle} onChange={event => setSubtaskTitle(event.target.value)} className={`${inputClass} flex-1`} placeholder="Add subtask" /><Button size="sm" disabled={busy}>Add</Button></form>
      </section>

      <section>
        <h3 className="text-xs font-semibold">Dependencies</h3><p className="mt-1 text-xs text-muted-foreground">{(task.dependencies ?? []).length} dependency links</p>
        <form className="mt-2 flex gap-2" onSubmit={event => submit(event, async () => {
          if (!dependencyId) return
          const result = await addTaskDependencyAction({ taskId: task.id, dependsOnId: dependencyId })
          if ('error' in result) { notify(result.error); return }
          refreshTask({ dependencies: [...(task.dependencies ?? []), { dependsOnId: dependencyId }] })
          setDependencyId('')
          notify('Dependency added')
        })}>
          <select value={dependencyId} onChange={event => setDependencyId(event.target.value)} className={`${inputClass} min-w-0 flex-1`}><option value="">Add dependency…</option>{tasks.filter(item => item.id !== task.id && !(task.dependencies ?? []).some(dependency => dependency.dependsOnId === item.id)).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Button size="sm" variant="outline" disabled={!dependencyId || busy}>Add</Button>
        </form>
        {(task.dependencies ?? []).map(dependency => <div key={dependency.dependsOnId} className="mt-2 flex items-center text-xs"><span>{tasks.find(item => item.id === dependency.dependsOnId)?.title ?? dependency.dependsOnId.slice(0, 8)}</span><button type="button" className="ml-auto text-destructive" onClick={async () => {
          const result = await removeTaskDependencyAction({ taskId: task.id, dependsOnId: dependency.dependsOnId })
          if ('error' in result) { notify(result.error); return }
          refreshTask({ dependencies: (task.dependencies ?? []).filter(item => item.dependsOnId !== dependency.dependsOnId) })
          notify('Dependency removed')
        }}>Remove</button></div>)}
      </section>

      <section>
        <h3 className="text-xs font-semibold">Comments</h3>
        {(task.comments ?? []).map(comment => <p key={comment.id} className="mt-2 rounded bg-muted p-2 text-xs"><b>{comment.author.name}</b>: {comment.body}<button type="button" className="ml-2 text-primary" onClick={() => setCommentEdit(comment)}>Edit</button><button type="button" className="ml-2 text-destructive" onClick={async () => {
          const result = await deleteTaskCommentAction({ id: comment.id, taskId: task.id })
          if ('error' in result) { notify(result.error); return }
          refreshTask({ comments: (task.comments ?? []).filter(item => item.id !== comment.id) })
          notify('Comment deleted')
        }}>Delete</button></p>)}
        <form className="mt-2 flex gap-2" onSubmit={event => submit(event, async () => {
          const body = commentBody.trim()
          if (!body) return
          const result = await addTaskCommentAction({ taskId: task.id, body })
          if ('error' in result) { notify(result.error); return }
          refreshTask({ comments: [...(task.comments ?? []), result.data as NonNullable<WorkspaceTask['comments']>[number]] })
          setCommentBody('')
          notify('Comment added')
        })}><input value={commentBody} onChange={event => setCommentBody(event.target.value)} className={`${inputClass} flex-1`} placeholder="Add a comment" /><Button size="sm" disabled={busy}>Add</Button></form>
      </section>

      <section><h3 className="text-xs font-semibold">Activity</h3>{(task.activities ?? []).slice(0, 5).map(activity => <p key={activity.id} className="mt-1 text-xs text-muted-foreground">{activity.action}</p>)}</section>
      <div className="flex flex-wrap justify-end gap-2">
        <form className="flex gap-2" onSubmit={event => submit(event, async () => {
          const id = assigneeId.trim()
          if (!id) return
          const result = await updateTaskAction({ id: task.id, assigneeId: id })
          if ('error' in result) { notify(result.error); return }
          setAssigneeId('')
          notify('Task assigned')
        })}><input value={assigneeId} onChange={event => setAssigneeId(event.target.value)} className={`${inputClass} w-36`} aria-label="Assignee user ID" placeholder="Assignee user ID" /><Button variant="outline" disabled={busy}>Assign</Button></form>
        <Button variant="outline" onClick={async () => {
          const result = await duplicateTaskAction({ id: task.id })
          if ('error' in result) { notify(result.error); return }
          notify('Task duplicated; refresh to view it')
        }}>Duplicate</Button>
        <Button variant="outline" onClick={() => setPriorityOpen(true)}>Priority</Button>
        <Button variant="outline" onClick={() => setEditOpen(true)}>Edit</Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
    {editOpen && <TaskEditDialog task={task} onClose={() => setEditOpen(false)} onSave={patch => { refreshTask(patch); setEditOpen(false) }} notify={notify} />}
    {priorityOpen && <Modal title="Update priority" onClose={() => setPriorityOpen(false)}><form className="mt-4 flex flex-col gap-4" onSubmit={event => submit(event, async () => {
      const priority = new FormData(event.currentTarget).get('priority')?.toString() as WorkspacePriority
      const result = await updateTaskAction({ id: task.id, priority: priority.toUpperCase() })
      if ('error' in result) { notify(result.error); return }
      refreshTask({ priority })
      setPriorityOpen(false)
      notify('Priority updated')
    })}><label className="flex flex-col gap-1.5 text-xs font-medium">Priority<select name="priority" defaultValue={task.priority} className={inputClass}>{(['Low', 'Medium', 'High', 'Urgent'] as const).map(priority => <option key={priority}>{priority}</option>)}</select></label><div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => setPriorityOpen(false)}>Cancel</Button><Button disabled={busy}>Save</Button></div></form></Modal>}
    {commentEdit && <Modal title="Edit comment" onClose={() => setCommentEdit(null)}><form className="mt-4 flex flex-col gap-4" onSubmit={event => submit(event, async () => {
      const body = new FormData(event.currentTarget).get('body')?.toString().trim() ?? ''
      if (!body) return
      const result = await updateTaskCommentAction({ id: commentEdit.id, taskId: task.id, body })
      if ('error' in result) { notify(result.error); return }
      refreshTask({ comments: (task.comments ?? []).map(comment => comment.id === commentEdit.id ? { ...comment, body } : comment) })
      setCommentEdit(null)
      notify('Comment updated')
    })}><textarea name="body" defaultValue={commentEdit.body} className={inputClass} rows={4} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCommentEdit(null)}>Cancel</Button><Button disabled={busy}>Save</Button></div></form></Modal>}
  </Modal>
}

function TaskEditDialog({ task, onClose, onSave, notify }: { task: WorkspaceTask; onClose: () => void; onSave: (patch: Partial<WorkspaceTask>) => void; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  return <Modal title="Edit task" onClose={onClose}><form className="mt-4 flex flex-col gap-4" onSubmit={async event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const title = data.get('title')?.toString().trim() ?? ''
    const description = data.get('description')?.toString().trim() ?? ''
    if (!title) return
    setBusy(true)
    try {
      const result = await updateTaskAction({ id: task.id, title, description })
      if ('error' in result) { notify(result.error); return }
      onSave({ title, description })
      notify('Task updated')
    } finally { setBusy(false) }
  }}><label className="flex flex-col gap-1.5 text-xs font-medium">Title<input name="title" defaultValue={task.title} className={inputClass} required /></label><label className="flex flex-col gap-1.5 text-xs font-medium">Description<textarea name="description" defaultValue={task.description} className={inputClass} rows={4} /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy}>Save changes</Button></div></form></Modal>
}

export function TasksView({ tasks, setTasks, openCreate, notify }: TasksViewProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; operation: 'delete' | 'archive' } | null>(null)
  const columns: WorkspaceTaskStatus[] = ['Todo', 'In progress', 'Review', 'Done']
  const visible = tasks.filter(task => (status === 'All' || task.status === status) && `${task.title} ${task.project} ${task.labels.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const selected = tasks.find(task => task.id === selectedId) ?? null
  const move = async (id: string, next: WorkspaceTaskStatus) => {
    const statusValue = next === 'In progress' ? 'IN_PROGRESS' : next.toUpperCase().replace(' ', '_')
    const result = await updateTaskAction({ id, status: statusValue })
    if ('error' in result) { notify(result.error); return }
    setTasks(items => items.map(task => task.id === id ? { ...task, status: next } : task))
    notify('Task status updated')
  }
  const confirmAction = async () => {
    if (!confirm) return
    const result = confirm.operation === 'delete' ? await deleteTaskAction({ id: confirm.id }) : await archiveTaskAction({ id: confirm.id })
    if ('error' in result) { notify(result.error); setConfirm(null); return }
    setTasks(items => items.filter(task => task.id !== confirm.id))
    if (selectedId === confirm.id) setSelectedId(null)
    notify(confirm.operation === 'delete' ? 'Task deleted' : 'Task archived')
    setConfirm(null)
  }
  return <div className="flex flex-col gap-6">
    <SectionHeader title="My tasks" description="Stay focused on what needs your attention." action={<Button onClick={openCreate}><Plus data-icon="inline-start" />Create task</Button>} />
    <div className="flex flex-wrap gap-2"><SearchField value={query} onChange={setQuery} placeholder="Search tasks" /><select value={status} onChange={event => setStatus(event.target.value)} className={inputClass}><option>All</option>{columns.map(column => <option key={column}>{column}</option>)}</select></div>
    <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-4">{columns.map(column => {
      const columnTasks = visible.filter(task => task.status === column)
      return <div key={column} className="min-w-[250px] rounded-xl bg-muted/40 p-3"><div className="flex items-center justify-between px-1"><span className="text-xs font-semibold">{column}</span><span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{columnTasks.length}</span></div><div className="mt-3 flex flex-col gap-2">{columnTasks.map(task => <Card key={task.id} className="p-3"><button type="button" onClick={() => setSelectedId(task.id)} className="w-full text-left"><p className="text-sm font-medium">{task.title}</p><p className="mt-2 text-[11px] text-muted-foreground">{task.project}</p><div className="mt-3 flex items-center justify-between"><Status tone={task.priority === 'High' || task.priority === 'Urgent' ? 'red' : task.priority === 'Medium' ? 'orange' : 'muted'}>{task.priority}</Status><span className="text-[10px] text-muted-foreground">{task.assignee}</span></div></button><div className="mt-3 flex gap-1"><select aria-label={`Move ${task.title}`} value={task.status} onChange={event => void move(task.id, event.target.value as WorkspaceTaskStatus)} className="max-w-32 bg-transparent text-[10px] text-primary">{columns.map(value => <option key={value} value={value}>Move to {value}</option>)}</select><button type="button" onClick={() => setConfirm({ id: task.id, operation: 'archive' })} className="ml-auto text-[10px] text-muted-foreground">Archive</button><button type="button" onClick={() => setConfirm({ id: task.id, operation: 'delete' })} className="text-[10px] text-destructive">Delete</button></div></Card>)}{columnTasks.length === 0 && <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">No tasks found</div>}</div></div>
    })}</div>
    {selected && <TaskDetails key={selected.id} task={selected} tasks={tasks} setTasks={setTasks} notify={notify} onClose={() => setSelectedId(null)} />}
    {confirm && <ConfirmDialog title={`${confirm.operation === 'delete' ? 'Delete' : 'Archive'} this task?`} onCancel={() => setConfirm(null)} onConfirm={() => void confirmAction()} />}
  </div>
}

export function ProjectsView({ projects, setProjects, openCreate, notify }: ProjectsViewProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [editProject, setEditProject] = useState<WorkspaceProject | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; operation: 'delete' | 'archive' } | null>(null)
  const visible = projects.filter(project => (filter === 'All' || project.status === filter) && `${project.name} ${project.description}`.toLowerCase().includes(query.toLowerCase()))
  const actOnProject = async () => {
    if (!confirm) return
    const result = confirm.operation === 'delete' ? await deleteProjectAction({ id: confirm.id }) : await archiveProjectAction({ id: confirm.id })
    if ('error' in result) { notify(result.error); setConfirm(null); return }
    setProjects(items => items.filter(project => project.id !== confirm.id))
    notify(confirm.operation === 'delete' ? 'Project deleted' : 'Project archived')
    setConfirm(null)
  }
  return <div className="flex flex-col gap-6">
    <SectionHeader title="Projects" description="Plan, track, and deliver your team's most important work." action={<Button onClick={openCreate}><Plus data-icon="inline-start" />New project</Button>} />
    <div className="flex flex-wrap gap-2"><SearchField value={query} onChange={setQuery} placeholder="Search projects" /><select value={filter} onChange={event => setFilter(event.target.value)} className={inputClass}><option>All</option><option>On hold</option><option>Active</option></select></div>
    <div className="grid gap-4 lg:grid-cols-2">{visible.map(project => <Card key={project.id} className="transition-shadow hover:shadow-md"><div className="flex items-start justify-between"><div><h3 className="font-semibold">{project.name}</h3><p className="mt-1 text-xs text-muted-foreground">{project.description}</p></div><Status tone={project.status === 'On hold' ? 'orange' : 'green'}>{project.status}</Status></div><div className="mt-6 flex items-center justify-between text-xs"><span>{Math.round(project.progress / 10)} / 10 milestones</span><span className="text-muted-foreground">{project.progress}%</span></div><div className="mt-2 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} /></div><div className="mt-4 flex items-center justify-between"><Status tone={project.priority === 'High' || project.priority === 'Urgent' ? 'red' : project.priority === 'Medium' ? 'orange' : 'muted'}>{project.priority} priority</Status><div className="flex gap-3"><button type="button" onClick={() => setEditProject(project)} className="text-xs text-primary">Edit</button><button type="button" onClick={() => setConfirm({ id: project.id, operation: 'archive' })} className="text-xs text-muted-foreground">Archive</button><button type="button" onClick={() => setConfirm({ id: project.id, operation: 'delete' })} className="text-xs text-destructive">Delete</button></div></div></Card>)}{visible.length === 0 && <Card className="text-center lg:col-span-2"><p className="font-medium">No projects found</p><p className="mt-1 text-sm text-muted-foreground">Try changing your filters or create a new project.</p></Card>}</div>
    {editProject && <ProjectEditDialog project={editProject} notify={notify} onClose={() => setEditProject(null)} onSave={patch => {
      setProjects(items => items.map(project => project.id === editProject.id ? { ...project, ...patch } : project))
      setEditProject(null)
    }} />}
    {confirm && <ConfirmDialog title={`${confirm.operation === 'delete' ? 'Delete' : 'Archive'} this project?`} onCancel={() => setConfirm(null)} onConfirm={() => void actOnProject()} />}
  </div>
}

function ProjectEditDialog({ project, onClose, onSave, notify }: { project: WorkspaceProject; onClose: () => void; onSave: (patch: Partial<WorkspaceProject>) => void; notify: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  return <Modal title="Edit project" onClose={onClose}><form className="mt-4 flex flex-col gap-4" onSubmit={async event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = data.get('name')?.toString().trim() ?? ''
    const description = data.get('description')?.toString().trim() ?? ''
    if (!name) return
    setBusy(true)
    try {
      const result = await updateProjectAction({ id: project.id, name, description })
      if ('error' in result) { notify(result.error); return }
      onSave({ name, description })
      notify('Project updated')
    } finally { setBusy(false) }
  }}><label className="flex flex-col gap-1.5 text-xs font-medium">Name<input name="name" defaultValue={project.name} className={inputClass} required /></label><label className="flex flex-col gap-1.5 text-xs font-medium">Description<textarea name="description" defaultValue={project.description} className={inputClass} rows={4} /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy}>Save changes</Button></div></form></Modal>
}
