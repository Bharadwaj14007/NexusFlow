ALTER TABLE "Project" ADD COLUMN "startAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "dueAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "ownerId" UUID;
ALTER TABLE "Task" ADD COLUMN "estimatedMinutes" INTEGER;
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");
CREATE TABLE "ProjectMember" (
 "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "projectId" UUID NOT NULL, "userId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ProjectMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId","userId");
CREATE INDEX "ProjectMember_organizationId_idx" ON "ProjectMember"("organizationId");
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
