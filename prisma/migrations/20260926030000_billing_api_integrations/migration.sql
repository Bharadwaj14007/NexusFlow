CREATE TABLE "ApiRateLimitBucket" (
    "id" UUID NOT NULL,
    "apiKeyId" UUID NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiRateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiRateLimitBucket_apiKeyId_windowStart_key"
ON "ApiRateLimitBucket"("apiKeyId", "windowStart");
CREATE INDEX "ApiRateLimitBucket_windowStart_idx"
ON "ApiRateLimitBucket"("windowStart");
ALTER TABLE "ApiRateLimitBucket"
ADD CONSTRAINT "ApiRateLimitBucket_apiKeyId_fkey"
FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Integration"
ADD COLUMN "credentialsEncrypted" TEXT,
ADD COLUMN "lastCheckedAt" TIMESTAMP(3);

ALTER TABLE "Subscription"
ADD COLUMN "pendingPlan" "SubscriptionPlan",
ADD COLUMN "providerSubscriptionId" TEXT,
ADD COLUMN "providerCustomerId" TEXT,
ADD COLUMN "providerPlanId" TEXT,
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key"
ON "Subscription"("providerSubscriptionId");

ALTER TABLE "RazorpayWebhookEvent"
ADD COLUMN "processedAt" TIMESTAMP(3),
ADD COLUMN "error" TEXT;
