ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'MANAGER';

CREATE TABLE "OrganizationInvitation" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
  "tokenHash" TEXT NOT NULL,
  "invitedById" UUID NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationInvitation_tokenHash_key" ON "OrganizationInvitation" ("tokenHash");
CREATE INDEX "OrganizationInvitation_organizationId_email_idx" ON "OrganizationInvitation" ("organizationId", "email");
CREATE INDEX "OrganizationInvitation_tokenHash_idx" ON "OrganizationInvitation" ("tokenHash");
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvitation" ADD CONSTRAINT "OrganizationInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
