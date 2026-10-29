-- Integrity rules, search indexes and security hardening that Prisma's schema
-- language cannot express. See docs/database.md for the reasoning behind each rule.

-- ───────────── CHECK constraints ─────────────

ALTER TABLE "company_profile"
  ADD CONSTRAINT "company_profile_singleton_true" CHECK ("singleton" = TRUE),
  ADD CONSTRAINT "company_profile_currency_iso" CHECK ("defaultCurrency" ~ '^[A-Z]{3}$');

ALTER TABLE "document_sequences"
  ADD CONSTRAINT "document_sequences_next_positive" CHECK ("nextValue" >= 1),
  ADD CONSTRAINT "document_sequences_year_valid" CHECK ("year" = 0 OR "year" BETWEEN 2000 AND 2999);

ALTER TABLE "stock_items"
  ADD CONSTRAINT "stock_items_selling_price_nonneg" CHECK ("sellingPrice" >= 0),
  ADD CONSTRAINT "stock_items_purchase_cost_nonneg" CHECK ("purchaseCost" IS NULL OR "purchaseCost" >= 0),
  ADD CONSTRAINT "stock_items_reorder_nonneg" CHECK ("reorderLevel" >= 0),
  ADD CONSTRAINT "stock_items_warranty_nonneg" CHECK ("warrantyMonths" IS NULL OR "warrantyMonths" >= 0),
  ADD CONSTRAINT "stock_items_sku_upper" CHECK ("sku" = upper("sku"));

ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_reserved_nonneg" CHECK ("quantityReserved" >= 0);

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_nonzero" CHECK ("quantity" <> 0),
  ADD CONSTRAINT "stock_movements_unit_cost_nonneg" CHECK ("unitCost" IS NULL OR "unitCost" >= 0),
  -- The sign must agree with the movement direction.
  ADD CONSTRAINT "stock_movements_direction" CHECK (
    ("type" IN ('opening_balance', 'purchase_receipt', 'sale_return', 'adjustment_in', 'transfer_in') AND "quantity" > 0)
    OR ("type" IN ('sale_issue', 'adjustment_out', 'transfer_out') AND "quantity" < 0)
  );

ALTER TABLE "client_registrations"
  ADD CONSTRAINT "client_registrations_validity" CHECK ("validUntil" IS NULL OR "validUntil" >= "registeredOn");

ALTER TABLE "file_records"
  ADD CONSTRAINT "file_records_size_positive" CHECK ("sizeBytes" > 0);

-- ───────────── Normalised identifiers ─────────────
-- Emails are stored lower-cased (enforced here) so the plain unique index on
-- user_profiles.email is effectively case-insensitive.
ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_email_lower" CHECK ("email" = lower("email"));

-- ───────────── Append-only ledgers ─────────────

CREATE OR REPLACE FUNCTION reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; record a correcting entry instead', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

CREATE TRIGGER "stock_movements_append_only"
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();

-- ───────────── Row Level Security ─────────────
-- The browser never queries these tables: all access goes through the API, which
-- connects as the database owner and enforces authorisation itself. Enabling RLS with
-- no policies, and revoking table privileges from Supabase's anon/authenticated roles,
-- closes the auto-generated Data API (PostgREST) over these tables as defence in depth.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_profiles', 'roles', 'permissions', 'role_permissions', 'user_roles',
    'user_branch_assignments', 'audit_logs', 'idempotency_records', 'company_profile',
    'document_sequences', 'branches', 'file_records', 'clients', 'client_registrations',
    'stock_categories', 'stock_items', 'stock_balances', 'stock_movements'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END
$$;
