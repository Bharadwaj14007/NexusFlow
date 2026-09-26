ALTER TABLE "Workflow"
ADD COLUMN "createdById" UUID;
UPDATE "Workflow" AS workflow
SET "createdById" = (
  SELECT membership."userId"
  FROM "Membership" AS membership
  WHERE membership."organizationId" = workflow."organizationId"
  ORDER BY CASE membership.role WHEN 'OWNER' THEN 0 ELSE 1 END, membership."createdAt"
  LIMIT 1
);
ALTER TABLE "Workflow"
ADD CONSTRAINT "Workflow_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Workflow_createdById_idx" ON "Workflow"("createdById");

ALTER TABLE "Task" ADD COLUMN "workflowActionKey" TEXT;
CREATE UNIQUE INDEX "Task_workflowActionKey_key" ON "Task"("workflowActionKey");

ALTER TABLE "Comment" ADD COLUMN "workflowActionKey" TEXT;
CREATE UNIQUE INDEX "Comment_workflowActionKey_key" ON "Comment"("workflowActionKey");

ALTER TABLE "Notification" ADD COLUMN "workflowActionKey" TEXT;
CREATE UNIQUE INDEX "Notification_workflowActionKey_key" ON "Notification"("workflowActionKey");
