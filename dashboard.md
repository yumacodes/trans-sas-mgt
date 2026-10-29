# DASHBOARD DEVELOPMENT PROMPT — MEDICAL EQUIPMENT BUSINESS MANAGEMENT SYSTEM

## 1. ROLE AND OBJECTIVE

Act as a senior frontend engineer and enterprise UI/UX designer specializing in modern business management dashboards.

Your task is to build or redesign **the Dashboard page only** of my existing medical equipment business management application, using the attached dashboard screenshot as the primary visual reference.

The dashboard should closely reproduce the reference image's visual language, layout, color palette, proportions, spacing, typography, cards, graphs, side navigation, and interactions while replacing the CRM-specific content with meaningful information for a medical equipment sales and inventory business.

The goal is to produce a polished, enterprise-grade dashboard that looks like a premium commercial SaaS product.

**Important:** Do not redesign the entire application. Do not build unrelated pages or replace existing business modules. Focus exclusively on the dashboard page and any reusable dashboard-specific components or styles required to implement it correctly.

## 2. EXISTING TECHNOLOGY STACK

Use the existing project's technology stack:

- React.js
- Vite.js
- TypeScript if the existing project uses it or can adopt it without disrupting the architecture
- Existing routing system
- Existing styling framework and component libraries, where appropriate
- Existing icon library, if one is already installed
- Recharts or another suitable charting library if the project already uses one; otherwise, choose a lightweight, well-maintained option
- Existing Supabase and API architecture, without requiring live backend integration for this dashboard prototype

Before making changes, inspect the repository to understand its existing layout, sidebar, top navigation, design system, routes, dependencies, and folder structure.

Reuse existing components wherever practical. Avoid creating duplicate sidebars, duplicate navigation bars, competing styling systems, or unnecessary dependencies.

If an authenticated application shell already exists, integrate the dashboard into that shell rather than recreating the entire application layout.

## 3. REFERENCE DESIGN — VISUAL DIRECTION

Use the attached screenshot as the visual source of truth for the dashboard's design.

Reproduce its clean, spacious, modern business interface as closely as practical.

### Overall appearance

The dashboard should feature:

- A soft off-white or very light gray application background.
- White cards with generously rounded corners.
- Subtle shadows and fine borders that separate panels without making the interface feel heavy.
- A fixed, independently scrollable left sidebar.
- A rounded top navigation bar.
- A modern, clean sans-serif typeface.
- Strong black or near-black headings.
- Small uppercase section labels with moderate letter spacing.
- Muted gray supporting text.
- Lime-green accents for important highlights and positive performance indicators.
- Deep navy or muted teal for selected charts and secondary accents.
- Minimal, restrained use of color.
- Dense business information presented in an organized, visually balanced layout.

The result should look polished and professional, not playful, futuristic, or excessively decorative.

Do not use large gradient backgrounds, oversized illustrations, excessive glass effects, glowing elements, heavy shadows, or colorful dashboard cards that depart from the reference.

### Suggested color palette

Establish reusable CSS variables or design tokens using approximately the following palette:

- Application background: `#F5F5F0`
- Main card background: `#FFFFFF`
- Primary text: `#141510`
- Secondary text: `#777970`
- Muted text: `#9A9B93`
- Main borders: `#E9EAE4`
- Primary accent lime: `#D9F75B`
- Soft lime background: `#EEF8CC`
- Deep green: `#245A3A`
- Muted sage: `#B6C98C`
- Chart navy: `#193C85`
- Chart teal: `#17565A`
- Light chart grid: `#EEEEEA`

Treat these colors as the starting palette. Refine their use to match the screenshot and ensure readable contrast.

Use black or near-black primary buttons with white text. Reserve lime for emphasized actions, selected elements, positive indicators, and important chart highlights.

**Design consistency is critical:** define the palette once and reuse it across the dashboard components rather than introducing unrelated colors on different cards.

## 4. DASHBOARD PAGE STRUCTURE

Build the dashboard using the following main layout:

1. Persistent left sidebar.
2. Top navigation and dashboard controls.
3. Welcome header.
4. Four KPI summary cards.
5. Large financial performance chart with a right-hand business schedule panel.
6. Lower dashboard row containing inventory or business pipeline health and an activity stream.

At the reference desktop viewport of approximately 1280 × 1200 pixels, preserve the visual proportions, spacing, and relative card sizes of the attached screenshot.

