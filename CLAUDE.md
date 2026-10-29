# MASTER DEVELOPMENT PROMPT — MEDICAL EQUIPMENT BUSINESS MANAGEMENT SYSTEM

## 1. ROLE AND EXPECTATIONS

Act as a senior full-stack software engineer, enterprise application architect, database designer, UI/UX designer, security engineer, and QA engineer.

Your task is to design and develop a modern, production-oriented business management web application for a company that sells medical equipment. The company currently operates an older software system and needs a modern replacement that improves operational efficiency, financial visibility, inventory management, document processing, and internal business workflows.

Build an integrated business management system rather than a collection of disconnected pages.

You are responsible for ensuring that:
- The interface is professional, consistent, and business-oriented.
- Every implemented form, button, menu, table action, and business workflow functions correctly.
- Data is stored persistently in the database and is not merely simulated in frontend state.
- Authentication, role-based authorization, and session management are secure.
- The database is normalized appropriately and maintains clear relationships between business records.
- Users receive understandable feedback when operations succeed, fail, or require additional information.
- Financial, inventory, and business records remain consistent across related modules.
- The application is maintainable, scalable, testable, and suitable for deployment.

Do not create a visually impressive prototype that uses fake data, placeholder buttons, or nonfunctional interactions as if it were a complete application.

---

## 2. BUSINESS CONTEXT AND OBJECTIVES

The application will be used internally by a company that sells medical equipment.

Its primary objectives are to:

1. Centralize business operations in one application.
2. Manage clients, registered clients, sales, quotations/proforma documents, tender pricing, delivery documentation, acceptance documentation, and payments.
3. Manage medical equipment inventory, stock movements, purchases, and branch-level stock where applicable.
4. Track business expenses and tender-related incoming and outgoing transactions.
5. Provide useful financial and operational reports.
6. Manage company information, branches, staff accounts, and access permissions.
7. Support uploading and downloading Excel spreadsheets and PDF documents.
8. Make business activities traceable through document references, transaction records, and activity logs.
9. Present a reliable, professional user experience suitable for daily business operations.

Treat the application as an interconnected business management system. For example, a sale may involve a client, one or more stock items, a proforma document, a delivery waybill, an acceptance letter, payments, and financial reporting.

Do not assume all business processes have already been fully defined. Implement sensible, configurable defaults where necessary, isolate business rules so they can be changed later, and avoid hardcoding uncertain company policies.

---

## 3. REQUIRED TECHNOLOGY STACK

Use the following technologies as the foundation of the project.

### Frontend
- React.js
- Vite.js
- TypeScript preferred for maintainability and stronger type safety.
- React Router for routing.
- A consistent component system for tables, dialogs, forms, navigation, notifications, and loading states.
- A reliable form validation solution.
- A suitable data-fetching and server-state management approach.
- A maintained charting library for dashboards and reports where needed.
- A spreadsheet library for supported Excel imports and exports.
- A maintained PDF generation or document-rendering solution where needed.

Choose compatible, maintained packages and avoid unnecessary dependencies.

### Backend and database
- Supabase PostgreSQL as the primary relational database.
- Supabase Auth for identity management, login, and session handling.
- Supabase Storage for uploaded business documents and generated files where appropriate.
- Prisma ORM for server-side database access, schema modeling, and migrations.
- A secure server-side API layer using an appropriate Node.js framework, such as Express, unless an existing backend architecture is already established.

**Architecture requirement:** React must not instantiate or use Prisma directly in the browser. Prisma must run on the server. The frontend communicates with protected backend endpoints, while Supabase Auth provides identity and session management.

Use the Supabase PostgreSQL connection configuration recommended for the hosting environment. Consider connection pooling and appropriate Prisma connection settings.

### Important implementation rules
- Keep private database credentials, service-role keys, and other secrets on the server.
- Never expose the Supabase service-role key or database credentials in frontend environment variables.
- Use environment variables and supply an `.env.example` containing placeholders, not real secrets.
- Document the required Supabase configuration, storage buckets, database setup, and deployment configuration.
- Avoid mixing multiple approaches to data access without a clear architectural reason.
- If the existing project already contains functional infrastructure, inspect it before introducing replacement technologies.

---

## 4. PROJECT INSPECTION AND IMPLEMENTATION WORKFLOW

Before modifying code, inspect the existing repository.

Review:
- The directory structure.
- `package.json` and existing dependencies.
- Current React and Vite configuration.
- Existing routes, components, and styles.
- Authentication implementation.
- Existing database schema and Prisma configuration.
- Supabase clients, environment variables, and storage integration.
- Existing API endpoints, if any.
- Current tests and development scripts.

Then establish a short implementation plan and identify any existing functionality that should be preserved.

Do not unnecessarily replace working code or recreate a project from scratch.

Develop the system incrementally in coherent phases:

**Phase 1 — Foundation**
- Project configuration and architecture.
- Design tokens and reusable UI components.
- Authentication and protected routing.
- Role-based access control.
- Application layout and navigation.
- Database schema and migration strategy.

**Phase 2 — Core business data**
- Company profile and branches.
- Users and permissions.
- Clients and registered clients.
- Stock items and inventory foundations.

**Phase 3 — Transactional workflows**
- Proforma documents.
- Tender price schedules.
- Sales.
- Waybills.
- Acceptance letters.
- Payments.
- Purchases and stock movements.
- Tender-related records and expenses.

**Phase 4 — Reporting and document processing**
- Dashboards and reports.
- PDF generation and downloads.
- Excel import and export.
- File management and document attachments.

**Phase 5 — Hardening**
- Security review.
- Integration and workflow testing.
- Error handling.
- Performance improvements.
- Deployment documentation.

The phase order can be adjusted when dependencies require it, but maintain a working application throughout development.

