-- CreateTable
CREATE TABLE "password_reset_requests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedById" UUID,

    CONSTRAINT "password_reset_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_reset_requests_resolvedAt_createdAt_idx" ON "password_reset_requests"("resolvedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_requests" ADD CONSTRAINT "password_reset_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One open request per user, however many times they submit the form.
CREATE UNIQUE INDEX "password_reset_requests_one_open_per_user" ON "password_reset_requests"("userId") WHERE "resolvedAt" IS NULL;

-- Same exposure rules as every other table: reachable only through the API.
ALTER TABLE "password_reset_requests" ENABLE ROW LEVEL SECURITY;
