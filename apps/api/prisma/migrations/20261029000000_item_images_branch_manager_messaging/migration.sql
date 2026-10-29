-- Stock item photographs, a manager per branch, and the Communication module
-- (messages sent to clients, staff users or branch managers).

-- CreateEnum
CREATE TYPE "MessageAudience" AS ENUM ('clients', 'users', 'branch_managers');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('queued', 'sending', 'sent', 'partially_sent', 'failed');

-- CreateEnum
CREATE TYPE "MessageRecipientKind" AS ENUM ('client', 'user', 'branch_manager');

-- CreateEnum
CREATE TYPE "MessageRecipientStatus" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN "managerUserId" UUID;

-- CreateIndex
CREATE INDEX "branches_managerUserId_idx" ON "branches"("managerUserId");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "stock_item_images" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_item_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_item_images_fileId_key" ON "stock_item_images"("fileId");

-- CreateIndex
CREATE INDEX "stock_item_images_itemId_position_idx" ON "stock_item_images"("itemId", "position");

-- AddForeignKey
ALTER TABLE "stock_item_images" ADD CONSTRAINT "stock_item_images_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_item_images" ADD CONSTRAINT "stock_item_images_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "audience" "MessageAudience" NOT NULL,
    "filters" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'queued',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");

-- CreateIndex
CREATE INDEX "messages_status_idx" ON "messages"("status");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "message_recipients" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "kind" "MessageRecipientKind" NOT NULL,
    "recipientId" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "values" JSONB NOT NULL DEFAULT '{}',
    "status" "MessageRecipientStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_recipients_messageId_status_idx" ON "message_recipients"("messageId", "status");

-- CreateIndex
CREATE INDEX "message_recipients_kind_recipientId_idx" ON "message_recipients"("kind", "recipientId");

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Integrity rules ─────────────

ALTER TABLE "stock_item_images"
  ADD CONSTRAINT "stock_item_images_position_nonneg" CHECK ("position" >= 0);

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_subject_present" CHECK (length(btrim("subject")) > 0),
  ADD CONSTRAINT "messages_body_present" CHECK (length(btrim("body")) > 0),
  ADD CONSTRAINT "messages_counts_nonneg" CHECK (
    "recipientCount" >= 0 AND "sentCount" >= 0 AND "failedCount" >= 0 AND "skippedCount" >= 0
  ),
  -- Delivery outcomes can never add up to more than the people addressed.
  ADD CONSTRAINT "messages_counts_within_total" CHECK (
    "sentCount" + "failedCount" + "skippedCount" <= "recipientCount"
  );

ALTER TABLE "message_recipients"
  ADD CONSTRAINT "message_recipients_name_present" CHECK (length(btrim("name")) > 0),
  -- A recipient without an email address can only ever be skipped.
  ADD CONSTRAINT "message_recipients_email_required_to_send" CHECK (
    "email" IS NOT NULL OR "status" IN ('pending', 'skipped')
  );

-- Same exposure rules as every other table: reachable only through the API.
ALTER TABLE "stock_item_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_recipients" ENABLE ROW LEVEL SECURITY;
