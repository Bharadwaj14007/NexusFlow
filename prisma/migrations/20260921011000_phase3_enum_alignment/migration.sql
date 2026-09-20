-- Preserve existing data while aligning the Phase 3 public enum vocabulary.
ALTER TYPE "ProjectStatus" RENAME VALUE 'ON_TRACK' TO 'ACTIVE';
ALTER TYPE "ProjectStatus" RENAME VALUE 'AT_RISK' TO 'ON_HOLD';
ALTER TYPE "TaskStatus" RENAME VALUE 'IN_REVIEW' TO 'REVIEW';