At the end of each phase, verify that the implemented features work before moving forward.

Do not stop after generating a plan or creating the interface. Continue implementation within the available environment, and clearly report any genuine blockers.

---

## 5. VISUAL IDENTITY AND USER EXPERIENCE

Create a sophisticated, restrained enterprise interface.

The design should feel like established business software used by finance departments, sales teams, inventory managers, and administrators.

### Design principles
- Professional and business-oriented.
- Modern, clean, organized, and easy to scan.
- Minimal decorative elements.
- Strong typography hierarchy.
- Consistent spacing and alignment.
- Clear table layouts.
- Moderate use of glass-like surfaces on selected summary cards and dialogs.
- Restrained shadows, subtle borders, and carefully chosen accent colors.
- Clear visual distinction between primary actions, secondary actions, destructive actions, and status indicators.
- Excellent readability for users who spend several hours working in the application.

Avoid playful illustrations, excessive gradients, exaggerated animations, oversized dashboard cards, and unnecessary glassmorphism.

Use a restrained enterprise palette, such as deep navy or charcoal, neutral gray, white, and one clear accent color. Establish design tokens for colors, typography, spacing, borders, radii, shadows, and focus states.

The interface must feel like one cohesive application. Do not let individual pages develop unrelated design styles.

### Responsive behavior
Optimize for desktop business workflows first, while ensuring that the application remains usable on tablets and smaller mobile screens.

On smaller screens:
- Adapt the sidebar into a suitable collapsible navigation pattern.
- Preserve essential record actions.
- Prevent forms and tables from breaking the page layout.
- Use horizontal table scrolling or a suitable compact alternative where necessary.
- Maintain appropriate touch targets and readable text.

### Accessibility
Use semantic HTML, keyboard-accessible controls, visible focus states, appropriate dialog behavior, descriptive labels, and accessible error messages. Do not use color alone to communicate transaction status.

---

## 6. APPLICATION LAYOUT

Create a consistent authenticated application shell.

### A. Sidebar

Implement a fixed, independently scrollable sidebar on desktop.

It should:
- Contain the company identity or logo area.
- Display navigation labels and suitable icons.
- Clearly highlight the current page.
- Support expandable and collapsible nested menu sections.
- Preserve a clear navigation hierarchy.
- Hide or disable inaccessible sections according to the authenticated user's permissions.
- Remember or preserve useful menu state where appropriate.

The sidebar must not become an excessively long, visually unstructured list.

### B. Top navigation bar

Create a persistent top bar containing:
- Current page title or breadcrumb.
- Notifications icon with an unread count.
- Current user's name and profile information.
- User avatar or initials.
- Profile dropdown.
- Account settings where implemented.
- Change-password or sign-out actions where applicable.
- Other relevant shortcuts if they have a real business purpose.

The profile dropdown must close appropriately and its actions must work.

### C. Main content region

The content area must:
- Have consistent page padding.
- Support page titles and descriptive subtitles.
- Show primary actions in predictable locations.
- Display loading, empty, error, and success states.
- Handle large tables and long forms gracefully.
- Preserve relevant filters and search terms where useful.
- Avoid unnecessary full-page reloads for ordinary operations.

### D. Glass-style business cards

Use subtle translucent or glass-like treatments for selected summary cards, profile dialogs, and important information panels.

Keep text contrast high and maintain the application’s business-oriented appearance.

### E. Central operation feedback

When a user submits an important operation, display a compact, centered feedback dialog or overlay where appropriate.

The lifecycle should be:

1. Show a spinner while the operation is processing.
2. Prevent accidental duplicate submissions.
3. Show a success checkmark only after the server confirms success.
4. Display a brief success message.
5. Use a restrained, smooth animation when transitioning from loading to success.
6. Close or transition away appropriately without requiring an unnecessary page refresh.

If an operation fails, show an understandable error message and a sensible next action. Do not display a success checkmark for a failed or unconfirmed operation.

Use inline validation for field-level problems and use nonblocking notifications for minor actions where more appropriate. Do not force a centered modal for every small interaction.

Animations should be brief, professional, accessible, and respectful of reduced-motion preferences.

---

## 7. AUTHENTICATION, SESSIONS, AND ACCESS CONTROL

Implement secure, role-based authentication using Supabase Auth.

The initial roles are:

- **Admin**
- **Accountant**
- **Support**

Structure the permission system so additional roles can be introduced without redesigning the entire application.

### Authentication requirements
- Login page with a professional business design.
- Properly labeled email or username and password fields, using a coherent authentication identifier strategy.
- Password visibility toggle.
- Input validation.
- Clear loading and failure states.
- Appropriate handling of invalid credentials.
- Logout.
- Session persistence and restoration.
- Session expiration handling.
- Protected application routes.
- Password reset or recovery flow.
- Handling of expired, invalid, or revoked sessions.
- Redirect behavior that preserves the user's intended destination where appropriate.
- No accidental display of protected pages while authentication status is unresolved.

Do not store passwords in application tables or implement a second password system alongside Supabase Auth.

Use Supabase Auth user identifiers to associate authenticated users with application profile and permission records.

### Authorization requirements

Authorization must be enforced server-side, not just by hiding frontend menu items.

Implement:
- Route-level access restrictions.
- API-level permission checks.
- Record-level authorization when necessary.
- Sidebar and action visibility based on permissions.
- Server-side verification of the identity and role associated with each request.
- Secure administrative operations.
- Protection against users changing their own roles through client requests.

Use a maintainable role-and-permission model. Prefer permissions such as `clients.read`, `clients.create`, `clients.update`, `inventory.read`, `inventory.adjust`, `payments.record`, `reports.view`, and `users.manage`.

### Initial role defaults

Use the following as a starting configuration rather than an assumption about the company's finalized policies.