At other viewport sizes, adapt the layout gracefully without sacrificing usability.

---

## 5. LEFT SIDEBAR

Reproduce the sidebar shown in the reference image.

### Appearance

- White background.
- Approximately 210–225 pixels wide on desktop, adjusted to fit the existing application layout.
- Large rounded outer corners where compatible with the application shell.
- Fixed positioning or sticky positioning so it remains visible while the dashboard content scrolls.
- Independent vertical scrolling when the menu exceeds the available height.
- Comfortable horizontal padding.
- Small, consistent line icons.
- Compact navigation labels.
- Uppercase, letter-spaced navigation group headings.
- A dark near-black background for the active navigation item.
- A restrained lime-accent icon or indicator where appropriate.

Do not build an unrelated or differently styled sidebar if one already exists in the project.

### Navigation content

Use the following conceptual navigation hierarchy, respecting the application's existing route names and permissions.

**Workspace**
- Dashboard
- Notifications

**Records**
- Clients
- Registered Clients
- Stock Items

**Sales & Operations**
- Proforma
- Tender Price Schedule
- Sales
- Way Bill
- Acceptance Letter
- Payment

**Intelligence**
- Reports

**Administration**
- Settings or the existing Admin menu

Also preserve access to the existing Expenses and Stock Management navigation groups if they already belong to the application's shared sidebar.

This task does not require developing those pages. The sidebar should link to existing routes where available. Do not invent broken routes merely to populate the menu.

At the bottom of the sidebar, display a compact current-user profile card containing:
- Initials or a small avatar.
- User's name.
- Role or department.
- A small profile-options indicator.

Use a generic demo identity when no authenticated user is available in the development environment.

---

## 6. TOP NAVIGATION BAR

Create a compact, rounded, white top bar similar to the reference.

### Left section

Display a breadcrumb such as:

Workspace / Overview

The current page should be clearly identified.

### Center or right section

Include a date-range selector with three options:

- Month
- Quarter
- Year

Quarter should be selected initially, matching the visual reference.

The selector must be interactive. Changing the selected range should update the dashboard's displayed period and derived chart/KPI data where relevant.

### Right section

Include:

- A notifications button with an unread count.
- A primary dark Create button with a plus icon.
- A small user avatar or profile shortcut.

The Create button should open a compact dropdown menu with relevant dashboard shortcuts, such as:

- New Client
- New Proforma
- Record Sale
- Add Stock Item
- Record Payment

Connect an action to an existing route, existing form, or appropriate application workflow wherever possible. If a workflow has not yet been implemented, provide a clear disabled or unavailable state rather than a fake successful operation.

The notification control should open a notification panel populated with clearly identifiable demo notifications.

Keep the top bar compact. Avoid oversized buttons and unnecessary navigation elements.

---

## 7. WELCOME HEADER

Immediately beneath the top navigation bar, create a spacious welcome area.

Display:

- A small uppercase date label, for example, `WEDNESDAY · 28 OCTOBER 2026`.
- A large, bold heading such as `Good morning, Yusif`.
- A concise subtitle such as `Here is your business overview for this quarter, including sales, stock, and outstanding payments.`

Use the current date and authenticated user's display name when available. A configurable demo identity is acceptable for development.

Avoid hardcoding an incorrect weekday or relying on a static date indefinitely.

Align the welcome content to the left, with a primary dashboard action and a secondary action aligned to the right on wider screens.

Suggested actions:

- `Log activity`
- `Export report`

The buttons should have practical behavior using existing application capabilities or dashboard-local demo interactions.

For demo interactions, show appropriate loading and feedback states without implying that a real backend record was created or that a real report was generated if the functionality has not actually been implemented.

---

## 8. FOUR KPI SUMMARY CARDS

Directly beneath the welcome header, display four white metric cards in one horizontal row at desktop sizes.

The cards should have:

- Equal or nearly equal widths.
- Generous internal padding.
- Large, bold metric values.
- Small uppercase category labels.
- A positive or negative change indicator.
- A short explanatory caption.
- A miniature sparkline along the bottom-right edge.
- Soft rounded corners.
- Subtle shadows or borders.
- Consistent vertical alignment.

Follow the reference image closely: simple, information-dense cards without oversized icons or unnecessary illustrations.

### KPI Card 1 — Sales Value

Label: `SALES VALUE · QTD`

Demo value: `GH₵ 4.28M`

Change: `+12.4%`

