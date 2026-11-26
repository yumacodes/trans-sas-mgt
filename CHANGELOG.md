# Changelog

## 2026-11-26

### What you need to do

1. **Give your social media workers the Social Media role** under Admin > Users. It shows only the Social Media tab: no sales, clients or finance.
2. **Connect YouTube and Meta** if you want figures pulled automatically: add `YOUTUBE_API_KEY` and `META_ACCESS_TOKEN` to the `trans-sas-mgt-api` project in Vercel and redeploy. The README's "Social media" section explains how to get each one for free. Until then, figures can be recorded by hand.
3. **Add your accounts** in Social Media > Add account.

### What changed

- **New Social Media tab** (under Communication).
  - **Overview:** followers across all accounts and their change, posts published, likes and views for the last 7, 30 or 90 days or 12 months; a followers-over-time chart with one line per account; the most liked recent posts.
  - **Accounts:** each account's followers, change over 7 and 30 days, posts tracked and when the figures are from. Record figures, Sync now, History, Edit, Archive.
  - **Posts & videos:** every tracked post with its views, likes, comments and shares, sortable and filterable by platform and account. Open one to see its figures charted day by day.
- **Automatic pulls** for YouTube, Facebook Pages and Instagram every morning (with the other daily jobs) and on **Sync now**, including each account's 50 newest posts. A failed pull says why (for example "the Meta access token has expired") on the account.
- **By hand** for TikTok, X and LinkedIn, or any account: record the figures for a day; recording the same day again replaces it, and filling in an old day never overwrites today's.
- New permissions `social.read` and `social.manage`, and a **Social Media** role holding only those. Admins have both.
- Database change `20261126000000_social_media` adds the social media tables.

## 2026-11-19

### What you need to do

1. **Set prices on the website products.** The 24 products from the website (item codes like `CLOSED-INFANT-INCUBATOR`) are in Stock Items with a selling price of 0, because the old website listed none. A website request's proforma uses these prices, so set them in Stock Items.
2. **Choose which branch gets website requests.** For now they go to the oldest active branch, which is "[DEMO] Kumasi Branch". Renaming the branches is enough if that branch is the right one.
3. **Deploy the API with `WEBSITE_ORIGINS`.** In the `trans-sas-mgt-api` Vercel project, add `WEBSITE_ORIGINS` (Production) with the website's address, for example `https://www.trans-sas.com`, then redeploy. Until then the live website can't reach the system.
4. **Delete the test request.** Proforma PF-2026-00005 ("[TEST] Website connection check") was sent while testing. It is a draft, so Delete in its three-dots menu removes it.

### What changed

- **The public website is connected.** It lists the stock items marked **Show on website** (only while active and approved), with their photos. It never shows prices, costs or stock levels.
- **A customer's request from the website becomes a draft proforma**, priced from Stock Items' selling prices on the server, with the customer's details, delivery choice and note. Everyone who can manage proformas (in that branch, or across all branches) gets a notification that opens it. The proforma is marked **Website** in the Proforma list, and a new Source filter shows only website requests. "Prepared by" reads "Website" until someone edits it; the first person to save it becomes its preparer.
- **Stock items have a "Show on the website" switch** in the item form, and a Website badge in the list. Existing items stay hidden until switched on.
- **Resending a request can't duplicate it**: each form carries a one-time key and a resend returns the same reference. Requests are limited to 10 an hour from one address and 50 products each.
- **New command:** `pnpm --filter api website:import` adds the website's product list (`apps/api/scripts/data/website-catalogue.json`) to Stock Items with photos. It skips item codes that already exist, so it is safe to run again.
- Database change `20261119000000_website_requests` is applied.

## 2026-11-18

- **Sidebar tabs open instantly.** After sign-in the app quietly downloads every page you can open and the first page of its table, one at a time while the browser is idle. Hovering or focusing a sidebar link refreshes that page's data before you click. The API now runs in Vercel's Paris region (`cdg1`), next to the Supabase database in `eu-west-3`, which cuts every request's round trip.
- **PDF header shows the Trans-SAS mark (no wordmark) beside the company name**, on a white tile, with the name and tagline centred next to it. The watermark is smaller, lighter and centred. Saving now shows a centred "Saving..." spinner window.
- **Every downloadable PDF carries a TRANS-SAS watermark** (faint, diagonal, behind the content) on every page.
- **The company logo is in the PDF header** (the uploaded PNG or JPEG, otherwise the Trans-SAS logo), and the company name always stays on one line, shrinking the font slightly when it is long.
- **Pounds added to the currencies** (British pounds, GBP) for proformas, price schedules and expenses, including amounts in words. Database change `20261118000000_gbp_currency` is applied.
- **Fast spinners:** a small "Saving..." spinner shows at the top while any save is running in the background, and tables show a quick sweep bar and a faster refresh spinner whenever they reload.

## 2026-11-13

- **The search bar is removed from the top bar.** Each table keeps its own search box.
- **Layout fits every screen size.** The sidebar is narrower (14rem, 15rem on wide screens), starts collapsed on screens under 1280px on a first visit, and collapses to an icon strip and expands again with the button at the left of the top bar (it remembers your choice). Tables now fit the width of the page: columns share the space and long text wraps, instead of scrolling sideways. The page itself no longer scrolls horizontally, and the item rows in the proforma, sale, price schedule, purchase and waybill forms switch to a stacked layout until the window is wide enough for one row.
- **Communication has a Send message button.** It opens a window with a "Send to" dropdown (Employees, Clients or Branch admins), the filters for that group, the recipient count and review list, a subject and a large message box with merge fields. The saving animation shows while it sends. Messages go out over SMTP, so Gmail works once you set it up: turn on 2-Step Verification, create an App password, then in the `trans-sas-mgt-api` project on Vercel set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` and `MAIL_FROM_EMAIL` (the Gmail address) and `SMTP_PASS` (the app password), redeploy, and press "Test the mail server" on the Communication page. Until then the button is disabled and the page explains what is missing.
- **PDF buttons reorganised.** The Close button is gone from the record windows (the X in the corner stays). In every PDF record window, Print is now the blue button and the separate Download/Generate Invoice button is gone. Download is in each table's three-dots menu instead: Download PDF for proformas, price schedules, sales, waybills, purchases, acceptance letters and expenses, and Download receipt for payments. The Generate Invoice buttons and their pickers on the Proforma and Expenses pages are removed.
- **New users get the default password 123456789 and must change it at first sign-in.** The New user form no longer asks for a password. On first sign-in the user sees only a "Choose your password" screen, and the server blocks every other request until a new password is saved. The default can't be kept as the new password. "Set temporary password" is now "Reset to default password", which puts the default back and asks for a new one at the next sign-in. Database change `20261113000000_must_change_password` is applied.
- **Generate Invoice now previews the PDF.** Pick a proforma and see the invoice as it will print, with Print and Download buttons on the preview.
- **The Duplicate button is gone from the proforma, sale and price schedule windows.**
- **Delete in every table's three-dots menu.** Proformas, price schedules, sales, waybills, purchases, acceptance letters, expenses, suppliers, clients and stock items. The row disappears at once. The server refuses, and says why, when the record is already in use: a proforma or sale past draft, an approved expense, a client with documents, a stock item with stock history. Those should be cancelled, archived or deactivated instead. Every delete is recorded in the audit log.
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