**Admin**
- Full access to authorized company-wide functions.
- Manage users, roles, permissions, branches, and company settings.
- Access all business modules and reports.
- View relevant audit records.

**Accountant**
- Access financial records, payment workflows, expenses, income statements, and authorized transactional documents.
- Create or update financial records according to configured permissions.
- Access relevant client and sales information.
- No user administration or security configuration by default.

**Support**
- Access authorized client records and operational documentation.
- Assist with client information and business process tracking.
- Access support-relevant proforma, delivery, acceptance, or sales records according to assigned permissions.
- No unrestricted access to sensitive financial functions, user administration, or permission configuration.

Make the final permissions configurable by an administrator with appropriate authority. Keep the initial defaults conservative.

---

## 8. REQUIRED SIDEBAR MODULES AND PAGE REQUIREMENTS

Implement the following navigation structure.

### 8.1 Dashboard

Create a business dashboard that summarizes relevant business activity.

Include configurable metric cards where the underlying data supports them, such as:
- Total clients.
- Registered clients.
- Current stock item count.
- Inventory value, where a reliable valuation method is configured.
- Sales totals for a selected period.
- Outstanding balances.
- Payments received.
- Expenses.
- Tender activity.
- Low-stock items.
- Recent transactions.
- Recent business activities.
- Pending or overdue documents, where applicable.

Provide appropriate date filters and charts for sales, income, expenses, and other meaningful metrics.

Each metric must have a defined calculation. For example, payments received must not be confused with total sales or revenue recognized.

Dashboard cards should link to relevant filtered pages when appropriate.

Do not display invented values or hardcoded sample statistics as actual business data. Use a clear empty state when the database has no records.

### 8.2 Proforma

Build a complete proforma invoice or quotation management module.

Support:
- Creating a proforma document.
- Selecting an existing client.
- Adding multiple equipment line items.
- Entering quantities, unit prices, discounts, and applicable taxes where configured.
- Automatic subtotal and total calculations.
- Document numbering.
- Dates and validity periods.
- Notes and terms.
- Draft, issued, accepted, rejected, expired, or other justified statuses.
- Viewing and editing records according to permissions and lifecycle state.
- Searching, filtering, sorting, and pagination.
- PDF generation.
- PDF download and printing.
- Related sales and payment references where applicable.

Validate stock availability and client information when required by the configured business workflow.

Do not automatically treat a proforma document as a completed sale or recognized revenue.

### 8.3 Tender Price Schedule

Create a tender pricing module that supports the preparation and tracking of equipment pricing schedules.

Include:
- Tender or opportunity reference.
- Client or procuring organization.
- Relevant dates and deadlines.
- Equipment line items.
- Quantities.
- Unit prices and calculated totals.
- Discount and tax rules when configured.
- Supporting documents.
- Tender status.
- Notes.
- PDF or spreadsheet output.

Provide useful ways to group line items, review prices, detect incomplete information, and prepare a final price schedule.

Make relationships between tenders, tender-related transactions, clients, stock items, and resulting sales explicit when such relationships are required by the business.

Do not assume a tender has been awarded merely because its price schedule exists.

### 8.4 Sales

Implement a transactional sales module.

Support:
- Creating a sale.
- Selecting a client.
- Selecting one or more stock items.
- Recording quantities, prices, discounts, applicable taxes, and totals.
- Branch selection.
- Document numbering.
- Sale date and relevant delivery details.
- Status tracking.
- Links to related proforma and tender records where applicable.
- PDF invoice or sales documentation.
- Search, filtering, sorting, and pagination.
- Viewing a complete sales record.
- Managing cancellations or corrections through controlled, auditable operations.

The exact sales workflow should reflect an explicit configured business policy. If a sale affects inventory, stock movements must be recorded consistently.

A sale must not be duplicated because a user clicks the submit button multiple times or retries a failed request.

Use appropriate transaction handling and idempotency for critical operations.

### 8.5 Way Bill

Create a waybill or delivery documentation module.

Support:
- Generating a waybill linked to an applicable sale or authorized delivery record.
- Client and delivery address information.
- Branch or dispatch information.
- Items, quantities, and references to the originating sale.
- Delivery date.
- Carrier or recipient information when required.
- Status tracking.
- Delivery notes.
- PDF generation and printing.
- Search and filtering.
- Related records navigation.

Maintain a clear distinction between a waybill being created, goods being dispatched, and delivery being confirmed.

Do not reduce stock twice when waybill status changes. Define precisely which business event causes an inventory movement.

### 8.6 Stock Items

Build a complete stock item catalog for medical equipment.

Recommended fields include:
- Unique item or SKU code.
- Item name.
- Description.
- Category.
- Brand or manufacturer.
- Model.
- Unit of measure.
- Purchase cost, with appropriate access restrictions.
- Selling price.
- Reorder threshold.
- Trackable serial number or batch settings where applicable.
- Active or inactive status.
- Creation and modification timestamps.

Support:
- Creating, viewing, and updating items.
- Searching by name, SKU, brand, model, and category.
- Sorting, filters, and pagination.
- Item detail views.
- Stock availability by branch.
- Stock movement history.
- Low-stock indicators.
- Appropriate deletion restrictions.
- Import and export of supported item fields.

Use durable identifiers and prevent duplicate SKU codes.

Medical equipment can require serial-number tracking, batch tracking, warranty information, or expiry information for certain products. Implement these capabilities only where relevant to the products and company workflow, and make the data model extensible.

### 8.7 Clients

Implement a client and customer relationship module.

Suggested fields:
- Client code.
- Client or organization name.
- Contact person.
- Email address.
- Telephone number.
- Billing address.
- Delivery address.
- Organization type.
- Tax or registration identifiers where needed.
- Notes.
- Active or inactive status.
- Associated branch or account owner where applicable.