Supporting caption: `142 recorded sales`

Sparkline: A compact navy line chart illustrating sales growth over time.

The value should be formatted as a monetary amount in the company's configured currency. Use Ghanaian cedi formatting for the initial demo if no other currency is configured.

### KPI Card 2 — Payments Received

Label: `PAYMENTS RECEIVED`

Demo value: `GH₵ 2.86M`

Change: `+8.2%`

Supporting caption: `Payments recorded this quarter`

Sparkline: A compact blue line chart illustrating the movement of payment receipts.

### KPI Card 3 — Outstanding Balances

Label: `OUTSTANDING BALANCES`

Demo value: `GH₵ 684K`

Supporting caption: `18 invoices with balances`

Sparkline: A compact purple or indigo line illustrating the outstanding balance trend.

Do not automatically classify an increase in outstanding balances as positive. Use a neutral or negative indicator where appropriate.

### KPI Card 4 — Stock Availability

Label: `STOCK AVAILABILITY`

Demo value: `94.2%`

Supporting caption: `8 items below reorder level`

Sparkline: A compact teal line chart illustrating inventory availability.

For this demo, define availability using a documented, deterministic calculation based on the supplied mock inventory data. Do not display a percentage that contradicts the actual demonstration records.

These metrics and values are illustrative. Keep them isolated in the dashboard mock-data layer so they can later be replaced with real backend data.

Do not add unnecessary illustrations or large icons to these KPI cards. The data, typography, and sparklines should be the primary visual elements.

---

## 9. MAIN FINANCIAL PERFORMANCE PANEL

Below the KPI cards, create a large white panel occupying approximately 65–70% of the available dashboard width on desktop.

This is the main visual focus of the dashboard.

Place a narrower business schedule card on its right, similar to the reference image.

### Panel header

Title: `Revenue vs. forecast`

Subtitle: `Recognized revenue and forecast performance over the last 12 months`

Include a minimal chart legend showing:

- Actual — solid dark line.
- Forecast — dashed sage-green line.

### Financial summary

On the left side of the panel, show:

Section label: `CLOSED-WON · 12 MO`

Large example value: `GH₵ 9.84M`

Small status badge: `+18.6% YoY`

Below the summary, include three compact financial comparison rows:

- Forecast: `GH₵ 9.31M`
- Attainment: `106%`
- Best month: `Jul · GH₵ 864K`

Use consistent row dividers, restrained labels, and right-aligned values.

These numbers are demo values. In the implemented dashboard, derive the displayed values from the same mock-data configuration used by the chart, or clearly structure the demo dataset so the sample figures are internally consistent.

### Main chart

Create a smooth, modern line-and-area chart inspired by the reference.

Requirements:

- Display the last 12 months.
- Use month labels along the bottom axis.
- Use understated horizontal grid lines.
- Show actual revenue as a smooth dark or near-black line.
- Use a subtly filled lime or pale-green area below the actual line.
- Show the forecast as a dashed sage-green line.
- Add useful tooltips on hover.
- Show the correct month and currency-formatted figures.
- Use a restrained y-axis and avoid excessive labeling.
- Avoid thick grid lines and unnecessary chart decorations.
- Maintain a clean white chart background.

The chart must be a real rendered chart, not an image.

Use SVG or the chosen charting library to create a smooth result.

Support both actual and forecast series, with a clear visual distinction between them. Handle missing data without producing misleading connecting lines.

### Segment summary strip

At the bottom of the financial panel, display four compact segment cards inspired by the screenshot.

Adapt them to the medical equipment business:

**Hospital Equipment**
- Demo revenue: `GH₵ 4.1M`
- Change: `+22%`

**Diagnostic Equipment**
- Demo revenue: `GH₵ 3.2M`
- Change: `+14%`

**Consumables**
- Demo revenue: `GH₵ 1.4M`
- Change: `-6%`

**Service & Maintenance**
- Demo revenue: `GH₵ 1.1M`
- Change: `+31%`

Each segment card should include:

- A small category marker.
- A short label.
- A prominent monetary figure.
- A percentage-change label.
- A thin horizontal progress indicator.

Style the first three cards using soft neutral or pale-green backgrounds. Style the final card using a dark background with white text and a lime progress indicator, closely following the emphasized final card in the reference.

Use the same segment dataset in all calculations, tooltips, and labels. Do not present the segment totals as reconciling to the total revenue unless the underlying dataset actually supports that reconciliation.

