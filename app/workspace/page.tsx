import WorkspaceApp from '@/components/workspace/workspace-app'
import { requireOrganization } from '@/lib/auth/guards'
import { initialsFromName, roleLabel } from '@/lib/utils/identity'
import { listProjects, listTasks } from '@/lib/services/project-task.service'

export const dynamic = 'force-dynamic'

export default async function WorkspacePage() {
  const ctx = await requireOrganization()
  const [projects, tasks] = await Promise.all([listProjects(), listTasks()])

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
      user={{
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
        avatarInitials: ctx.user.avatarInitials ?? initialsFromName(ctx.user.name),
        role: roleLabel(ctx.membership.role),
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
