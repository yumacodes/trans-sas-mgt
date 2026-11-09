-- Proforma invoices and their line items.

-- CreateEnum
CREATE TYPE "ProformaStatus" AS ENUM ('draft', 'issued', 'accepted', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "proformas" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "clientId" UUID,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "vatAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "status" "ProformaStatus" NOT NULL DEFAULT 'draft',
    "emailedAt" TIMESTAMPTZ(6),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "proformas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proforma_items" (
    "id" UUID NOT NULL,
    "proformaId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "stockItemId" UUID,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "proforma_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proformas_number_key" ON "proformas"("number");
CREATE INDEX "proformas_issueDate_idx" ON "proformas"("issueDate");
CREATE INDEX "proformas_status_idx" ON "proformas"("status");
CREATE INDEX "proformas_clientId_idx" ON "proformas"("clientId");
CREATE INDEX "proformas_customer_trgm" ON "proformas" USING GIN ("customerName" gin_trgm_ops);
CREATE INDEX "proformas_number_trgm" ON "proformas" USING GIN ("number" gin_trgm_ops);
CREATE INDEX "proforma_items_proformaId_position_idx" ON "proforma_items"("proformaId", "position");
CREATE INDEX "proforma_items_stockItemId_idx" ON "proforma_items"("stockItemId");

-- AddForeignKey
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proforma_items" ADD CONSTRAINT "proforma_items_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "proformas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proforma_items" ADD CONSTRAINT "proforma_items_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity checks
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_amounts_check" CHECK ("vatRate" BETWEEN 0 AND 100 AND "taxRate" BETWEEN 0 AND 100 AND "subtotal" >= 0 AND "total" >= 0);
ALTER TABLE "proforma_items" ADD CONSTRAINT "proforma_items_amounts_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "amount" >= 0);

-- Only the API (service role) reads these tables.
ALTER TABLE "proformas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proforma_items" ENABLE ROW LEVEL SECURITY;