Support:
- Creating and editing client records.
- Viewing complete client details.
- Searching, sorting, filtering, and pagination.
- Viewing related proformas, sales, tenders, waybills, acceptance letters, and payments.
- Viewing communication and activity history where implemented.
- Exporting permitted client data.
- Safe archival rather than destructive deletion when related transactions exist.

### 8.8 Acceptance Letter

Create an acceptance letter management module.

Support:
- Creating an acceptance letter linked to the relevant client and originating business transaction.
- Document reference number.
- Acceptance date.
- Equipment or service references where required.
- Letter content and editable template fields.
- Authorized signatory information.
- Status tracking.
- PDF generation and download.
- Printing.
- Viewing related sale, tender, waybill, and client records.

Do not represent a letter as signed or accepted unless the required action has actually taken place.

Keep generated documents linked to their underlying business records.

### 8.9 Payment

Implement payment management with clear financial traceability.

Support:
- Recording a payment against an applicable sale, invoice, or receivable.
- Client information.
- Payment reference.
- Transaction date.
- Amount and currency.
- Payment method.
- External reference where relevant.
- Notes and supporting documents.
- Payment status.
- Outstanding balance calculation.
- Partial payments.
- Full payments.
- Payment history for each related transaction.
- Receipts in PDF format where appropriate.

Implement validation to prevent:
- Invalid or nonpositive payment amounts.
- Duplicate payment records.
- Unauthorized modifications.
- Accidental overpayment unless a specifically defined business policy allows it.
- Inconsistent balances when multiple users record payments concurrently.

Do not assume every tender payment is automatically a payment from a customer. Keep customer receipts, supplier payments, tender transactions, and expenses conceptually separate.

For accounting-sensitive adjustments, use documented reversal or correction entries rather than silently rewriting historical records.

### 8.10 Registered Clients

Create a dedicated registered-client workflow distinct from the general client directory.

The module should support:
- Registering eligible clients.
- Assigning registration identifiers.
- Recording registration dates and any relevant validity dates.
- Capturing contact and organizational information.
- Tracking registration status.
- Updating registration details according to permissions.
- Searching, filtering, and exporting records.
- Viewing related client activity.

If the company's policy requires converting a general client into a registered client, use a controlled workflow that maintains one consistent identity rather than creating unnecessary duplicate clients.

Keep registration requirements configurable because the precise legal and commercial meaning of registered-client status has not yet been defined.

### 8.11 Expenses

Create an expense management section with the following nested structure:

**Expenses**
- Tender
  - Tender-In
  - Tender-Out

Implement general expense records and tender-related incoming or outgoing transactions with clear distinctions between their business meanings.

Where appropriate, support:
- Transaction reference.
- Related tender or business record.
- Transaction date.
- Counterparty.
- Amount and currency.
- Category.
- Payment method or reference.
- Description.
- Supporting documents.
- Recorded-by information.
- Review or approval status where configured.

Do not force every transaction into the wrong category. For example, incoming funds, customer sales revenue, expense reimbursements, and outgoing supplier payments may require different accounting treatments.

Define what Tender-In and Tender-Out mean according to the company's actual workflow. Initially treat them as separate, configurable transaction classifications rather than making unsupported assumptions about their accounting treatment.

### 8.12 Stock Management

Create the following nested navigation structure:

**Stock Management**
- Stock
- Purchase

#### Stock

Provide:
- Inventory quantities by item and branch.
- Available stock.
- Reserved stock where reservations are implemented.
- Reorder levels.
- Inventory movement history.
- Stock receipts.
- Stock issues.
- Transfers between branches.
- Controlled inventory adjustments.
- Adjustment reasons and authorization.
- Low-stock alerts.
- Stock valuation using an explicitly defined costing method.

Record stock movements through an auditable ledger. Do not allow ordinary form edits to silently change historical quantities.

Prevent negative inventory where prohibited by the configured business policy.

#### Purchase

Create a purchase management workflow supporting:
- Purchase records.
- Suppliers or vendor information.
- Purchase reference numbers.
- Purchase dates.
- Branch receiving the stock.
- Equipment line items and quantities.
- Unit costs.
- Taxes and totals where applicable.
- Supporting purchase orders, invoices, and receipts.
- Purchase statuses.
- Receiving goods into stock.
- Purchase history.
- PDF or spreadsheet exports.

Introduce a supplier/vendor entity if needed to properly represent purchases. A supplier should not be forced into a client relationship merely to reuse an existing table.

A purchase record alone must not increase available stock until the defined goods-receipt event is completed.

Use transactional logic so a completed receipt updates stock and creates the corresponding movement records consistently.

### 8.13 Reports

Create a dedicated Reports section with nested report pages.

At minimum, include:
- Income Statement.
- Sales Report.
- Payment Report.
- Expense Report.
- Tender Report.
- Stock Report.
- Stock Movement Report.
- Low-Stock Report.
- Purchase Report.
- Client Report.
- Outstanding Balances Report.
- Branch Performance Report, if branch-level tracking is enabled.

Support relevant date ranges, branch filters, transaction statuses, and other useful filtering dimensions.

Where appropriate, allow the user to:
- View totals and record counts.
- Drill down into underlying transactions.
- Export filtered results to Excel.
- Download PDF reports.
- Print reports.
- See the time period and filter criteria used to generate a report.

#### Income Statement requirements

Do not create an income statement by simply subtracting every outgoing payment from every incoming payment.

Define financial reporting semantics and document the accounting assumptions. Separate revenue, cost of goods sold, operating expenses, and other configured income or expense categories.

If the system does not implement a complete accounting ledger, clearly identify any report as a management report based on available operational data rather than claiming full accounting compliance.

Reconcile report totals against the underlying transaction records and avoid counting the same financial event more than once.

