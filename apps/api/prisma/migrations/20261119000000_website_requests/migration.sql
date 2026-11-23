-- Website connection: stock items can be listed on the public website, and a customer's
-- request from the website becomes a draft proforma that no staff member prepared.

-- Stock items: opt-in listing on the website. Existing items stay hidden.
ALTER TABLE "stock_items" ADD COLUMN "showOnWebsite" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "stock_items_showOnWebsite_idx" ON "stock_items"("showOnWebsite");

-- Proformas: where the document came from, and the browser's one-time submission key.
CREATE TYPE "ProformaSource" AS ENUM ('staff', 'website');
ALTER TABLE "proformas" ADD COLUMN "source" "ProformaSource" NOT NULL DEFAULT 'staff';
ALTER TABLE "proformas" ADD COLUMN "submissionKey" TEXT;
CREATE UNIQUE INDEX "proformas_submissionKey_key" ON "proformas"("submissionKey");
CREATE INDEX "proformas_source_idx" ON "proformas"("source");

-- A website request has no staff author. Staff-made proformas must still name one.
ALTER TABLE "proformas" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "proformas" ADD CONSTRAINT "proformas_author_check"
  CHECK ("source" = 'website' OR "createdById" IS NOT NULL);
