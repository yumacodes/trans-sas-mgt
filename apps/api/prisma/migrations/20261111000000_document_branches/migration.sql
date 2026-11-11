-- Proformas, tenders and acceptance letters now belong to a branch, so staff see only
-- their own branch's documents. Existing documents take their creator's branch, or the
-- oldest active branch when the creator has none.

ALTER TABLE "proformas" ADD COLUMN "branchId" UUID;
ALTER TABLE "tenders" ADD COLUMN "branchId" UUID;
ALTER TABLE "acceptance_letters" ADD COLUMN "branchId" UUID;

UPDATE "proformas" d SET "branchId" = COALESCE(
  (SELECT a."branchId" FROM "user_branch_assignments" a
     JOIN "branches" b ON b."id" = a."branchId"
    WHERE a."userId" = d."createdById" AND b."isActive"
    ORDER BY b."createdAt" LIMIT 1),
  (SELECT "id" FROM "branches" WHERE "isActive" ORDER BY "createdAt" LIMIT 1)
);

UPDATE "tenders" d SET "branchId" = COALESCE(
  (SELECT a."branchId" FROM "user_branch_assignments" a
     JOIN "branches" b ON b."id" = a."branchId"
    WHERE a."userId" = d."createdById" AND b."isActive"
    ORDER BY b."createdAt" LIMIT 1),
  (SELECT "id" FROM "branches" WHERE "isActive" ORDER BY "createdAt" LIMIT 1)
);

UPDATE "acceptance_letters" d SET "branchId" = COALESCE(
  (SELECT a."branchId" FROM "user_branch_assignments" a
     JOIN "branches" b ON b."id" = a."branchId"
    WHERE a."userId" = d."createdById" AND b."isActive"
    ORDER BY b."createdAt" LIMIT 1),
  (SELECT "id" FROM "branches" WHERE "isActive" ORDER BY "createdAt" LIMIT 1)
);

ALTER TABLE "proformas" ADD CONSTRAINT "proformas_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_letters" ADD CONSTRAINT "acceptance_letters_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "proformas_branchId_idx" ON "proformas"("branchId");
CREATE INDEX "tenders_branchId_idx" ON "tenders"("branchId");
CREATE INDEX "acceptance_letters_branchId_idx" ON "acceptance_letters"("branchId");
