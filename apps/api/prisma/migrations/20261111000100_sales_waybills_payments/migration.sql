-- Sales, waybills and customer payments.

CREATE TYPE "SaleStatus" AS ENUM ('draft', 'confirmed', 'cancelled');
CREATE TYPE "WaybillStatus" AS ENUM ('draft', 'dispatched', 'delivered', 'cancelled');
CREATE TYPE "PaymentStatus" AS ENUM ('posted', 'reversed');

CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "saleDate" DATE NOT NULL,
    "dueDate" DATE,
    "currency" CHAR(3) NOT NULL,
    "branchId" UUID NOT NULL,
    "clientId" UUID,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'draft',
    "cancelReason" TEXT,
    "confirmedAt" TIMESTAMPTZ(6),
    "proformaId" UUID,
    "tenderId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_total_nonnegative" CHECK ("total" >= 0)
);

CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "stockItemId" UUID,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_items_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "waybills" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "branchId" UUID NOT NULL,
    "saleId" UUID,
    "clientId" UUID,
    "recipientName" TEXT NOT NULL,
    "deliveryAddress" TEXT,
    "deliveryDate" DATE NOT NULL,
    "carrier" TEXT,
    "vehicleNumber" TEXT,
    "receivedBy" TEXT,
    "notes" TEXT,
    "status" "WaybillStatus" NOT NULL DEFAULT 'draft',
    "stockIssued" BOOLEAN NOT NULL DEFAULT false,
    "dispatchedAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "waybills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "waybill_items" (
    "id" UUID NOT NULL,
    "waybillId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "saleItemId" UUID,
    "stockItemId" UUID,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT NOT NULL,
    CONSTRAINT "waybill_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "waybill_items_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "saleId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "paymentDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "externalReference" TEXT,
    "notes" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'posted',
    "reverseReason" TEXT,
    "reversedAt" TIMESTAMPTZ(6),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "sales_number_key" ON "sales"("number");
CREATE INDEX "sales_branchId_idx" ON "sales"("branchId");
CREATE INDEX "sales_saleDate_idx" ON "sales"("saleDate");
CREATE INDEX "sales_status_idx" ON "sales"("status");
CREATE INDEX "sales_clientId_idx" ON "sales"("clientId");
CREATE INDEX "sale_items_saleId_position_idx" ON "sale_items"("saleId", "position");
CREATE INDEX "sale_items_stockItemId_idx" ON "sale_items"("stockItemId");
CREATE UNIQUE INDEX "waybills_number_key" ON "waybills"("number");
CREATE INDEX "waybills_branchId_idx" ON "waybills"("branchId");
CREATE INDEX "waybills_saleId_idx" ON "waybills"("saleId");
CREATE INDEX "waybills_status_idx" ON "waybills"("status");
CREATE INDEX "waybills_deliveryDate_idx" ON "waybills"("deliveryDate");
CREATE INDEX "waybill_items_waybillId_position_idx" ON "waybill_items"("waybillId", "position");
CREATE INDEX "waybill_items_saleItemId_idx" ON "waybill_items"("saleItemId");
CREATE UNIQUE INDEX "payments_number_key" ON "payments"("number");
CREATE INDEX "payments_saleId_idx" ON "payments"("saleId");
CREATE INDEX "payments_branchId_idx" ON "payments"("branchId");
CREATE INDEX "payments_paymentDate_idx" ON "payments"("paymentDate");
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- A document can have only one live sale, and a bank or cheque reference only one live payment.
CREATE UNIQUE INDEX "sales_live_proforma_key" ON "sales"("proformaId") WHERE "status" <> 'cancelled' AND "proformaId" IS NOT NULL;
CREATE UNIQUE INDEX "sales_live_tender_key" ON "sales"("tenderId") WHERE "status" <> 'cancelled' AND "tenderId" IS NOT NULL;
CREATE UNIQUE INDEX "payments_live_reference_key" ON "payments"("method", "externalReference") WHERE "status" = 'posted' AND "externalReference" IS NOT NULL;

ALTER TABLE "sales" ADD CONSTRAINT "sales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "proformas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waybills" ADD CONSTRAINT "waybills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waybill_items" ADD CONSTRAINT "waybill_items_waybillId_fkey" FOREIGN KEY ("waybillId") REFERENCES "waybills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waybill_items" ADD CONSTRAINT "waybill_items_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- A draft sale's lines are replaced when it is edited; waybills exist only for confirmed sales.
ALTER TABLE "waybill_items" ADD CONSTRAINT "waybill_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sale_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "waybills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "waybill_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
