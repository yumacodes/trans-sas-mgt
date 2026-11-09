-- Tender price schedules (with line items) and acceptance letters.

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('draft', 'submitted', 'awarded', 'not_awarded', 'cancelled');
CREATE TYPE "AcceptanceStatus" AS ENUM ('draft', 'issued', 'cancelled');

-- CreateTable
CREATE TABLE "tenders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "scheduleDate" DATE NOT NULL,
    "tenderReference" TEXT,
    "submissionDeadline" DATE,
    "clientId" UUID,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "lot" TEXT,
    "currency" CHAR(3) NOT NULL,
    "taxLabel" TEXT NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "status" "TenderStatus" NOT NULL DEFAULT 'draft',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tender_items" (
    "id" UUID NOT NULL,
    "tenderId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "stockItemId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "amountWithTax" DECIMAL(18,2) NOT NULL,
    "countryOfOrigin" TEXT,
    "manufacturer" TEXT,
    "brand" TEXT,
    "expiryDate" TEXT,

    CONSTRAINT "tender_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acceptance_letters" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "letterDate" DATE NOT NULL,
    "yourReference" TEXT,
    "clientId" UUID,
    "recipientName" TEXT NOT NULL,
    "recipientAddress" TEXT,
    "contractNumber" TEXT NOT NULL,
    "awardLetterDate" DATE,
    "supplyDescription" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "signatoryName" TEXT NOT NULL,
    "signatoryTitle" TEXT,
    "tenderId" UUID,
    "status" "AcceptanceStatus" NOT NULL DEFAULT 'draft',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "acceptance_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenders_number_key" ON "tenders"("number");
CREATE INDEX "tenders_scheduleDate_idx" ON "tenders"("scheduleDate");
CREATE INDEX "tenders_status_idx" ON "tenders"("status");
CREATE INDEX "tenders_clientId_idx" ON "tenders"("clientId");
CREATE INDEX "tenders_customer_trgm" ON "tenders" USING GIN ("customerName" gin_trgm_ops);
CREATE INDEX "tenders_number_trgm" ON "tenders" USING GIN ("number" gin_trgm_ops);
CREATE INDEX "tender_items_tenderId_position_idx" ON "tender_items"("tenderId", "position");
CREATE INDEX "tender_items_stockItemId_idx" ON "tender_items"("stockItemId");
CREATE UNIQUE INDEX "acceptance_letters_number_key" ON "acceptance_letters"("number");
CREATE INDEX "acceptance_letters_letterDate_idx" ON "acceptance_letters"("letterDate");
CREATE INDEX "acceptance_letters_status_idx" ON "acceptance_letters"("status");
CREATE INDEX "acceptance_letters_clientId_idx" ON "acceptance_letters"("clientId");
CREATE INDEX "acceptance_letters_tenderId_idx" ON "acceptance_letters"("tenderId");
CREATE INDEX "acceptance_letters_recipient_trgm" ON "acceptance_letters" USING GIN ("recipientName" gin_trgm_ops);
CREATE INDEX "acceptance_letters_number_trgm" ON "acceptance_letters" USING GIN ("number" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tender_items" ADD CONSTRAINT "tender_items_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tender_items" ADD CONSTRAINT "tender_items_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_letters" ADD CONSTRAINT "acceptance_letters_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_letters" ADD CONSTRAINT "acceptance_letters_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_letters" ADD CONSTRAINT "acceptance_letters_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity checks
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_amounts_check" CHECK ("taxRate" BETWEEN 0 AND 100 AND "subtotal" >= 0 AND "taxAmount" >= 0 AND "total" >= 0);
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_currency_check" CHECK ("currency" IN ('USD', 'GHS'));
ALTER TABLE "tender_items" ADD CONSTRAINT "tender_items_amounts_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "amount" >= 0 AND "amountWithTax" >= "amount");

-- Only the API (service role) reads these tables.
ALTER TABLE "tenders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tender_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acceptance_letters" ENABLE ROW LEVEL SECURITY;
