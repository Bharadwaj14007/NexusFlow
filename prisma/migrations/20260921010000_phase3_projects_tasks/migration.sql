ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "position" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "parentId" UUID;
ALTER TABLE "Task" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Task_projectId_position_idx" ON "Task"("projectId", "position");
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");
CREATE TABLE "TaskDependency" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "dependsOnId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskDependency_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TaskDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TaskDependency_taskId_dependsOnId_key" ON "TaskDependency"("taskId", "dependsOnId");
CREATE INDEX "TaskDependency_organizationId_idx" ON "TaskDependency"("organizationId");
CREATE INDEX "TaskDependency_dependsOnId_idx" ON "TaskDependency"("dependsOnId");
CREATE TABLE "ActivityHistory" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "taskId" UUID,
  "projectId" UUID,
  "actorId" UUID,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivityHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActivityHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActivityHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActivityHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ActivityHistory_organizationId_createdAt_idx" ON "ActivityHistory"("organizationId", "createdAt");
CREATE INDEX "ActivityHistory_taskId_createdAt_idx" ON "ActivityHistory"("taskId", "createdAt");
CREATE INDEX "ActivityHistory_projectId_createdAt_idx" ON "ActivityHistory"("projectId", "createdAt");
