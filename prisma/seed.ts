import { createHash } from 'node:crypto'
import { hashPassword } from '../lib/auth/password'
import {
  DocumentStatus,
  IntegrationProvider,
  IntegrationStatus,
  MembershipRole,
  NotificationType,
  PrismaClient,
  Priority,
  ProjectStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  TaskStatus,
  WorkflowExecutionStatus,
  WorkflowStatus,
} from '@prisma/client'

const prisma = new PrismaClient()

const IDS = {
  org: '11111111-1111-4111-8111-111111111111',
  alex: '22222222-2222-4222-8222-222222222222',
  sam: '33333333-3333-4333-8333-333333333333',
  dana: '44444444-4444-4444-8444-444444444444',
  morgan: '55555555-5555-4555-8555-555555555555',
  atlas: '66666666-6666-4666-8666-666666666666',
  mobile: '77777777-7777-4777-8777-777777777777',
  website: '88888888-8888-4888-8888-888888888888',
  growth: '99999999-9999-4999-8999-999999999999',
  task1: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  task2: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  task3: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  task4: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
  workflow: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
} as const

function hashApiKey(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

async function main() {
  await prisma.session.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.activityHistory.deleteMany()
  await prisma.taskDependency.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()
  await prisma.workflowExecution.deleteMany()
  await prisma.workflow.deleteMany()
  await prisma.document.deleteMany()
  await prisma.apiKey.deleteMany()
  await prisma.integration.deleteMany()
  await prisma.usage.deleteMany()
  await prisma.subscription.deleteMany()
  await prisma.membership.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.user.deleteMany()

  const passwordHash = hashPassword('password123')

  const [alex, sam, dana, morgan] = await Promise.all([
    prisma.user.create({
      data: {
        id: IDS.alex,
        email: 'alex@nexusflow.dev',
        name: 'Alex Morgan',
        avatarInitials: 'AM',
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        id: IDS.sam,
        email: 'sam@nexusflow.dev',
        name: 'Sam Chen',
        avatarInitials: 'SC',
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        id: IDS.dana,
        email: 'dana@nexusflow.dev',
        name: 'Dana Kim',
        avatarInitials: 'DK',
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        id: IDS.morgan,
        email: 'morgan@nexusflow.dev',
        name: 'Morgan Patel',
        avatarInitials: 'MP',
        passwordHash,
      },
    }),
  ])

  const organization = await prisma.organization.create({
    data: {
      id: IDS.org,
      name: 'Nexus Labs',
      slug: 'nexus-labs',
      type: 'Technology',
    },
  })

  await prisma.membership.createMany({
    data: [
      { organizationId: organization.id, userId: alex.id, role: MembershipRole.OWNER },
      { organizationId: organization.id, userId: sam.id, role: MembershipRole.ADMIN },
      { organizationId: organization.id, userId: dana.id, role: MembershipRole.MEMBER },
      { organizationId: organization.id, userId: morgan.id, role: MembershipRole.MEMBER },
    ],
  })

  await prisma.project.createMany({
    data: [
      {
        id: IDS.atlas,
        organizationId: organization.id,
        creatorId: alex.id,
        name: 'Atlas Platform',
        description: 'Payments and AI platform launch.',
        status: ProjectStatus.ON_HOLD,
        priority: Priority.HIGH,
        progress: 74,
      },
      {
        id: IDS.mobile,
        organizationId: organization.id,
        creatorId: alex.id,
        name: 'Nexus Mobile',
        description: 'Mobile experience for distributed teams.',
        status: ProjectStatus.ACTIVE,
        priority: Priority.MEDIUM,
        progress: 48,
      },
      {
        id: IDS.website,
        organizationId: organization.id,
        creatorId: morgan.id,
        name: 'Website Redesign',
        description: 'Refresh the public marketing site.',
        status: ProjectStatus.ACTIVE,
        priority: Priority.LOW,
        progress: 91,
      },
      {
        id: IDS.growth,
        organizationId: organization.id,
        creatorId: morgan.id,
        name: 'Q4 Growth',
        description: 'Improve workspace activation and conversion.',
        status: ProjectStatus.PLANNING,
        priority: Priority.LOW,
        progress: 12,
      },
    ],
  })

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const oct24 = new Date('2026-10-24T17:00:00.000Z')

  await prisma.task.createMany({
    data: [
      {
        id: IDS.task1,
        organizationId: organization.id,
        projectId: IDS.atlas,
        creatorId: alex.id,
        assigneeId: sam.id,
        title: 'Fix payment webhook',
        description: 'Resolve retries in the checkout event handler.',
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.HIGH,
        dueAt: yesterday,
        labels: ['backend', 'blocked'],
      },
      {
        id: IDS.task2,
        organizationId: organization.id,
        projectId: IDS.atlas,
        creatorId: alex.id,
        assigneeId: alex.id,
        title: 'Build AI assistant',
        description: 'Prepare the grounded assistant experience.',
        status: TaskStatus.IN_PROGRESS,
        priority: Priority.HIGH,
        dueAt: now,
        labels: ['ai'],
      },
      {
        id: IDS.task3,
        organizationId: organization.id,
        projectId: IDS.mobile,
        creatorId: dana.id,
        assigneeId: dana.id,
        title: 'Review API architecture',
        description: 'Review service boundaries and rate limits.',
        status: TaskStatus.TODO,
        priority: Priority.MEDIUM,
        dueAt: tomorrow,
        labels: ['review'],
      },
      {
        id: IDS.task4,
        organizationId: organization.id,
        projectId: IDS.growth,
        creatorId: morgan.id,
        assigneeId: morgan.id,
        title: 'Update onboarding flow',
        description: 'Improve workspace activation steps.',
        status: TaskStatus.TODO,
        priority: Priority.LOW,
        dueAt: oct24,
        labels: ['growth'],
      },
    ],
  })

  await prisma.comment.create({
    data: {
      organizationId: organization.id,
      taskId: IDS.task1,
      authorId: alex.id,
      body: 'Retries are still firing after a successful 200. Let’s inspect the idempotency key path.',
    },
  })

  await prisma.document.createMany({
    data: [
      {
        organizationId: organization.id,
        uploaderId: alex.id,
        name: 'Project Requirements.pdf',
        status: DocumentStatus.READY,
        sizeBytes: 2_516_582,
        mimeType: 'application/pdf',
      },
      {
        organizationId: organization.id,
        uploaderId: alex.id,
        name: 'Sprint Planning Notes.docx',
        status: DocumentStatus.PROCESSING,
        sizeBytes: 860_160,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      {
        organizationId: organization.id,
        uploaderId: dana.id,
        name: 'Q3 Financial Report.xlsx',
        status: DocumentStatus.READY,
        sizeBytes: 1_258_291,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  })

  await prisma.workflow.create({
    data: {
      id: IDS.workflow,
      organizationId: organization.id,
      name: 'Overdue task reminder',
      description: 'Notify assignees when a task becomes overdue.',
      status: WorkflowStatus.ACTIVE,
      definition: {
        trigger: 'TASK_OVERDUE',
        conditions: [],
        actions: [{ type: 'CREATE_NOTIFICATION', title: 'Overdue task', body: 'A task is overdue.' }],
      },
      executions: {
        create: {
          organizationId: organization.id,
          trigger: 'TASK_OVERDUE',
          idempotencyKey: `seed:${IDS.workflow}:${IDS.task1}`,
          status: WorkflowExecutionStatus.SUCCEEDED,
          startedAt: yesterday,
          finishedAt: yesterday,
          result: { notified: 1, taskId: IDS.task1 },
        },
      },
    },
  })

  await prisma.notification.createMany({
    data: [
      {
        organizationId: organization.id,
        userId: alex.id,
        type: NotificationType.TASK,
        title: 'Payment webhook is overdue',
        body: 'Fix payment webhook is past due on Atlas Platform.',
      },
      {
        organizationId: organization.id,
        userId: alex.id,
        type: NotificationType.PROJECT,
        title: 'Atlas Platform is at risk',
        body: 'Three high-priority tasks need attention before launch.',
      },
      {
        organizationId: organization.id,
        userId: sam.id,
        type: NotificationType.TASK,
        title: 'You were assigned a task',
        body: 'Fix payment webhook was assigned to you.',
      },
      {
        organizationId: organization.id,
        userId: alex.id,
        type: NotificationType.SYSTEM,
        title: 'Welcome to Nexus Labs',
        body: 'Your workspace is ready. Invite the rest of the team when you are.',
        readAt: yesterday,
      },
    ],
  })

  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: organization.id,
        actorId: alex.id,
        action: 'organization.created',
        entityType: 'Organization',
        entityId: organization.id,
        metadata: { name: organization.name },
      },
      {
        organizationId: organization.id,
        actorId: alex.id,
        action: 'project.created',
        entityType: 'Project',
        entityId: IDS.atlas,
        metadata: { name: 'Atlas Platform' },
      },
      {
        organizationId: organization.id,
        actorId: alex.id,
        action: 'task.created',
        entityType: 'Task',
        entityId: IDS.task1,
        metadata: { title: 'Fix payment webhook' },
      },
    ],
  })

  await prisma.apiKey.create({
    data: {
      organizationId: organization.id,
      name: 'Development',
      keyPrefix: 'nf_dev_',
      keyHash: hashApiKey('nf_dev_local_seed_key_do_not_use_in_prod'),
    },
  })

  await prisma.integration.create({
    data: {
      organizationId: organization.id,
      provider: IntegrationProvider.SLACK,
      status: IntegrationStatus.DISCONNECTED,
      config: {},
    },
  })

  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))

  await prisma.subscription.create({
    data: {
      organizationId: organization.id,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    },
  })

  await prisma.usage.create({
    data: {
      organizationId: organization.id,
      periodStart,
      periodEnd,
      aiRequests: 7420,
      aiRequestLimit: 10000,
      seats: 4,
      storageBytes: BigInt(2_516_582 + 860_160 + 1_258_291),
    },
  })

  console.log('Seeded Nexus Labs development workspace.')
  console.log('Sign in as alex@nexusflow.dev / password123 once auth is connected.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
