ALTER TYPE "WorkflowExecutionStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "WorkflowExecutionStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "WorkflowExecutionStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

CREATE TYPE "WorkflowScheduleFrequency" AS ENUM ('NONE', 'DAILY', 'WEEKLY');

ALTER TABLE "Workflow"
  ADD COLUMN "schedule" "WorkflowScheduleFrequency" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "scheduleTime" TEXT,
  ADD COLUMN "scheduleDay" INTEGER,
  ADD COLUMN "lastScheduledAt" TIMESTAMP(3);

ALTER TABLE "WorkflowExecution"
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "queuedAt" TIMESTAMP(3),
  ADD COLUMN "processingAt" TIMESTAMP(3);

CREATE INDEX "Workflow_schedule_idx" ON "Workflow" ("organizationId", "schedule", "status");
CREATE INDEX "WorkflowExecution_queue_idx" ON "WorkflowExecution" ("status", "nextAttemptAt", "queuedAt");