### 8.14 Admin

Create the following nested navigation structure:

**Admin**
- Company Profile
- Users
- Branches

#### Company Profile

Support maintaining:
- Company name.
- Logo.
- Contact details.
- Company address.
- Business identification information where applicable.
- Default currency.
- Tax and pricing settings where configured.
- Document numbering and templates.
- Other business preferences.

Validate settings before saving them and use them consistently in generated business documents.

#### Users

Support:
- Creating user accounts through a secure Supabase Auth workflow.
- Managing user profile information.
- Assigning authorized roles and permissions.
- Activating or deactivating accounts.
- Associating users with branches where applicable.
- Viewing relevant user activity.
- Resetting access through approved authentication workflows.
- Searching and filtering the user list.

Never store plaintext passwords or allow an ordinary user to alter their own administrative permissions.

Prevent accidental removal of the final active administrator. User deactivation must revoke or otherwise restrict access according to the documented session and authorization design.

#### Branches

Support:
- Creating and editing branches.
- Branch codes and names.
- Branch addresses and contact information.
- Active or inactive status.
- Branch-specific inventory.
- Relevant sales, purchases, expenses, and reports by branch.

If a company has only one branch initially, the implementation should still remain compatible with adding more branches later.

Document whether each business record is global, branch-specific, or shared across branches.

---

## 9. BUSINESS RECORD DETAIL MODALS

When a user clicks a name or relevant identifier in a table, open a professionally designed modal or centered record panel.

Examples include:
- Clicking a client's name opens the client profile.
- Clicking a stock item opens the item detail.
- Clicking a user opens the user profile.
- Clicking a sale reference opens the sales record.
- Clicking a payment reference opens the payment details.

Each modal should display the most relevant information for that record.

Use contextual action buttons, such as:
- Edit.
- View related records.
- Download a PDF.
- Send an email.
- Copy a reference.
- Deactivate or archive, where permitted.
- Delete, where deletion is safe and permitted.

Use tabs or clearly divided sections for long detail views, such as Overview, Related Documents, History, and Attachments.

### Email functionality

Email buttons must connect to a genuine delivery mechanism before they are represented as functional.

Design a secure server-side email integration when email delivery is required. Provide suitable configuration and clear feedback for sending, success, and failure.

Do not simulate an email being sent just because the user clicks the button. If no email provider is configured, show a clear setup or unavailable state.

### Modal behavior
- Close on the close button.
- Support Escape where appropriate.
- Prevent interaction with the background when a blocking dialog is open.
- Maintain keyboard accessibility.
- Avoid accidental data loss when a form has unsaved changes.
- Use confirmation dialogs for destructive or consequential operations.

On smaller screens, use an accessible full-height panel or suitable alternative rather than forcing an oversized desktop dialog.

---

## 10. TABLES, FORMS, AND EVERYDAY INTERACTIONS

Build a reusable data-table component and reusable form patterns.

### Tables must support appropriate combinations of:
- Server-side pagination.
- Sorting.
- Search.
- Filters.
- Row selection where needed.
- Loading indicators.
- Empty states.
- Error states.
- Refresh.
- Column alignment.
- Consistent currency, date, and status formatting.
- Row action menus.
- Permission-aware actions.
- Excel export.
- Optional bulk actions when the business workflow supports them.

Use server-side pagination and filtering for potentially large datasets rather than downloading every record to the browser.

### Forms must support:
- Clear labels.
- Required-field indicators.
- Client-side and server-side validation.
- Helpful validation messages.
- Numeric and date validation.
- Appropriate defaults.
- Dynamic line-item rows for transactional documents.
- Automatic calculations when applicable.
- Unsaved-change handling.
- Duplicate-submit prevention.
- Pending, success, and failure states.

Do not silently discard unsaved information.

### Add and delete operations

Users with the necessary permissions must be able to add records and manage them through the appropriate UI.

However, deletion must respect business data integrity.

- Allow deletion of safe, unused draft records where permitted.
- Prevent hard deletion of records referenced by historical transactions.
- Prefer archival, deactivation, voiding, or reversal workflows for operational and financial records.
- Display a confirmation that identifies the affected record and consequences.
- Never allow deleting a user or record to corrupt historical business records.

All visible controls must have real behavior, and no primary action should be left as an empty callback or decorative button.

---

## 11. EXCEL AND PDF DOCUMENT MANAGEMENT

Support importing and exporting Excel files and PDF documents.

### Excel import

Implement a reusable import workflow:

1. User chooses a supported spreadsheet file.
2. Validate the file extension, size, structure, and permitted content.
3. Parse the file.
4. Display a preview of detected columns and data.
5. Map incoming columns to application fields where appropriate.
6. Validate individual rows.
7. Display valid rows and errors before committing the import.
8. Allow the user to download an error report for rejected rows.
9. Confirm the import.
10. Process the import safely.
11. Show counts for successful records, rejected rows, and duplicates.
12. Record the import activity.

Use the correct foreign keys and transactional operations when importing relational data.

Do not trust client-side validation alone. Validate uploaded data again on the server.

Provide downloadable spreadsheet templates for supported import types.

### Excel export

Exports should:
- Respect the current filters and search criteria where applicable.
- Respect the requesting user's permissions.
- Use meaningful column names.
- Format dates, quantities, and currencies consistently.
- Produce files that open properly in common spreadsheet applications.

### PDF generation

Create professional business documents using consistent company branding.

Support relevant templates for:
- Proforma invoices.
- Tender price schedules.
- Sales documents.
- Waybills.
- Acceptance letters.
- Payment receipts.
- Reports.

Use consistent page sizes, company details, document numbers, client information, line items, totals, dates, and signature areas when relevant.

