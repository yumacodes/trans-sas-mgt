-- Social media tracking: the company's accounts on each platform, their posts and videos,
-- and one snapshot of figures per account and per post per day.

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('instagram', 'facebook', 'youtube', 'tiktok', 'x', 'linkedin');

-- CreateEnum
CREATE TYPE "SocialSyncMode" AS ENUM ('manual', 'automatic');

-- CreateEnum
CREATE TYPE "SocialFigureSource" AS ENUM ('manual', 'automatic');

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "url" TEXT,
    "externalId" TEXT,
    "syncMode" "SocialSyncMode" NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "followers" INTEGER,
    "following" INTEGER,
    "postCount" INTEGER,
    "totalViews" INTEGER,
    "figuresDay" DATE,
    "lastSyncedAt" TIMESTAMPTZ(6),
    "lastSyncError" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_account_snapshots" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "followers" INTEGER,
    "following" INTEGER,
    "postCount" INTEGER,
    "totalViews" INTEGER,
    "source" "SocialFigureSource" NOT NULL,
    "recordedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_account_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_posts" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT,
    "publishedAt" TIMESTAMPTZ(6),
    "thumbnailUrl" TEXT,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "figuresDay" DATE,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_post_snapshots" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "source" "SocialFigureSource" NOT NULL,
    "recordedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_post_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_accounts_isActive_idx" ON "social_accounts"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_platform_handle_key" ON "social_accounts"("platform", "handle");

-- CreateIndex
CREATE INDEX "social_account_snapshots_day_idx" ON "social_account_snapshots"("day");

-- CreateIndex
CREATE UNIQUE INDEX "social_account_snapshots_accountId_day_key" ON "social_account_snapshots"("accountId", "day");

-- CreateIndex
CREATE INDEX "social_posts_accountId_publishedAt_idx" ON "social_posts"("accountId", "publishedAt");

-- CreateIndex
CREATE INDEX "social_posts_likes_idx" ON "social_posts"("likes");

-- CreateIndex
CREATE UNIQUE INDEX "social_posts_accountId_externalId_key" ON "social_posts"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "social_post_snapshots_postId_day_key" ON "social_post_snapshots"("postId", "day");

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_account_snapshots" ADD CONSTRAINT "social_account_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_account_snapshots" ADD CONSTRAINT "social_account_snapshots_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "social_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_snapshots" ADD CONSTRAINT "social_post_snapshots_postId_fkey" FOREIGN KEY ("postId") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_snapshots" ADD CONSTRAINT "social_post_snapshots_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Counts are never negative.
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_figures_check"
  CHECK (COALESCE("followers", 0) >= 0 AND COALESCE("following", 0) >= 0 AND COALESCE("postCount", 0) >= 0 AND COALESCE("totalViews", 0) >= 0);
ALTER TABLE "social_account_snapshots" ADD CONSTRAINT "social_account_snapshots_figures_check"
  CHECK (COALESCE("followers", 0) >= 0 AND COALESCE("following", 0) >= 0 AND COALESCE("postCount", 0) >= 0 AND COALESCE("totalViews", 0) >= 0);
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_figures_check"
  CHECK (COALESCE("views", 0) >= 0 AND COALESCE("likes", 0) >= 0 AND COALESCE("comments", 0) >= 0 AND COALESCE("shares", 0) >= 0 AND COALESCE("saves", 0) >= 0);
ALTER TABLE "social_post_snapshots" ADD CONSTRAINT "social_post_snapshots_figures_check"
  CHECK (COALESCE("views", 0) >= 0 AND COALESCE("likes", 0) >= 0 AND COALESCE("comments", 0) >= 0 AND COALESCE("shares", 0) >= 0 AND COALESCE("saves", 0) >= 0);

-- Only the API (privileged role) reads these tables; block direct access through the Supabase client.
ALTER TABLE "social_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_account_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_post_snapshots" ENABLE ROW LEVEL SECURITY;