---

## 10. RIGHT-HAND SCHEDULE PANEL

Create a white, rounded card alongside the main financial performance panel.

Title: `Today's schedule`

Provide a small `Calendar` action in the upper-right corner.

Display a list of four sample business activities.

Each schedule item should be a compact bordered or softly shaded card containing:

- Start and end time.
- Activity title.
- Activity type badge.
- Related client, team, or participant.
- Optional avatar or initials.

Suggested demo records:

**09:30 – 10:00**
- Pipeline stand-up
- Type: Internal
- Participants: Sales team

**11:15 – 12:00**
- Medical equipment quotation review
- Type: Client Call
- Participant: Demo client representative

**14:00 – 14:45**
- Procurement and stock review
- Type: Operations
- Participant: Inventory team

**16:30 – 17:00**
- Outstanding payment follow-up
- Type: Finance
- Participant: Accounts team

Highlight one selected or current activity using a very light lime background, matching the featured schedule card in the reference image.

At the bottom, include:

- Total scheduled time.
- A focus-time or availability percentage, if the mock dataset supports that metric.

The schedule can be demonstration data because this is a dashboard-only prototype. Clearly isolate it from actual calendar integrations.

The Calendar action must navigate to an existing calendar route if one exists, or show an appropriate demo state if no calendar module is connected.

Do not require integration with Google Calendar or another external service.

---

## 11. LOWER DASHBOARD SECTION

Below the financial chart and schedule panel, create a second row of two white panels.

The left panel should be approximately 25–30% of the row width.

The right panel should occupy the remaining width.

Match the reference image's spacing and overall proportions.

### A. Inventory health panel

Title: `Inventory health`

Subtitle: `Stock levels across your equipment catalog`

Use a compact vertical list of stock categories with horizontal progress bars.

Suggested demo categories:

1. Diagnostic Equipment
2. Patient Monitoring
3. Surgical Equipment
4. Laboratory Equipment
5. Consumables

Display:
- Category label.
- Number of tracked items.
- A horizontal progress indicator.
- A visually distinct indicator for categories requiring attention.

Use dark bars for normal progress and lime for an important highlighted or low-stock category.

Choose sensible, documented demo values and keep them internally consistent.

Below the list, display a full-width, near-black button labelled `View inventory`.

When clicked, it should navigate to the existing stock-management route if implemented. Otherwise, provide a clear unavailable or preview state rather than pretending navigation succeeded.

Keep this panel visually compact. Bars should be easy to compare, with labels and counts positioned consistently.

### B. Recent activity stream

Title: `Activity stream`

Subtitle or helper text: `Recent business activity`

Display a list of five recent business events.

Each row should include:

- A small colored icon container.
- A concise description.
- A badge identifying the event category.
- A relative timestamp.
- A chevron or expand control on the right.

Suggested demonstration activities:

1. A proforma was prepared for a hospital client.
2. A payment was recorded against an outstanding invoice.
3. Stock was received for diagnostic equipment.
4. A waybill was generated for a completed sale.
5. An authorized user imported stock items from an Excel spreadsheet.

Use varied but restrained icon-container colors, including pale lavender, light blue, soft green, and pale yellow, while preserving the reference's overall neutral color palette.

Each activity row should have a subtle bottom divider.

### Activity expansion behavior

Clicking an activity row or its chevron should expand the entry to display additional mock details, such as:

- Activity reference.
- Related record.
- User who performed the action.
- Date and time.
- A relevant navigation action, where available.

Only the selected row should expand unless a different interaction pattern is deliberately implemented.

Use keyboard-accessible expansion controls.

Do not populate the activity feed with random events every time the component rerenders. The same demo dataset should remain stable throughout the session unless the user intentionally triggers a demo interaction.

---

## 12. DUMMY DATA REQUIREMENTS

Populate the dashboard with realistic, coherent sample data so that it looks complete and informative immediately after the page loads.

The dashboard should not appear empty simply because Supabase has not yet been connected to this specific page.

Create a dedicated mock-data module, such as:

`src/features/dashboard/data/dashboardMockData.ts`

Adapt the path to the existing repository's conventions rather than creating unnecessary folders.

Organize the mock data into clearly named collections, such as:

- Dashboard KPIs.
- Monthly actual revenue.
- Monthly forecast revenue.
- Business segments.
- Schedule events.
- Inventory categories.
- Recent activities.
- Notification examples.
- Trend data for sparklines.

