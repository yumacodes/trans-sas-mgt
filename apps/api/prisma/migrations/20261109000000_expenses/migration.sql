-- Expenses: general expenses plus Tender-In and Tender-Out transactions.

-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('general', 'tender_in', 'tender_out');
CREATE TYPE "ExpenseStatus" AS ENUM ('pending', 'approved', 'rejected', 'voided');
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'cheque', 'mobile_money', 'card', 'other');

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "ExpenseKind" NOT NULL,
    "transactionDate" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "category" TEXT NOT NULL,
    "counterparty" TEXT,
    "tenderReference" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentReference" TEXT,
    "description" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'pending',
    "statusReason" TEXT,
    "branchId" UUID,
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expenses_number_key" ON "expenses"("number");
CREATE INDEX "expenses_kind_transactionDate_idx" ON "expenses"("kind", "transactionDate");
CREATE INDEX "expenses_kind_status_idx" ON "expenses"("kind", "status");
CREATE INDEX "expenses_branchId_idx" ON "expenses"("branchId");
CREATE INDEX "expenses_number_trgm" ON "expenses" USING GIN ("number" gin_trgm_ops);
CREATE INDEX "expenses_counterparty_trgm" ON "expenses" USING GIN ("counterparty" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integrity checks
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_check" CHECK ("amount" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_currency_check" CHECK ("currency" IN ('USD', 'GHS'));

-- Only the API (service role) reads this table.
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
