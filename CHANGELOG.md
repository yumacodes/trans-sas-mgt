# Changelog

## 2026-11-13

- **The letterhead now has the tagline and full contact details.** Company Profile has a new Tagline field. The company details were filled in from your preview PDF, so every PDF prints the name, tagline, P.O. Box, six phone numbers and email.
- **Every PDF uses the original letterhead design again.** Proforma, price schedule, acceptance letter, waybill, receipt, expense invoice and reports now share the original deep-blue header band and colours, with the document type at the top right. Only the body tables differ. An earlier change had lightened the blue and shrunk the header on landscape documents.
- **The charted dashboard is back, with real figures.** It keeps the original design: key figure cards with trend lines, the revenue chart, category cards, inventory health and the activity stream.
  - Every number comes from your records. Sales value, payments received, outstanding balances and stock availability are compared with the same days of the previous period.
  - The chart plots revenue (confirmed sales, excluding tax) and payments received for the last 12 months.
  - Admins choose All branches or one branch at the top; staff see their own branch.
  - Month, Quarter and Year switch the period.
  - Amounts are in the company's default currency; sales in other currencies are named, not added in.
- **"Coming up" replaces the old sample schedule.** It lists tender deadlines, payments falling due and expected deliveries for the next 14 days, plus anything overdue.
- The simpler number-card dashboard has been removed.

## 2026-11-11

### What you need to do

1. **Unlock GitHub Actions.** The automatic checks have never run: GitHub refuses to start them because the account is "locked due to a billing issue". Fix it under GitHub > Settings > Billing. Until then, every check is run locally before each push.
2. **Turn on the daily scheduled jobs.** In Vercel, open the `trans-sas-mgt-api` project > Settings > Environment Variables and add `CRON_SECRET` (Production) with any long random string. Then redeploy the API. Without it the daily jobs don't run.
3. **Fix the letterhead.** Admin > Company Profile still says "[DEMO] Medical Supplies Ltd", and every PDF prints it.
4. **Rename the branches.** They are called "[DEMO] Head Office" and "[DEMO] Kumasi Branch". Use Admin > Branches.
5. **Assign a branch to every non-admin user**, under Admin > Users > Roles & branches. Users without a branch see no branch data, and accountants are now limited to their branches too.
6. **Set an expense approval limit if you want one**, under Admin > Company Profile. Expenses above it then need an administrator.
7. **Pull on your laptop:** `git pull`, then `pnpm install` (a new package was added), then `pnpm dev`.

### What changed

**Branches and access**
- Staff see only their branch's documents; admins see everything. Records from another branch are treated as not found.
- The dashboard shows real figures, with a branch dropdown for admins (All is the default).
- Accountants no longer see all branches by default.

**Sales, delivery and money**
- New Sales, Way Bill and Payment modules.
  - Confirming a sale takes stock off once. Cancelling it returns the stock.
  - A waybill for a sale only records delivery. A waybill with no sale takes stock off when dispatched.
  - Payments can be partial or full, can't overpay, and are reversed rather than edited.
- New Purchase and Suppliers modules. Stock rises only when goods are received, and only by what arrived.
- One-click conversions:
  - accepted proforma or awarded tender to sale
  - sale to waybill
  - awarded tender or delivered waybill to acceptance letter
  - low stock to a draft purchase
- Duplicate a proforma, price schedule or sale.
- Forms show what a client last paid for an item.

**Notifications and approvals**
- Bell in the top bar, covering approvals, payments, deliveries, low stock, failed emails, tender deadlines, overdue sales and registration renewals.
- New stock items from non-admins wait for approval before they can go on documents.
- Pending expenses can be approved several at once.

**Daily jobs** (once `CRON_SECRET` is set)
- Expire old proformas.
- Remind about tender deadlines, overdue sales and registration renewals.
- Sweep low stock.
- Check stock balances against their history.
- Clean up old records.
- Monday summary email, when email is configured.

**Daily work**
- Global search in the top bar. Press `/` to focus it.
- Email any document with its PDF, and email a receipt as you record a payment.
- Attach PDFs and images to any record.
- Excel import for stock items, clients and opening stock. Every row is checked first, and rows with problems can be downloaded.
- If a save fails, its form reopens with what you typed.
- No pop-up toasts. Changes show immediately and save in the background; only failures are shown.

**Reports**
- 13 real reports replace the sample pages: Income Statement, Sales, Payments, Expenses, Tenders, Stock (with valuation), Stock Movement, Low Stock, Purchases, Clients, Outstanding Balances, Branch Performance and Tax Summary.
- Each can be exported to Excel or PDF, or printed.
- Totals are per currency and never mixed.

**Safety and setup**
- The API deploys automatically when pushed.
- `README.md` explains setup.
- Automated tests cover the stock, payment, approval, import and access rules: 111 API and 44 web tests, all passing.

### Database changes (already applied to the live database)

- `20261111000000_document_branches`
- `20261111000100_sales_waybills_payments`
- `20261111000200_notifications_stock_approval`
- `20261111000300_suppliers_purchases`

### Not done yet

These need your decision, an account, or testing with you.

- **Two-factor sign-in for admins.** Not shipped, because it can't be tested end to end here, and a mistake could lock the only admin out.
- **Separate test database, Sentry error monitoring, automatic backups.** Each needs an account or a paid plan.
- **Bank statement import.** Needs a sample statement file from your bank.
- **Exchange rates between currencies.** Needs a decision on whose rates to use.
- **Saved item bundles and offline sending.** Not built. A failed save can already be retried from the error dialog.
- **Barcode scanning.** Not built as a feature. A USB scanner should work in the search and item boxes, because it types the code, but this hasn't been tested with a real scanner.
- **The new screens haven't been clicked through in a browser.** Please try each one, and check the reports once real data exists.