Generated PDFs must be readable and printable. Do not generate a blank PDF or a PDF that merely contains a screenshot of the current application screen.

### File storage

Use Supabase Storage for appropriate uploaded attachments and generated business documents.

Establish:
- Document categorization.
- File metadata.
- Ownership and record relationships.
- Access-controlled downloads.
- Upload validation.
- Appropriate file-size limits.
- Secure object paths.
- Cleanup procedures for abandoned uploads where appropriate.

Use private storage buckets for confidential business documents unless public access has been explicitly justified.

Never rely on an unguessable filename alone as an authorization mechanism.

---

## 12. DATABASE ARCHITECTURE AND RELATIONSHIPS

Design a normalized PostgreSQL database through Prisma.

Inspect the requirements for every business module before finalizing the schema.

At a minimum, evaluate the need for the following entity groups. These are proposed design entities, not a requirement to create redundant tables that duplicate existing functionality.

### Identity and authorization
- UserProfile.
- Role.
- Permission.
- RolePermission.
- UserRole, if multiple roles per user are needed.
- UserBranchAssignment, if required.
- ActivityLog or AuditLog.

Keep Supabase Auth as the source of authentication identity. Reference its user identifier from application-specific profiles and permissions.

### Company and branches
- CompanyProfile.
- Branch.

### Clients and registration
- Client.
- ClientRegistration or an equivalent registration model when a genuine separate registration lifecycle exists.

Avoid duplicating the entire client identity simply because a client becomes registered.

### Product catalog and inventory
- StockItem or Product.
- StockCategory.
- StockBalance.
- StockMovement.
- StockAdjustment or equivalent adjustment metadata.
- StockTransfer, where transfer workflows require it.
- SerialNumber or Batch, where applicable.

Use an auditable stock-movement model rather than treating the current stock quantity as the only evidence of inventory activity.

### Procurement
- Supplier.
- Purchase.
- PurchaseItem.
- GoodsReceipt or PurchaseReceipt.

Keep supplier identity distinct from customer identity unless the company's business rules explicitly support a shared-party model.

### Proformas and tenders
- Proforma.
- ProformaItem.
- Tender.
- TenderPriceSchedule.
- TenderPriceItem or equivalent line-item structure.

Choose whether a tender and its price schedule are separate entities based on their distinct lifecycles. Avoid duplicate records for the same business concept.

### Sales and delivery
- Sale.
- SaleItem.
- Waybill.
- WaybillItem, if delivery quantities need to be represented independently.
- AcceptanceLetter.

### Financial records
- Payment.
- Expense.
- TenderTransaction or appropriately modeled Tender-In/Tender-Out records.
- FinancialCategory.
- PaymentAllocation, if payments can be allocated across multiple documents.
- AccountingEntry or ledger entities only if the selected accounting design genuinely needs them.

### Documents and notifications
- DocumentAttachment or FileRecord.
- Notification.
- NotificationRecipient or another suitable recipient model when required.
- ImportJob and ImportError when import history needs to be retained.

### Relationships

Define and document cardinality, ownership, delete behavior, and indexing for all relationships.

Examples:
- One client may have many proformas.
- One proforma may contain many line items.
- One stock item may appear in many purchase and sales line items.
- One sale may generate one or more delivery documents if that is part of the business workflow.
- One sale or invoice may have multiple payment records.
- One branch may contain many stock balances.
- One stock item may have many stock movements.
- One purchase may contain many purchase items and may have one or more goods receipts.
- One user may perform many recorded business actions.

Use foreign keys, unique constraints, check constraints where suitable, and indexes for common filters and joins.

Use decimal-compatible database types for monetary amounts. Never use floating-point arithmetic for authoritative financial calculations.

Store dates and timestamps consistently, and distinguish date-only business fields from actual timestamps.

Document currency handling. Do not sum different currencies into one total without an explicit conversion policy.

Define a sensible policy for record ownership, branch scoping, and archived records.

### Prisma requirements

- Keep the Prisma schema organized and understandable.
- Generate and commit migrations as appropriate for the project.
- Avoid editing the production database schema without a controlled migration process.
- Include seed scripts for development and tests.
- Make development seed data clearly distinguishable from real business records.
- Document initial database setup and migration commands.
- Test migration consistency against a clean database.

Do not place real production data or credentials in seed files.

---

## 13. STOCK, PAYMENT, AND BUSINESS TRANSACTION CONSISTENCY

Critical business workflows must use database transactions where multiple changes must succeed or fail together.

Examples include:
- Recording a sale and issuing stock.
- Receiving purchased goods and increasing stock.
- Recording a stock adjustment and its movement history.
- Recording a payment and updating related balances.
- Transferring stock between branches.
- Committing a spreadsheet import that creates multiple related records.

Do not maintain multiple conflicting sources of truth for a stock quantity or financial balance.

If an operational balance is stored for performance, define how it is reconciled against its underlying transactions.

Implement server-side validation of:
- Available stock.
- Quantities and prices.
- Client and document references.
- Payment amounts and allocations.
- Branch permissions.
- Current record status.
- Unique business references.

Protect against concurrent updates with suitable database transactions, constraints, locking, or concurrency-control mechanisms.

For critical mutations, prevent duplicate processing caused by retries, browser refreshes, or repeated clicks.

Define controlled state transitions. For example, a cancelled sale should not leave stock issued and financial balances unchanged unless that is the explicitly intended business rule.

---

## 14. API DESIGN

Build a maintainable API layer organized around business resources and operations.

Use consistent conventions for endpoints, request validation, authorization, error handling, status codes, and response shapes.

Possible resource groups include:
- Authentication context and current user.
- Company profile and branches.
- Users, roles, and permissions.
- Clients and client registrations.
- Stock items, balances, and movements.
- Suppliers and purchases.
- Proformas.
- Tenders and pricing schedules.
- Sales.
- Waybills.
- Acceptance letters.
- Payments.
- Expenses and tender transactions.
- Reports.
- Notifications.
- Document uploads and downloads.

