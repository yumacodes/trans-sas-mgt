-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "username" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_username_key" ON "user_profiles"("username");


-- Usernames are compared case-insensitively, so they are stored lower-case only.
ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_username_format" CHECK ("username" ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
