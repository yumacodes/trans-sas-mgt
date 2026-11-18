-- Pounds sterling can now be used on expenses and price schedules, as on the other documents.
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_currency_check";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_currency_check" CHECK ("currency" IN ('USD', 'GHS', 'GBP'));
ALTER TABLE "tenders" DROP CONSTRAINT "tenders_currency_check";
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_currency_check" CHECK ("currency" IN ('USD', 'GHS', 'GBP'));