Use REST conventions unless an established project architecture justifies another approach.

Implement server-side pagination and filtering where appropriate.

Validate API input with schemas or equivalent runtime validation. Do not rely on TypeScript types alone to validate untrusted requests.

Centralize shared business rules instead of duplicating them in frontend components and endpoint handlers.

Do not return raw database errors, secrets, or stack traces to users.

Provide internal logging for diagnosis while returning safe, actionable responses to the frontend.

Use accurate HTTP status codes and predictable response formats.

---

## 15. HUMAN-FRIENDLY ERROR HANDLING

Every user-facing error should explain what happened in understandable language.

Examples:

**Invalid login**
“We couldn't sign you in with those details. Check your email and password and try again.”

**Stock shortage**
“There isn't enough stock available to complete this transaction. Review the available quantity before continuing.”

**Duplicate item**
“This item code is already in use. Choose a different code or open the existing item.”

**Missing information**
“Some required information is missing. Review the highlighted fields and try again.”

**Permission restriction**
“You don't have permission to perform this action. Contact your administrator if you believe you need access.”

**Network problem**
“We couldn't complete this request because the connection was interrupted. Check your connection and try again.”

**Failed document upload**
“We couldn't upload this document. Check the file format and size, then try again.”

The exact message should reflect the actual cause whenever possible. Do not show misleading generic errors when a more useful explanation is available.

### Error handling rules
- Highlight invalid fields.
- Preserve entered form data when safe.
- Explain whether an operation was saved.
- Never claim an operation succeeded without confirmation.
- Provide retry options for recoverable failures.
- Prevent accidental duplicate transactions on retry.
- Log technical details securely for developers.
- Never display stack traces, secret values, SQL statements, or sensitive server details to ordinary users.

---

## 16. AUDITABILITY AND BUSINESS HISTORY

Business systems must provide traceability for consequential actions.

Record relevant events such as:
- Creation and modification of important records.
- User and permission changes.
- Stock adjustments and transfers.
- Sales issuance and cancellation.
- Payment recording, corrections, and reversals.
- Purchase receipt.
- Document status changes.
- Import activity.
- Sensitive administrative changes.

An audit event should include relevant information such as:
- Actor identifier.
- Action.
- Entity type and record identifier.
- Timestamp.
- Relevant change summary.
- Correlation or request identifier where useful.

Avoid collecting unnecessary sensitive information or retaining passwords and secrets in logs.

Audit records should not be editable through ordinary application workflows.

Use database constraints, transaction records, and carefully designed reversal mechanisms to maintain trustworthy historical records.

---

## 17. SECURITY REQUIREMENTS

Treat security as a core part of implementation, not a final cosmetic task.

Implement:
- Server-side authorization on every protected operation.
- Appropriate input validation and output handling.
- Least-privilege access.
- Secure secret management.
- Supabase Auth session verification.
- Safe token handling.
- Private file storage where appropriate.
- Protection against unauthorized file access.
- Rate limiting for sensitive or abuse-prone endpoints.
- Safe handling of uploaded files.
- Secure administrative user creation.
- Database constraints and transaction integrity.
- Appropriate CORS and security-header configuration.
- Protection against cross-site scripting and injection vulnerabilities.
- CSRF protections where applicable to the selected authentication and cookie strategy.
- Safe handling of password-reset and invitation flows.
- Logging that does not leak credentials or sensitive business data.

Do not assume that hiding a button or route secures the underlying operation.

If Supabase Row Level Security is used for tables accessible through the Supabase client, create and test policies based on the actual authorization model.

For server-only Prisma access, enforce authorization in the backend and restrict database privileges appropriately. If the system uses privileged connections that bypass RLS, do not treat RLS as a substitute for server-side authorization.

Document the trust boundaries between the browser, backend, Supabase Auth, PostgreSQL, and Storage.

---

## 18. SEARCH, NOTIFICATIONS, AND DAILY WORKFLOW EFFICIENCY

Implement useful search and navigation features.

Where appropriate, support:
- Searching by client name and code.
- Searching by SKU and product name.
- Searching by sale, proforma, waybill, and payment references.
- Filtering records by date, branch, status, and responsible user.
- Navigating between related records.
- Preserving filters when returning from a detail view.
- Clear search and filter controls.

### Notifications

Implement a notification system only for real events.

Potential events include:
- Low-stock alerts.
- Successful or failed imports.
- Business documents awaiting action.
- Relevant payment or delivery updates.
- Authorized administrative events.

Provide unread counts, read/unread status, and a useful destination when a notification is opened.

Respect user roles so confidential information is not exposed through notifications.

Do not create fake notifications merely to populate the interface.

---

## 19. PERFORMANCE AND MAINTAINABILITY

Develop the application with a maintainable component structure.

Separate responsibilities for:
- Reusable UI components.
- Page components.
- Layout components.
- Form schemas.
- API clients.
- Business types.
- Backend routes or controllers.
- Business services.
- Database access.
- Authorization.
- File processing.
- Reporting calculations.

Avoid oversized components that combine presentation, validation, database operations, financial calculations, and authorization in one file.

Use reusable patterns without creating unnecessary abstractions.

Implement:
- Lazy loading for suitable routes.
- Reasonable caching and invalidation.
- Server-side pagination.
- Database indexes for frequent queries.
- Controlled API response sizes.
- Appropriate loading placeholders.
- Clear empty states.
- Avoidance of redundant requests.
- Consistent error boundaries.
- Sensible handling of slower network connections.

Never cache sensitive data in a way that allows one user's information to appear in another user's session.

---

## 20. TESTING REQUIREMENTS

