import WorkspaceApp from '@/components/workspace/workspace-app'
import { requireOrganization } from '@/lib/auth/guards'
import { initialsFromName, roleLabel } from '@/lib/utils/identity'
import { listProjects, listTasks } from '@/lib/services/project-task.service'
import { listDocuments } from '@/lib/services/ai.service'
import { listWorkflows } from '@/lib/services/workflow.service'
import { listMembers, listNotifications } from '@/lib/services/platform.service'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  const ctx = await requireOrganization()
  const [projects, tasks, documents, workflows, members, notifications] = await Promise.all([listProjects(), listTasks(), listDocuments(), listWorkflows(), listMembers(), listNotifications()])

  return (
    <WorkspaceApp
      initialProjects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status === 'ON_HOLD' ? 'On hold' : project.status === 'ACTIVE' ? 'Active' : project.status === 'COMPLETED' ? 'Completed' : 'Planning',
        priority: (project.priority[0] + project.priority.slice(1).toLowerCase()) as 'Low' | 'Medium' | 'High' | 'Urgent',
        progress: project.progress,
        startAt: project.startAt?.toISOString() ?? null,
        dueAt: project.dueAt?.toISOString() ?? null,
        ownerId: project.ownerId,
        memberIds: project.members.map((member) => member.userId),
      }))}
      initialTasks={tasks.map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        project: task.project.name,
        projectId: task.projectId,
        priority: (task.priority[0] + task.priority.slice(1).toLowerCase()) as 'Low' | 'Medium' | 'High' | 'Urgent',
        status: task.status === 'IN_PROGRESS' ? 'In progress' : task.status === 'REVIEW' ? 'Review' : task.status === 'DONE' ? 'Done' : 'Todo',
        due: task.dueAt ? task.dueAt.toISOString().slice(0, 10) : 'No due date',
        assignee: task.assignee?.avatarInitials ?? initialsFromName(task.assignee?.name ?? 'Unassigned'),
        labels: task.labels,
        estimatedMinutes: task.estimatedMinutes,
        comments: task.comments.map((comment) => ({ id: comment.id, body: comment.body, author: { name: comment.author.name } })),
        subtasks: task.subtasks.map((subtask) => ({ id: subtask.id, title: subtask.title, status: subtask.status })),
        activities: task.activities.map((activity) => ({ id: activity.id, action: activity.action, createdAt: activity.createdAt.toISOString() })),
        dependencies: task.dependencies.map((dependency) => ({ dependsOnId: dependency.dependsOnId })),
      }))}
      initialDocuments={documents.map((document) => ({
        id: document.id,
        name: document.name,
        status: document.status === 'READY' ? 'Ready' : document.status === 'FAILED' ? 'Failed' : 'Processing',
        size: document.sizeBytes ? `${Math.ceil(document.sizeBytes / 1024)} KB` : 'Indexed',
      }))}
      initialWorkflows={workflows.map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
        schedule: workflow.schedule,
        scheduleTime: workflow.scheduleTime,
        scheduleDay: workflow.scheduleDay,
        definition: workflow.definition as { trigger: string; conditions: { field: string; operator: string; value?: string }[]; actions: { type: string; title?: string; body?: string; projectId?: string; taskId?: string }[] },
        _count: workflow._count,
      }))}
      initialMembers={members.map((member) => ({ id: member.id, role: member.role, user: { id: member.user.id, name: member.user.name, email: member.user.email, avatarInitials: member.user.avatarInitials } }))}
      initialNotifications={notifications.map((notification) => ({ id: notification.id, title: notification.title, body: notification.body, readAt: notification.readAt?.toISOString() ?? null, createdAt: notification.createdAt.toISOString() }))}
      user={{
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        avatarInitials: ctx.user.avatarInitials ?? initialsFromName(ctx.user.name),
        role: roleLabel(ctx.membership.role),
        unreadCount: notifications.filter((notification) => notification.readAt === null).length,
      }}
      organization={{
        id: ctx.organization.id,
        name: ctx.organization.name,
        type: ctx.organization.type,
      }}
      organizations={ctx.organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        type: organization.type,
        role: roleLabel(organization.role),
      }))}
    />
  )
}
