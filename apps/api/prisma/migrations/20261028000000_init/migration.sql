-- Trigram search indexes below need pg_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('public_hospital', 'private_hospital', 'clinic', 'laboratory', 'pharmacy', 'government_agency', 'ngo', 'distributor', 'individual', 'other');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('pending', 'active', 'suspended', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('none', 'serial', 'batch');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('opening_balance', 'purchase_receipt', 'sale_issue', 'sale_return', 'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out');

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "authUserId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "user_branch_assignments" (
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branch_assignments_pkey" PRIMARY KEY ("userId","branchId")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(6),

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_profile" (
    "id" UUID NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "taxId" TEXT,
    "registrationNumber" TEXT,
    "defaultCurrency" CHAR(3) NOT NULL,
    "settings" JSONB NOT NULL,
    "logoFileId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL,
    "docType" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "city" TEXT,
    "region" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_records" (
    "id" UUID NOT NULL,
    "bucket" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "file_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationType" "OrganizationType" NOT NULL,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "billingAddress" TEXT,
    "deliveryAddress" TEXT,
    "taxId" TEXT,
    "notes" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "archivedAt" TIMESTAMPTZ(6),
    "branchId" UUID,
    "accountOwnerId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_registrations" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "registeredOn" DATE NOT NULL,
    "validUntil" DATE,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'active',
    "statusChangedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" UUID,
    "brand" TEXT,
    "model" TEXT,
    "unit" TEXT NOT NULL,
    "purchaseCost" DECIMAL(18,4),
    "sellingPrice" DECIMAL(18,2) NOT NULL,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "trackingMode" "TrackingMode" NOT NULL DEFAULT 'none',
    "warrantyMonths" INTEGER,
    "tracksExpiry" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "quantityOnHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "actorId" UUID,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_authUserId_key" ON "user_profiles"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_email_key" ON "user_profiles"("email");

-- CreateIndex
CREATE INDEX "user_profiles_isActive_idx" ON "user_profiles"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE INDEX "user_branch_assignments_branchId_idx" ON "user_branch_assignments"("branchId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "idempotency_records_createdAt_idx" ON "idempotency_records"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_userId_key_key" ON "idempotency_records"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "company_profile_singleton_key" ON "company_profile"("singleton");

-- CreateIndex
CREATE UNIQUE INDEX "company_profile_logoFileId_key" ON "company_profile"("logoFileId");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_docType_scopeKey_year_key" ON "document_sequences"("docType", "scopeKey", "year");

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE INDEX "file_records_ownerType_ownerId_idx" ON "file_records"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "file_records_bucket_path_key" ON "file_records"("bucket", "path");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "clients_organizationType_idx" ON "clients"("organizationType");

-- CreateIndex
CREATE INDEX "clients_branchId_idx" ON "clients"("branchId");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE INDEX "clients_name_trgm" ON "clients" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "clients_code_trgm" ON "clients" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "client_registrations_registrationNumber_key" ON "client_registrations"("registrationNumber");

-- CreateIndex
CREATE INDEX "client_registrations_clientId_idx" ON "client_registrations"("clientId");

-- CreateIndex
CREATE INDEX "client_registrations_status_idx" ON "client_registrations"("status");

-- CreateIndex
CREATE INDEX "client_registrations_number_trgm" ON "client_registrations" USING GIN ("registrationNumber" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "stock_categories_name_key" ON "stock_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_sku_key" ON "stock_items"("sku");

-- CreateIndex
CREATE INDEX "stock_items_categoryId_idx" ON "stock_items"("categoryId");

-- CreateIndex
CREATE INDEX "stock_items_isActive_idx" ON "stock_items"("isActive");

-- CreateIndex
CREATE INDEX "stock_items_name_idx" ON "stock_items"("name");

-- CreateIndex
CREATE INDEX "stock_items_name_trgm" ON "stock_items" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "stock_items_sku_trgm" ON "stock_items" USING GIN ("sku" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "stock_balances_branchId_idx" ON "stock_balances"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_itemId_branchId_key" ON "stock_balances"("itemId", "branchId");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_occurredAt_idx" ON "stock_movements"("itemId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_branchId_occurredAt_idx" ON "stock_movements"("branchId", "occurredAt");

-- CreateIndex
CREATE INDEX "stock_movements_sourceType_sourceId_idx" ON "stock_movements"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_assignments" ADD CONSTRAINT "user_branch_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_assignments" ADD CONSTRAINT "user_branch_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profile" ADD CONSTRAINT "company_profile_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "file_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_records" ADD CONSTRAINT "file_records_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_accountOwnerId_fkey" FOREIGN KEY ("accountOwnerId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_registrations" ADD CONSTRAINT "client_registrations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_registrations" ADD CONSTRAINT "client_registrations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "stock_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