Create a testing strategy that covers the most consequential workflows.

### Frontend tests
Test:
- Login states and protected routes.
- Role-dependent navigation.
- Form validation.
- Modal behavior.
- Table search and filtering.
- Loading, error, and success states.
- Permission-aware actions.

### Backend tests
Test:
- Authentication and authorization.
- Input validation.
- Business rule enforcement.
- Database constraints.
- Transaction handling.
- Duplicate request prevention.
- File access permissions.
- Reporting calculations.

### Integration tests

At minimum, test these end-to-end business scenarios:

**Scenario A — Client and proforma**
1. Create a client.
2. Create a proforma for that client.
3. Add several equipment items.
4. Verify line-item calculations and totals.
5. Generate and download the PDF.
6. Reopen the record and confirm persistence.

**Scenario B — Purchase and inventory**
1. Create a purchase record.
2. Add stock items and quantities.
3. Receive the goods.
4. Verify that stock increases only at the correct stage.
5. Inspect the resulting stock-movement history.

**Scenario C — Sale and delivery**
1. Create a sale against an existing client.
2. Select equipment and quantities.
3. Verify stock and pricing rules.
4. Complete the relevant issuance or delivery event.
5. Confirm that stock is not deducted twice.
6. Generate the waybill and inspect the related records.

**Scenario D — Payments**
1. Record a payment against an authorized transaction.
2. Verify the new outstanding balance.
3. Attempt an invalid or duplicate payment.
4. Verify that it is rejected appropriately.
5. Test partial-payment and full-payment cases.

**Scenario E — Permissions**
1. Sign in as an admin.
2. Sign in as an accountant.
3. Sign in as support.
4. Verify that each role sees the correct navigation.
5. Attempt unauthorized API actions directly.
6. Confirm that backend authorization blocks those actions.

**Scenario F — Import and export**
1. Import a valid spreadsheet.
2. Import a spreadsheet containing invalid rows and duplicates.
3. Review the preview and validation report.
4. Confirm that rejected records do not corrupt valid records.
5. Export the resulting data and verify that the file opens correctly.

**Scenario G — Branches**
1. Create two branches.
2. Receive or allocate stock to both.
3. Record relevant transactions.
4. Verify branch-level views and permissions.
5. Confirm that transfers preserve total stock quantities.

### Testing standard

Do not report a test as passing unless it was actually run and its result observed.

Clearly identify tests that have not been run because of missing credentials, infrastructure, or environment configuration.

---

## 21. DEVELOPMENT AND DEPLOYMENT DOCUMENTATION

Provide a useful README covering:

- Project architecture.
- Frontend setup.
- Backend setup.
- Required software versions.
- Environment variables.
- Supabase Auth configuration.
- Supabase Storage configuration.
- PostgreSQL connection setup.
- Prisma schema and migration commands.
- Development seed data.
- How to run frontend and backend together.
- How to run tests.
- Build commands.
- Production deployment configuration.
- Initial administrator setup.
- Troubleshooting common configuration errors.

Use explicit setup steps rather than assuming that the developer already knows the required configuration.

Create an `.env.example` containing safe placeholders for required variables.

Never commit real Supabase keys, database passwords, production credentials, or user data.

Include clear guidance for configuring the initial administrator securely. Do not introduce a public registration route that grants privileged access.

Make sure the Vite frontend uses only the environment variables intended for browser exposure. All server secrets must remain server-side.

---

## 22. DEFINITION OF DONE

A module is not complete merely because its page exists.

For a feature to be considered implemented, verify that it has:

1. A functional interface.
2. Correct input validation.
3. Proper database persistence.
4. Server-side authorization.
5. Clear loading and error handling.
6. Success feedback tied to actual server confirmation.
7. Search, filtering, or navigation appropriate to the module.
8. Correct relationships with other business records.
9. Appropriate empty and edge-case states.
10. Tests for the critical business logic.
11. Documentation where configuration is required.

For the complete application, verify that:
- The application builds successfully.
- Authentication and sessions work.
- Role restrictions are enforced on the server.
- The core business workflows operate across modules.
- No implemented critical action is a placeholder.
- Data survives page reloads and new sessions as expected.
- Stock and financial totals reconcile with their underlying records.
- Generated documents contain the correct data.
- Imports and exports work with realistic files.
- Errors are understandable to business users.
- The responsive layout remains usable.
- Setup and deployment instructions are accurate.

---

## 23. FINAL INSTRUCTIONS TO THE AI CODING ASSISTANT

Be precise, methodical, and business-focused.

First inspect the current project, then implement the solution using the existing codebase wherever practical.

Before coding a business module, understand its data relationships and workflow dependencies. For every important workflow, identify which records are read, which records are created or changed, which validations apply, and which permissions are required.

Prioritize correctness and data integrity over superficial visual polish.

Use consistent naming conventions, reusable components, validated data contracts, and a well-documented database design.

Do not invent company policies when the business description is silent. Use sensible defaults, make uncertain rules configurable, and document decisions that may require confirmation by the company.

Do not claim that an integration works before it has been configured and tested. Do not substitute mock API responses or hardcoded values for actual backend functionality.

Do not make unrelated changes to the existing project. Do not introduce dependencies without a clear purpose. Do not delete files or reset data without a justified reason and appropriate safeguards.

When finishing a development phase, summarize:
- What was implemented.
- Which files and major components were created or modified.
- Which database migrations were added.
- Which configuration steps remain.
- Which tests were actually run and their results.
- Which features remain incomplete or depend on external services.

If an issue appears, investigate its cause and correct it instead of layering a workaround over broken functionality.

**Your ultimate objective is to deliver a coherent, secure, maintainable, business-ready medical equipment management application that improves real company operations—not just a dashboard that looks finished.**