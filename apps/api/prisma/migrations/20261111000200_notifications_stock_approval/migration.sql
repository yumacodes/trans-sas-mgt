-- Stock item approval and in-app notifications.

CREATE TYPE "StockApproval" AS ENUM ('pending', 'approved', 'rejected');

-- Existing items were already in use, so they stay approved.
ALTER TABLE "stock_items"
  ADD COLUMN "approvalStatus" "StockApproval" NOT NULL DEFAULT 'approved',
  ADD COLUMN "approvedById" UUID,
  ADD COLUMN "approvedAt" TIMESTAMPTZ(6),
  ADD COLUMN "rejectionReason" TEXT;

ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "stock_items_approvalStatus_idx" ON "stock_items"("approvalStatus");

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_userId_dedupeKey_key" ON "notifications"("userId", "dedupeKey");
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

-- Only administrators see every branch. Accountants now work within assigned branches.
DELETE FROM "role_permissions"
WHERE "permissionKey" = 'branches.all_access'
  AND "roleId" IN (SELECT "id" FROM "roles" WHERE "key" = 'accountant');