Use typed data structures when working in TypeScript.

### Mock-data quality

The example data should:
- Look realistic for a medical equipment business.
- Use consistent monetary formatting.
- Use plausible inventory and sales figures.
- Use deterministic values.
- Remain stable between renders.
- Support all chart series and visual indicators.
- Contain no real customer or employee personal data.
- Avoid unsupported claims about real business performance.

Use fictitious client names if client examples are needed.

Use Ghanaian cedi formatting by default for this demonstration, unless the application already has a configured currency.

### Data consistency

Do not simply hardcode unrelated values into different components.

Derive appropriate values from shared mock data where practical.

For example:
- The total revenue figure should be consistent with the chart's underlying dataset.
- Forecast attainment should follow the stated revenue and forecast values, subject to rounding.
- Inventory attention counts should align with the sample stock records or documented category-level mock data.
- Schedule duration should agree with the listed sample activities if a total is displayed.
- KPI change indicators should refer to a defined comparison period.
- Chart tooltips should reflect the exact plotted values.

Some demonstration figures can intentionally differ from segment totals if they represent different metrics, time periods, or categories, but document that distinction clearly.

**Important:** Keep the mock data separate from the UI components. The goal is to make future integration with Supabase or backend API endpoints straightforward without rewriting the dashboard.

Do not connect the demonstration data to production tables, and do not use fake values as fallback data in production without an explicit development/demo mode.

---

## 13. FUNCTIONAL INTERACTIONS

The dashboard must be interactive rather than a static screenshot.

Implement the following behaviors.

### Date-range selector
- Month, Quarter, and Year are selectable.
- The active selection has the same dark pill styling as the reference.
- The chart and relevant KPI presentation respond to the selected period.
- If the available demo data does not cover a selected range, provide an intentional fallback dataset or an explanatory state.

### KPI cards
- Hover effects are subtle and professional.
- Tooltips or detail information may explain the KPI where appropriate.
- Clicking a card should open the corresponding existing module with relevant filters, if that route and behavior exist.
- Avoid attaching misleading navigation to metrics with no defined destination.

### Charts
- Actual and forecast lines are clearly distinguishable.
- Hovering displays a tooltip with month, actual value, and forecast value.
- Legends clearly identify the plotted data.
- Chart values are formatted appropriately.
- The chart resizes with its container.

### Create button
- Opens a functional menu.
- Menu actions are connected to actual available destinations or clearly identified demo states.

### Notifications
- Opens a compact panel.
- Displays stable mock notifications.
- Includes an appropriate read/unread interaction for demonstration purposes.
- Updates the unread indicator when the user marks a notification as read.

### Schedule panel
- Calendar action works with the existing route or a clearly identified demo view.
- Individual event details can be opened where practical.

### Activity stream
- Rows expand and collapse.
- Relevant details are displayed without navigating away from the dashboard.

### Report export
- If an existing report-export mechanism is available, reuse it.
- If report export is not implemented, generate a genuine downloadable CSV or spreadsheet-compatible file from the displayed dashboard demo data.
- Do not claim to generate an official financial report if only dashboard demonstration data is being exported.

### Button and menu standards
- All dropdowns open and close correctly.
- Menus are keyboard-accessible.
- Buttons have hover, active, focus, disabled, and loading states where applicable.
- Prevent event bubbling from nested buttons within clickable cards or rows.
- Do not introduce interactive controls that have no behavior.

For demonstration-only interactions, clearly distinguish the simulated data operation from a real persistent business transaction.

---

## 14. LOADING, EMPTY, AND ERROR STATES

Implement subtle, professional feedback consistent with the reference design.

For dashboard initialization:
- Use restrained skeleton placeholders for cards and charts if loading is needed.
- Avoid a full-screen loading indicator for ordinary dashboard operations.
- Do not flash incorrect totals before data is available.

For demo data:
- Render the dashboard immediately from the deterministic mock-data module unless there is a good reason to show an initial loading transition.

For failures:
- Display a human-readable message.
- Provide a retry option when appropriate.
- Preserve the dashboard layout where possible.
- Do not expose raw error messages or stack traces.

For empty chart or list data:
- Show a clear, compact empty state rather than an unexplained blank panel.

Respect the application's existing notification and toast system if one exists.

---

## 15. RESPONSIVE DESIGN

The reference screenshot is desktop-oriented, so reproduce that composition first.

