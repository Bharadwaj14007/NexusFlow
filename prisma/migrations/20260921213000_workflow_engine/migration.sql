ALTER TABLE "WorkflowExecution"
  ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'TASK_CREATED',
  ADD COLUMN "idempotencyKey" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX "WorkflowExecution_organizationId_idempotencyKey_key"
  ON "WorkflowExecution" ("organizationId", "idempotencyKey");