At wide desktop sizes:
- Keep the sidebar permanently visible.
- Place four KPI cards in one row.
- Display the main revenue panel and schedule side by side.
- Display inventory health and activity stream side by side.

At medium viewport sizes:
- Reduce card padding and gaps.
- Allow KPI cards to wrap into two columns.
- Preserve a readable financial chart.
- Rebalance the schedule panel width.

At small viewport sizes:
- Collapse or adapt the sidebar using the existing application navigation pattern.
- Stack major dashboard panels vertically.
- Stack KPI cards in two columns where space permits, and one column when necessary.
- Allow the chart to use the full available width.
- Keep action buttons accessible.
- Prevent horizontal page overflow.
- Make event cards and activity rows readable without clipping.

Do not merely scale the desktop screenshot down. Reflow the content intelligently.

Test the page at approximately:
- 1440 px desktop width.
- 1280 px desktop width.
- 1024 px tablet or small laptop width.
- 768 px tablet width.
- 390 px mobile width.

---

## 16. IMPLEMENTATION QUALITY

Follow these engineering standards:

- Use reusable dashboard components.
- Keep data definitions separate from rendering.
- Use sensible component boundaries.
- Use stable React keys.
- Avoid unnecessary rerenders.
- Clean up event listeners where applicable.
- Avoid manipulating the DOM directly when React can handle the interaction.
- Do not suppress TypeScript errors merely to complete the page.
- Avoid adding dependencies when the existing project already provides the necessary functionality.
- Use proper semantic HTML.
- Use accessible labels and keyboard navigation.
- Use suitable date, number, and currency formatting functions.
- Avoid duplicating the sidebar and top navigation if the application already contains them.
- Avoid overwriting global styles in ways that damage other routes.
- Keep dashboard styling scoped to its components or feature stylesheet.
- Ensure charts and cards remain correctly aligned at different screen widths.
- Preserve existing authentication and role-based route protection.

If the application uses an existing design system, extend it rather than creating an unrelated one.

If the application's current sidebar and top bar differ from the reference, make only the changes necessary to achieve the requested dashboard appearance without disrupting other pages.

---

## 17. ACCEPTANCE CRITERIA

The dashboard is complete only when all the following conditions are satisfied:

1. The dashboard closely resembles the supplied visual reference.
2. The same neutral background, white rounded cards, near-black text, lime accents, muted green indicators, and restrained chart colors are used consistently.
3. The page contains a welcome header and four KPI cards.
4. The revenue-versus-forecast panel contains a real interactive line-and-area chart.
5. The right-side schedule panel displays realistic sample events.
6. The lower section includes inventory health and a recent activity stream.
7. The page is fully populated with stable, clearly identified fictitious data.
8. The mock dataset is isolated and can be replaced by real API responses later.
9. Month, Quarter, and Year selectors work.
10. Dropdowns, activity expansion, notification interactions, and other visible controls function.
11. The dashboard works with the existing application shell and routing.
12. Responsive layouts work without horizontal overflow.
13. Loading, empty, and error states are handled appropriately.
14. The page builds successfully with the existing project configuration.
15. No unrelated pages or business modules are unnecessarily modified.
16. No real database records are created or changed through demonstration-only interactions.
17. Any unavailable integration is clearly identified instead of falsely represented as functional.

---

## 18. FINAL IMPLEMENTATION INSTRUCTIONS

Start by inspecting the current project structure and identifying the existing dashboard route, sidebar, top bar, styling system, and available charting packages.

Then implement the dashboard in the existing codebase.

Do not return only a design description, screenshot, or sample component. Actually create or modify the relevant source files.

Use the attached screenshot as the visual reference during implementation. Pay particular attention to spacing, panel proportions, typography, alignment, chart presentation, and the hierarchy between the primary and secondary content.

Use the proposed content and values as illustrative demonstration data, and adjust only where needed to maintain consistency and professional presentation.

After implementation:
- Run the appropriate build command.
- Run relevant tests or checks that are available.
- Correct implementation errors.
- Verify the dashboard at different viewport sizes.
- Confirm that the major interactive controls work.
- List the files created or modified.
- State which checks were actually run and whether they passed.
- Clearly identify anything that remains incomplete.

**The final result should feel like the reference dashboard has been professionally adapted for a medical equipment company: clean, elegant, data-rich, responsive, interactive, and suitable for an enterprise business application.**