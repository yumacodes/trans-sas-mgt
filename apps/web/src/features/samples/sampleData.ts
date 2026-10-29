/**
 * SAMPLE DATA for modules that are not built yet. Nothing here comes from the database and
 * nothing is saved. Rows are generated deterministically, and every total shown on a page
 * (KPI cards, document totals, chart bars) is computed from the rows below it, so the
 * figures agree with each other.
 *
 * To make a module real, replace its config's `rows` with an API response of the same shape.
 */
import { formatCompactMoney } from '@/features/dashboard/format';

export type Kind = 'text' | 'ref' | 'date' | 'money' | 'number' | 'status' | 'percent';
export interface Col {
  key: string;
  label: string;
  kind?: Kind;
}
export interface Line {
  item: string;
  qty: number;
  price: number;
}
export type Row = { id: string; lines?: Line[] } & Record<string, string | number | Line[] | undefined>;
export interface Kpi {
  label: string;
  value: (rows: Row[]) => string;
  caption: (rows: Row[]) => string;
}
export interface PageConfig {
  description: string;
  /** Label for the create button. It is shown disabled: the workflow is not built yet. */
  newLabel?: string;
  cols: Col[];
  rows: Row[];
  statusKey?: string;
  kpis: Kpi[];
  chart?: { title: string; labelKey: string; valueKey: string; money?: boolean };
  note?: string;
  detailTitle: (row: Row) => string;
  exportName: string;
}

/* ---------------------------------------------------------------- helpers */

const BASE = Date.UTC(2026, 9, 28);
/** ISO business date `days` before the fixed sample "today" (28 Oct 2026). */
const day = (days: number) => new Date(BASE - days * 86_400_000).toISOString().slice(0, 10);
const pad = (n: number, w = 4) => String(n).padStart(w, '0');
const pick = <T,>(list: T[], i: number) => list[i % list.length] as T;

const CLIENTS = [
  'Sample Teaching Hospital',
  'Ridge Regional Hospital',
  'Lifeline Diagnostics Laboratory',
  'Northgate Specialist Clinic',
  'Harbour Community Health Centre',
  'Meridian Pharmacy Group',
  'Coastal District Hospital',
  'Unity Medical Centre',
];
const BRANCHES = ['Head Office', 'Kumasi Branch', 'Takoradi Branch'];
const CITIES = ['Accra', 'Kumasi', 'Takoradi', 'Tamale', 'Cape Coast'];
const EQUIPMENT = [
  { name: '12-lead ECG machine', price: 18_500 },
  { name: 'Eight-parameter patient monitor', price: 9_800 },
  { name: 'Portable ultrasound scanner', price: 42_500 },
  { name: 'Digital blood pressure monitor', price: 450 },
  { name: 'Pulse oximeter, fingertip', price: 180 },
  { name: 'Infrared thermometer', price: 95 },
  { name: 'Nitrile examination gloves (box of 100)', price: 65 },
  { name: 'Disposable syringes 5ml (box of 100)', price: 48 },
  { name: 'Biphasic defibrillator', price: 24_500 },
  { name: 'Tabletop steam autoclave', price: 12_800 },
];

function makeLines(i: number, n = (i % 3) + 2): Line[] {
  return Array.from({ length: n }, (_, k) => {
    const e = EQUIPMENT[(i * 3 + k * 2) % EQUIPMENT.length]!;
    const qty = ((i + k) % 3) + 1;
    return { item: e.name, qty: e.price < 100 ? qty * 20 : qty, price: e.price };
  });
}
const linesTotal = (lines: Line[]) => lines.reduce((s, l) => s + l.qty * l.price, 0);

export const count = (rows: Row[], pred: (r: Row) => boolean = () => true) => rows.filter(pred).length;
export const sum = (rows: Row[], key: string, pred: (r: Row) => boolean = () => true) =>
  rows.filter(pred).reduce((s, r) => s + Number(r[key] ?? 0), 0);
const money = (v: number) => formatCompactMoney(v);
const isStatus = (...s: string[]) => (r: Row) => s.includes(String(r.status));

/* -------------------------------------------------------------- documents */

const SALE_STATUS = ['Paid', 'Partially paid', 'Issued', 'Paid', 'Partially paid', 'Issued', 'Paid', 'Cancelled', 'Partially paid', 'Issued'];

const sales: Row[] = SALE_STATUS.map((status, i) => {
  const lines = makeLines(i + 20);
  const total = linesTotal(lines);
  const paid = status === 'Paid' ? total : status === 'Partially paid' ? Math.round((total * 0.4) / 10) * 10 : 0;
  return {
    id: `SAL-2026-${pad(120 + i)}`,
    ref: `SAL-2026-${pad(120 + i)}`,
    client: pick(CLIENTS, i),
    branch: pick(BRANCHES, i),
    date: day(4 + i * 6),
    total,
    paid,
    balance: status === 'Cancelled' ? 0 : total - paid,
    status,
    lines,
  };
});

const proformas: Row[] = ['Issued', 'Accepted', 'Draft', 'Issued', 'Rejected', 'Accepted', 'Expired', 'Issued', 'Draft', 'Accepted'].map(
  (status, i) => {
    const lines = makeLines(i + 3);
    return {
      id: `PRF-2026-${pad(101 + i)}`,
      ref: `PRF-2026-${pad(101 + i)}`,
      client: pick(CLIENTS, i + 1),
      date: day(2 + i * 5),
      validUntil: day(i * 5 - 28),
      items: lines.length,
      total: linesTotal(lines),
      status,
      lines,
    };
  },
);

const TENDER_TITLES = [
  'Regional hospital theatre equipment',
  'District laboratory upgrade',
  'Patient monitoring for ICU wing',
  'Primary care consumables, annual supply',
  'Diagnostic imaging for polyclinic',
  'Emergency response kits',
  'Sterilisation unit replacement',
  'Community clinic starter packs',
];
const TENDER_STATUS = ['Preparing', 'Submitted', 'Awarded', 'Submitted', 'Lost', 'Preparing', 'Awarded', 'Submitted'];
const tenders: Row[] = TENDER_STATUS.map((status, i) => {
  const lines = makeLines(i + 5, (i % 3) + 3);
  return {
    id: `TND-2026-${pad(11 + i, 3)}`,
    ref: `TND-2026-${pad(11 + i, 3)}`,
    title: pick(TENDER_TITLES, i),
    client: pick(CLIENTS, i + 2),
    deadline: day(i * 7 - 21),
    items: lines.length,
    value: linesTotal(lines),
    status,
    lines,
  };
});

const WAYBILL_STATUS = ['Delivered', 'Dispatched', 'Created', 'Delivered', 'Dispatched', 'Created', 'Delivered', 'Delivered'];
const waybills: Row[] = WAYBILL_STATUS.map((status, i) => {
  const sale = sales[i]!;
  return {
    id: `WB-2026-${pad(80 + i, 3)}`,
    ref: `WB-2026-${pad(80 + i, 3)}`,
    sale: sale.ref as string,
    client: sale.client as string,
    destination: pick(CITIES, i),
    dispatched: status === 'Created' ? '—' : day(3 + i * 6),
    items: (sale.lines as Line[]).length,
    status,
    lines: (sale.lines as Line[]).map((l) => ({ ...l, price: 0 })),
  };
});

const ACCEPTANCE_STATUS = ['Signed', 'Sent', 'Draft', 'Signed', 'Sent', 'Signed', 'Draft'];
const acceptance: Row[] = ACCEPTANCE_STATUS.map((status, i) => ({
  id: `ACC-2026-${pad(30 + i, 3)}`,
  ref: `ACC-2026-${pad(30 + i, 3)}`,
  client: sales[i]!.client as string,
  sale: sales[i]!.ref as string,
  date: day(2 + i * 7),
  signatory: pick(['Procurement Officer', 'Medical Director', 'Hospital Administrator'], i),
  status,
}));

const PAY_STATUS = ['Confirmed', 'Confirmed', 'Pending', 'Confirmed', 'Reversed', 'Confirmed', 'Pending', 'Confirmed', 'Confirmed', 'Confirmed', 'Pending', 'Confirmed'];
const payments: Row[] = PAY_STATUS.map((status, i) => {
  const sale = sales[i % 9]!;
  const amount = Math.max(500, Math.round(((sale.total as number) * (0.25 + (i % 3) * 0.15)) / 10) * 10);
  return {
    id: `PAY-2026-${pad(300 + i, 4)}`,
    ref: `PAY-2026-${pad(300 + i, 4)}`,
    invoice: sale.ref as string,
    client: sale.client as string,
    method: pick(['Bank transfer', 'Mobile money', 'Cheque', 'Cash'], i),
    date: day(1 + i * 4),
    amount,
    status,
  };
});

const tenderIn: Row[] = ['Received', 'Pending', 'Received', 'Received', 'Pending', 'Received'].map((status, i) => ({
  id: `TIN-2026-${pad(i + 1, 3)}`,
  ref: `TIN-2026-${pad(i + 1, 3)}`,
  tender: tenders[(i + 2) % tenders.length]!.ref as string,
  counterparty: pick(['Ministry of Health (sample)', 'Regional Health Directorate', 'District Assembly'], i),
  category: pick(['Bid bond refund', 'Advance payment', 'Award payment'], i),
  date: day(5 + i * 9),
  amount: [12_000, 85_000, 240_000, 9_500, 60_000, 310_000][i]!,
  status,
}));

const tenderOut: Row[] = ['Paid', 'Pending approval', 'Paid', 'Paid', 'Pending approval', 'Paid'].map((status, i) => ({
  id: `TOUT-2026-${pad(i + 1, 3)}`,
  ref: `TOUT-2026-${pad(i + 1, 3)}`,
  tender: tenders[i % tenders.length]!.ref as string,
  counterparty: pick(['Public procurement authority', 'Surety insurer (sample)', 'Courier & printing'], i),
  category: pick(['Tender document fee', 'Bid bond', 'Performance bond'], i),
  date: day(6 + i * 8),
  amount: [1_500, 24_000, 36_000, 900, 18_000, 42_000][i]!,
  status,
}));

const generalExpenses: Row[] = ['Approved', 'Pending', 'Approved', 'Approved', 'Pending', 'Approved', 'Approved', 'Approved', 'Pending', 'Approved'].map(
  (status, i) => ({
    id: `EXP-2026-${pad(400 + i)}`,
    ref: `EXP-2026-${pad(400 + i)}`,
    category: pick(['Fuel & transport', 'Utilities', 'Rent', 'Marketing', 'Maintenance', 'Insurance', 'Office supplies'], i),
    branch: pick(BRANCHES, i + 1),
    date: day(2 + i * 5),
    amount: [3_200, 1_850, 14_000, 6_400, 2_750, 9_800, 980, 4_300, 7_600, 2_100][i]!,
    recordedBy: 'Demo Accountant',
    status,
  }),
);

const SUPPLIERS = ['Medline Supply Co. (sample)', 'Apex Biomedical (sample)', 'Gulf Diagnostics Trading', 'Nova Surgical Imports'];
const purchases: Row[] = ['Received', 'Ordered', 'Partially received', 'Received', 'Ordered', 'Received', 'Draft', 'Received'].map(
  (status, i) => {
    const lines = makeLines(i + 7).map((l) => ({ ...l, price: Math.round(l.price * 0.72) }));
    return {
      id: `PUR-2026-${pad(50 + i, 3)}`,
      ref: `PUR-2026-${pad(50 + i, 3)}`,
      supplier: pick(SUPPLIERS, i),
      branch: pick(BRANCHES, i),
      date: day(3 + i * 8),
      items: lines.length,
      total: linesTotal(lines),
      status,
      lines,
    };
  },
);

/* ---------------------------------------------------------------- reports */

const MONTHS = ['Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026'];
const REVENUE = [760, 800, 750, 800, 830, 815, 843, 851, 864, 846, 859, 822].map((v) => v * 1000);

const incomeRows: Row[] = MONTHS.map((month, i) => {
  const revenue = REVENUE[i]!;
  const cogs = Math.round(revenue * (0.63 + (i % 4) * 0.01));
  const opex = 118_000 + (i % 5) * 7_500;
  return { id: month, month, revenue, cogs, gross: revenue - cogs, opex, net: revenue - cogs - opex };
});

const salesByMonth: Row[] = MONTHS.map((month, i) => ({
  id: month,
  month,
  sales: 9 + ((i * 5) % 7),
  value: Math.round(REVENUE[i]! * 1.18),
  average: 0,
})).map((r) => ({ ...r, average: Math.round(Number(r.value) / Number(r.sales)) }));

const methodRows: Row[] = [
  ['Bank transfer', 64, 5_420_000],
  ['Mobile money', 118, 1_960_000],
  ['Cheque', 31, 2_310_000],
  ['Cash', 47, 940_000],
].map(([method, n, amount]) => ({ id: String(method), method: method as string, count: n as number, amount: amount as number }));

const expenseCategories: Row[] = [
  ['Salaries and wages', 1_320_000],
  ['Rent and utilities', 412_000],
  ['Fuel and transport', 236_000],
  ['Marketing', 148_000],
  ['Maintenance', 121_000],
  ['Insurance', 96_000],
].map(([category, amount]) => ({ id: category as string, category: category as string, amount: amount as number }));
const expenseTotal = sum(expenseCategories, 'amount');
expenseCategories.forEach((r) => (r.share = (Number(r.amount) / expenseTotal) * 100));

const tenderByStatus: Row[] = ['Preparing', 'Submitted', 'Awarded', 'Lost'].map((status) => ({
  id: status,
  status,
  count: count(tenders, isStatus(status)),
  value: sum(tenders, 'value', isStatus(status)),
}));

const STOCK_CATEGORIES = [
  ['Diagnostic Equipment', 34, 2], ['Patient Monitoring', 29, 1], ['Surgical Equipment', 31, 2], ['Laboratory Equipment', 26, 1], ['Consumables', 18, 2],
] as const;
const stockReport: Row[] = STOCK_CATEGORIES.map(([category, items, low], i) => {
  const units = items * (6 + i * 4);
  return { id: category, category, items, low, units, value: units * (4_800 - i * 900) };
});

const MOVE_TYPES = ['Receipt', 'Issue', 'Transfer', 'Adjustment', 'Issue', 'Receipt'];
const movements: Row[] = Array.from({ length: 12 }, (_, i) => {
  const type = pick(MOVE_TYPES, i);
  const qty = ((i * 7) % 15) + 2;
  return {
    id: `MOV-${pad(900 + i)}`,
    date: day(i * 2),
    item: pick(EQUIPMENT, i * 3).name,
    type,
    branch: pick(BRANCHES, i),
    qty: type === 'Issue' ? -qty : qty,
    reference: type === 'Receipt' ? `PUR-2026-${pad(50 + (i % 8), 3)}` : type === 'Issue' ? `SAL-2026-${pad(120 + (i % 10))}` : type === 'Transfer' ? `TRF-${pad(i + 1, 3)}` : `ADJ-${pad(i + 1, 3)}`,
  };
});

const lowStock: Row[] = [
  ['DEMO-ECG-12', '12-lead ECG machine', 'Head Office', 1, 2],
  ['DEMO-USG-4D', 'Portable ultrasound scanner', 'Kumasi Branch', 0, 1],
  ['DEMO-MON-8', 'Eight-parameter patient monitor', 'Head Office', 1, 2],
  ['DEMO-BPM-100', 'Digital blood pressure monitor', 'Takoradi Branch', 3, 5],
  ['DEMO-PLS-20', 'Pulse oximeter, fingertip', 'Kumasi Branch', 6, 10],
  ['DEMO-THM-IR', 'Infrared thermometer', 'Head Office', 8, 12],
  ['DEMO-SYR-5', 'Disposable syringes 5ml (box)', 'Head Office', 40, 60],
  ['DEMO-GLV-M', 'Nitrile gloves, M (box)', 'Kumasi Branch', 32, 50],
].map(([sku, item, branch, onHand, reorder]) => ({
  id: sku as string,
  sku: sku as string,
  item: item as string,
  branch: branch as string,
  onHand: onHand as number,
  reorder: reorder as number,
  shortfall: (reorder as number) - (onHand as number),
}));

const purchaseBySupplier: Row[] = SUPPLIERS.map((supplier) => ({
  id: supplier,
  supplier,
  orders: count(purchases, (r) => r.supplier === supplier),
  value: sum(purchases, 'total', (r) => r.supplier === supplier),
}));

const clientReport: Row[] = CLIENTS.map((client) => {
  const own = sales.filter((s) => s.client === client && s.status !== 'Cancelled');
  return { id: client, client, sales: own.length, value: sum(own, 'total'), outstanding: sum(own, 'balance') };
});

// 18 open invoices whose balances add up to GH₵ 684,000, matching the dashboard figure.
const balanceParts = Array.from({ length: 17 }, (_, i) => 18_000 + ((i * 7_300) % 41_000));
balanceParts.push(684_000 - balanceParts.reduce((s, v) => s + v, 0));
const outstanding: Row[] = balanceParts.map((balance, i) => {
  const age = 6 + i * 5;
  return {
    id: `INV-2026-${pad(180 + i)}`,
    invoice: `INV-2026-${pad(180 + i)}`,
    client: pick(CLIENTS, i),
    due: day(age - 30),
    daysOver: Math.max(0, age - 30),
    balance,
  };
});

const branchPerformance: Row[] = BRANCHES.map((branch, i) => ({
  id: branch,
  branch,
  sales: [3_480_000, 1_920_000, 760_000][i]!,
  payments: [2_410_000, 1_180_000, 420_000][i]!,
  expenses: [540_000, 310_000, 150_000][i]!,
  stockValue: [2_850_000, 1_240_000, 610_000][i]!,
}));

/* ------------------------------------------------------------ page configs */

const docKpis = (valueKey: string, openStatuses: string[], doneStatuses: string[], valueLabel: string, noun: string): Kpi[] => [
  { label: `Total ${noun}`, value: (r) => String(r.length), caption: () => 'In this sample' },
  { label: valueLabel, value: (r) => money(sum(r, valueKey)), caption: () => 'Across all records' },
  { label: 'Open', value: (r) => String(count(r, isStatus(...openStatuses))), caption: () => openStatuses.join(', ') },
  { label: 'Completed', value: (r) => String(count(r, isStatus(...doneStatuses))), caption: () => doneStatuses.join(', ') },
];

export const SAMPLE_CONFIGS: Record<string, PageConfig> = {
  proforma: {
    description: 'Quotations prepared for clients before a sale is agreed.',
    newLabel: 'New proforma',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'client', label: 'Client' }, { key: 'date', label: 'Date', kind: 'date' },
      { key: 'validUntil', label: 'Valid until', kind: 'date' }, { key: 'items', label: 'Items', kind: 'number' },
      { key: 'total', label: 'Total', kind: 'money' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: proformas,
    statusKey: 'status',
    kpis: [
      { label: 'Proformas', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Quoted value', value: (r) => money(sum(r, 'total')), caption: () => 'Before tax' },
      { label: 'Awaiting answer', value: (r) => String(count(r, isStatus('Issued'))), caption: () => 'Issued, not yet accepted' },
      { label: 'Acceptance rate', value: (r) => `${Math.round((count(r, isStatus('Accepted')) / Math.max(1, r.length)) * 100)}%`, caption: (r) => `${count(r, isStatus('Accepted'))} accepted` },
    ],
    detailTitle: (r) => String(r.ref),
    exportName: 'proformas-sample',
  },
  'tender-schedule': {
    description: 'Pricing schedules prepared for tenders and opportunities.',
    newLabel: 'New price schedule',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'title', label: 'Tender' }, { key: 'client', label: 'Procuring organisation' },
      { key: 'deadline', label: 'Deadline', kind: 'date' }, { key: 'items', label: 'Items', kind: 'number' },
      { key: 'value', label: 'Schedule value', kind: 'money' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: tenders,
    statusKey: 'status',
    kpis: docKpis('value', ['Preparing', 'Submitted'], ['Awarded'], 'Schedule value', 'tenders'),
    note: 'A price schedule does not mean a tender has been awarded. Only the Awarded status does.',
    detailTitle: (r) => String(r.title),
    exportName: 'tender-schedules-sample',
  },
  sales: {
    description: 'Sales issued to clients, with payments and balances.',
    newLabel: 'Record sale',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'client', label: 'Client' }, { key: 'branch', label: 'Branch' },
      { key: 'date', label: 'Date', kind: 'date' }, { key: 'total', label: 'Total', kind: 'money' },
      { key: 'balance', label: 'Balance', kind: 'money' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: sales,
    statusKey: 'status',
    kpis: [
      { label: 'Sales', value: (r) => String(count(r, (x) => x.status !== 'Cancelled')), caption: () => 'Excluding cancelled' },
      { label: 'Sales value', value: (r) => money(sum(r, 'total', (x) => x.status !== 'Cancelled')), caption: () => 'Invoiced' },
      { label: 'Paid', value: (r) => money(sum(r, 'paid')), caption: () => 'Payments applied' },
      { label: 'Outstanding', value: (r) => money(sum(r, 'balance')), caption: (r) => `${count(r, (x) => Number(x.balance) > 0)} sales with balances` },
    ],
    detailTitle: (r) => String(r.ref),
    exportName: 'sales-sample',
  },
  waybill: {
    description: 'Delivery documents linked to sales. Created, dispatched and delivered are separate steps.',
    newLabel: 'New way bill',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'sale', label: 'Sale', kind: 'ref' }, { key: 'client', label: 'Client' },
      { key: 'destination', label: 'Destination' }, { key: 'dispatched', label: 'Dispatched', kind: 'date' },
      { key: 'items', label: 'Items', kind: 'number' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: waybills,
    statusKey: 'status',
    kpis: [
      { label: 'Way bills', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Not yet dispatched', value: (r) => String(count(r, isStatus('Created'))), caption: () => 'Created only' },
      { label: 'In transit', value: (r) => String(count(r, isStatus('Dispatched'))), caption: () => 'Dispatched' },
      { label: 'Delivered', value: (r) => String(count(r, isStatus('Delivered'))), caption: () => 'Confirmed' },
    ],
    detailTitle: (r) => String(r.ref),
    exportName: 'waybills-sample',
  },
  acceptance: {
    description: 'Acceptance letters issued against completed deliveries.',
    newLabel: 'New acceptance letter',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'client', label: 'Client' }, { key: 'sale', label: 'Sale', kind: 'ref' },
      { key: 'date', label: 'Date', kind: 'date' }, { key: 'signatory', label: 'Signatory' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: acceptance,
    statusKey: 'status',
    kpis: [
      { label: 'Letters', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Drafts', value: (r) => String(count(r, isStatus('Draft'))), caption: () => 'Not yet sent' },
      { label: 'Awaiting signature', value: (r) => String(count(r, isStatus('Sent'))), caption: () => 'Sent to client' },
      { label: 'Signed', value: (r) => String(count(r, isStatus('Signed'))), caption: () => 'Returned and signed' },
    ],
    note: 'A letter is only shown as Signed once the signed copy has actually been received.',
    detailTitle: (r) => String(r.ref),
    exportName: 'acceptance-letters-sample',
  },
  payment: {
    description: 'Customer payments recorded against sales and invoices.',
    newLabel: 'Record payment',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'invoice', label: 'Invoice', kind: 'ref' }, { key: 'client', label: 'Client' },
      { key: 'method', label: 'Method' }, { key: 'date', label: 'Date', kind: 'date' },
      { key: 'amount', label: 'Amount', kind: 'money' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: payments,
    statusKey: 'status',
    kpis: [
      { label: 'Payments', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Received', value: (r) => money(sum(r, 'amount', isStatus('Confirmed'))), caption: () => 'Confirmed only' },
      { label: 'Pending', value: (r) => money(sum(r, 'amount', isStatus('Pending'))), caption: () => 'Awaiting confirmation' },
      { label: 'Reversed', value: (r) => money(sum(r, 'amount', isStatus('Reversed'))), caption: () => 'Corrected by reversal' },
    ],
    detailTitle: (r) => String(r.ref),
    exportName: 'payments-sample',
  },
  'expenses-general': {
    description: 'Day-to-day business expenses by category and branch.',
    newLabel: 'Record expense',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'category', label: 'Category' }, { key: 'branch', label: 'Branch' },
      { key: 'date', label: 'Date', kind: 'date' }, { key: 'amount', label: 'Amount', kind: 'money' },
      { key: 'recordedBy', label: 'Recorded by' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: generalExpenses,
    statusKey: 'status',
    kpis: [
      { label: 'Expenses', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Approved', value: (r) => money(sum(r, 'amount', isStatus('Approved'))), caption: () => 'Counted in reports' },
      { label: 'Awaiting approval', value: (r) => money(sum(r, 'amount', isStatus('Pending'))), caption: (r) => `${count(r, isStatus('Pending'))} records` },
      { label: 'Largest', value: (r) => money(Math.max(...r.map((x) => Number(x.amount)))), caption: () => 'Single expense' },
    ],
    detailTitle: (r) => String(r.ref),
    exportName: 'expenses-sample',
  },
  'tender-in': {
    description: 'Money received in connection with tenders, kept apart from customer receipts.',
    newLabel: 'Record tender-in',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'tender', label: 'Tender', kind: 'ref' }, { key: 'counterparty', label: 'Counterparty' },
      { key: 'category', label: 'Category' }, { key: 'date', label: 'Date', kind: 'date' },
      { key: 'amount', label: 'Amount', kind: 'money' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: tenderIn,
    statusKey: 'status',
    kpis: [
      { label: 'Transactions', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Received', value: (r) => money(sum(r, 'amount', isStatus('Received'))), caption: () => 'Cleared' },
      { label: 'Expected', value: (r) => money(sum(r, 'amount', isStatus('Pending'))), caption: () => 'Pending' },
      { label: 'Largest', value: (r) => money(Math.max(...r.map((x) => Number(x.amount)))), caption: () => 'Single receipt' },
    ],
    note: 'How Tender-In is treated in the accounts is still to be confirmed by the company.',
    detailTitle: (r) => String(r.ref),
    exportName: 'tender-in-sample',
  },
  'tender-out': {
    description: 'Money paid out in connection with tenders, such as fees and bonds.',
    newLabel: 'Record tender-out',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'tender', label: 'Tender', kind: 'ref' }, { key: 'counterparty', label: 'Counterparty' },
      { key: 'category', label: 'Category' }, { key: 'date', label: 'Date', kind: 'date' },
      { key: 'amount', label: 'Amount', kind: 'money' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: tenderOut,
    statusKey: 'status',
    kpis: [
      { label: 'Transactions', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Paid', value: (r) => money(sum(r, 'amount', isStatus('Paid'))), caption: () => 'Cleared' },
      { label: 'Awaiting approval', value: (r) => money(sum(r, 'amount', isStatus('Pending approval'))), caption: () => 'Not yet paid' },
      { label: 'Largest', value: (r) => money(Math.max(...r.map((x) => Number(x.amount)))), caption: () => 'Single payment' },
    ],
    note: 'How Tender-Out is treated in the accounts is still to be confirmed by the company.',
    detailTitle: (r) => String(r.ref),
    exportName: 'tender-out-sample',
  },
  purchase: {
    description: 'Purchases from suppliers. Stock only increases once goods are received.',
    newLabel: 'New purchase',
    cols: [
      { key: 'ref', label: 'Reference', kind: 'ref' }, { key: 'supplier', label: 'Supplier' }, { key: 'branch', label: 'Receiving branch' },
      { key: 'date', label: 'Date', kind: 'date' }, { key: 'items', label: 'Items', kind: 'number' },
      { key: 'total', label: 'Total', kind: 'money' }, { key: 'status', label: 'Status', kind: 'status' },
    ],
    rows: purchases,
    statusKey: 'status',
    kpis: [
      { label: 'Purchases', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Purchase value', value: (r) => money(sum(r, 'total')), caption: () => 'Before tax' },
      { label: 'On order', value: (r) => String(count(r, isStatus('Ordered', 'Partially received'))), caption: () => 'Not fully received' },
      { label: 'Received', value: (r) => String(count(r, isStatus('Received'))), caption: () => 'Added to stock' },
    ],
    detailTitle: (r) => String(r.ref),
    exportName: 'purchases-sample',
  },

  'r-income': {
    description: 'Management view of revenue, cost of goods sold and operating expenses by month.',
    cols: [
      { key: 'month', label: 'Month' }, { key: 'revenue', label: 'Revenue', kind: 'money' }, { key: 'cogs', label: 'Cost of goods sold', kind: 'money' },
      { key: 'gross', label: 'Gross profit', kind: 'money' }, { key: 'opex', label: 'Operating expenses', kind: 'money' }, { key: 'net', label: 'Net result', kind: 'money' },
    ],
    rows: incomeRows,
    kpis: [
      { label: 'Revenue', value: (r) => money(sum(r, 'revenue')), caption: () => '12 months' },
      { label: 'Gross profit', value: (r) => money(sum(r, 'gross')), caption: (r) => `${Math.round((sum(r, 'gross') / Math.max(1, sum(r, 'revenue'))) * 100)}% margin` },
      { label: 'Operating expenses', value: (r) => money(sum(r, 'opex')), caption: () => 'Approved expenses' },
      { label: 'Net result', value: (r) => money(sum(r, 'net')), caption: () => 'Before tax' },
    ],
    chart: { title: 'Net result by month', labelKey: 'month', valueKey: 'net', money: true },
    note: 'A management report built from sample operational data. It is not an accounting statement.',
    detailTitle: (r) => String(r.month),
    exportName: 'income-statement-sample',
  },
  'r-sales': {
    description: 'Sales count and value by month.',
    cols: [{ key: 'month', label: 'Month' }, { key: 'sales', label: 'Sales', kind: 'number' }, { key: 'value', label: 'Value', kind: 'money' }, { key: 'average', label: 'Average sale', kind: 'money' }],
    rows: salesByMonth,
    kpis: [
      { label: 'Sales', value: (r) => String(sum(r, 'sales')), caption: () => '12 months' },
      { label: 'Sales value', value: (r) => money(sum(r, 'value')), caption: () => 'Invoiced' },
      { label: 'Average sale', value: (r) => money(sum(r, 'value') / Math.max(1, sum(r, 'sales'))), caption: () => 'Value ÷ count' },
      { label: 'Best month', value: (r) => String([...r].sort((a, b) => Number(b.value) - Number(a.value))[0]?.month ?? '—'), caption: () => 'By value' },
    ],
    chart: { title: 'Sales value by month', labelKey: 'month', valueKey: 'value', money: true },
    detailTitle: (r) => String(r.month),
    exportName: 'sales-report-sample',
  },
  'r-payment': {
    description: 'Payments received, grouped by method.',
    cols: [{ key: 'method', label: 'Method' }, { key: 'count', label: 'Payments', kind: 'number' }, { key: 'amount', label: 'Amount', kind: 'money' }],
    rows: methodRows,
    kpis: [
      { label: 'Payments', value: (r) => String(sum(r, 'count')), caption: () => '12 months' },
      { label: 'Received', value: (r) => money(sum(r, 'amount')), caption: () => 'Confirmed' },
      { label: 'Average payment', value: (r) => money(sum(r, 'amount') / Math.max(1, sum(r, 'count'))), caption: () => 'Amount ÷ count' },
      { label: 'Top method', value: (r) => String([...r].sort((a, b) => Number(b.amount) - Number(a.amount))[0]?.method ?? '—'), caption: () => 'By amount' },
    ],
    chart: { title: 'Received by method', labelKey: 'method', valueKey: 'amount', money: true },
    detailTitle: (r) => String(r.method),
    exportName: 'payment-report-sample',
  },
  'r-expense': {
    description: 'Approved expenses by category.',
    cols: [{ key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', kind: 'money' }, { key: 'share', label: 'Share', kind: 'percent' }],
    rows: expenseCategories,
    kpis: [
      { label: 'Expenses', value: (r) => money(sum(r, 'amount')), caption: () => '12 months' },
      { label: 'Categories', value: (r) => String(r.length), caption: () => 'In use' },
      { label: 'Largest', value: (r) => String([...r].sort((a, b) => Number(b.amount) - Number(a.amount))[0]?.category ?? '—'), caption: () => 'By amount' },
      { label: 'Monthly average', value: (r) => money(sum(r, 'amount') / 12), caption: () => 'Total ÷ 12' },
    ],
    chart: { title: 'Expenses by category', labelKey: 'category', valueKey: 'amount', money: true },
    detailTitle: (r) => String(r.category),
    exportName: 'expense-report-sample',
  },
  'r-tender': {
    description: 'Tender pricing activity by status.',
    cols: [{ key: 'status', label: 'Status', kind: 'status' }, { key: 'count', label: 'Tenders', kind: 'number' }, { key: 'value', label: 'Schedule value', kind: 'money' }],
    rows: tenderByStatus,
    kpis: [
      { label: 'Tenders', value: (r) => String(sum(r, 'count')), caption: () => 'In this sample' },
      { label: 'Pipeline value', value: (r) => money(sum(r, 'value', isStatus('Preparing', 'Submitted'))), caption: () => 'Preparing and submitted' },
      { label: 'Awarded', value: (r) => money(sum(r, 'value', isStatus('Awarded'))), caption: () => 'Won' },
      { label: 'Win rate', value: (r) => `${Math.round((sum(r, 'count', isStatus('Awarded')) / Math.max(1, sum(r, 'count', isStatus('Awarded', 'Lost')))) * 100)}%`, caption: () => 'Awarded ÷ decided' },
    ],
    chart: { title: 'Schedule value by status', labelKey: 'status', valueKey: 'value', money: true },
    detailTitle: (r) => String(r.status),
    exportName: 'tender-report-sample',
  },
  'r-stock': {
    description: 'Stock on hand and its value by category.',
    cols: [
      { key: 'category', label: 'Category' }, { key: 'items', label: 'Tracked items', kind: 'number' }, { key: 'low', label: 'At or below reorder', kind: 'number' },
      { key: 'units', label: 'Units on hand', kind: 'number' }, { key: 'value', label: 'Stock value', kind: 'money' },
    ],
    rows: stockReport,
    kpis: [
      { label: 'Tracked items', value: (r) => String(sum(r, 'items')), caption: () => 'Catalogue' },
      { label: 'Below reorder', value: (r) => String(sum(r, 'low')), caption: () => 'Needs attention' },
      { label: 'Units on hand', value: (r) => sum(r, 'units').toLocaleString(), caption: () => 'All branches' },
      { label: 'Stock value', value: (r) => money(sum(r, 'value')), caption: () => 'At cost' },
    ],
    chart: { title: 'Stock value by category', labelKey: 'category', valueKey: 'value', money: true },
    detailTitle: (r) => String(r.category),
    exportName: 'stock-report-sample',
  },
  'r-movement': {
    description: 'Every receipt, issue, transfer and adjustment from the stock ledger.',
    cols: [
      { key: 'date', label: 'Date', kind: 'date' }, { key: 'item', label: 'Item' }, { key: 'type', label: 'Type', kind: 'status' },
      { key: 'branch', label: 'Branch' }, { key: 'qty', label: 'Quantity', kind: 'number' }, { key: 'reference', label: 'Reference', kind: 'ref' },
    ],
    rows: movements,
    statusKey: 'type',
    kpis: [
      { label: 'Movements', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Received', value: (r) => String(sum(r, 'qty', (x) => Number(x.qty) > 0)), caption: () => 'Units in' },
      { label: 'Issued', value: (r) => String(Math.abs(sum(r, 'qty', (x) => Number(x.qty) < 0))), caption: () => 'Units out' },
      { label: 'Adjustments', value: (r) => String(count(r, isStatus('Adjustment'))), caption: () => 'Need a reason' },
    ],
    detailTitle: (r) => String(r.id),
    exportName: 'stock-movement-sample',
  },
  'r-low-stock': {
    description: 'Items at or below their reorder level.',
    cols: [
      { key: 'sku', label: 'SKU', kind: 'ref' }, { key: 'item', label: 'Item' }, { key: 'branch', label: 'Branch' },
      { key: 'onHand', label: 'On hand', kind: 'number' }, { key: 'reorder', label: 'Reorder level', kind: 'number' }, { key: 'shortfall', label: 'Shortfall', kind: 'number' },
    ],
    rows: lowStock,
    kpis: [
      { label: 'Items below reorder', value: (r) => String(r.length), caption: () => 'Matches the dashboard' },
      { label: 'Out of stock', value: (r) => String(count(r, (x) => Number(x.onHand) === 0)), caption: () => 'Zero on hand' },
      { label: 'Units to reorder', value: (r) => String(sum(r, 'shortfall')), caption: () => 'To reach reorder level' },
      { label: 'Branches affected', value: (r) => String(new Set(r.map((x) => x.branch)).size), caption: () => 'With low stock' },
    ],
    detailTitle: (r) => String(r.item),
    exportName: 'low-stock-sample',
  },
  'r-purchase': {
    description: 'Purchases by supplier.',
    cols: [{ key: 'supplier', label: 'Supplier' }, { key: 'orders', label: 'Orders', kind: 'number' }, { key: 'value', label: 'Value', kind: 'money' }],
    rows: purchaseBySupplier,
    kpis: [
      { label: 'Orders', value: (r) => String(sum(r, 'orders')), caption: () => 'In this sample' },
      { label: 'Purchase value', value: (r) => money(sum(r, 'value')), caption: () => 'Before tax' },
      { label: 'Suppliers', value: (r) => String(count(r, (x) => Number(x.orders) > 0)), caption: () => 'Used' },
      { label: 'Average order', value: (r) => money(sum(r, 'value') / Math.max(1, sum(r, 'orders'))), caption: () => 'Value ÷ orders' },
    ],
    chart: { title: 'Purchase value by supplier', labelKey: 'supplier', valueKey: 'value', money: true },
    detailTitle: (r) => String(r.supplier),
    exportName: 'purchase-report-sample',
  },
  'r-clients': {
    description: 'Sales and balances by client.',
    cols: [{ key: 'client', label: 'Client' }, { key: 'sales', label: 'Sales', kind: 'number' }, { key: 'value', label: 'Sales value', kind: 'money' }, { key: 'outstanding', label: 'Outstanding', kind: 'money' }],
    rows: clientReport,
    kpis: [
      { label: 'Clients', value: (r) => String(r.length), caption: () => 'In this sample' },
      { label: 'Active buyers', value: (r) => String(count(r, (x) => Number(x.sales) > 0)), caption: () => 'With at least one sale' },
      { label: 'Sales value', value: (r) => money(sum(r, 'value')), caption: () => 'Invoiced' },
      { label: 'Outstanding', value: (r) => money(sum(r, 'outstanding')), caption: () => 'Unpaid balances' },
    ],
    chart: { title: 'Sales value by client', labelKey: 'client', valueKey: 'value', money: true },
    detailTitle: (r) => String(r.client),
    exportName: 'client-report-sample',
  },
  'r-outstanding': {
    description: 'Invoices with an unpaid balance, with how long each is overdue.',
    cols: [
      { key: 'invoice', label: 'Invoice', kind: 'ref' }, { key: 'client', label: 'Client' }, { key: 'due', label: 'Due', kind: 'date' },
      { key: 'daysOver', label: 'Days overdue', kind: 'number' }, { key: 'balance', label: 'Balance', kind: 'money' },
    ],
    rows: outstanding,
    kpis: [
      { label: 'Outstanding', value: (r) => money(sum(r, 'balance')), caption: () => 'Matches the dashboard' },
      { label: 'Invoices', value: (r) => String(r.length), caption: () => 'With balances' },
      { label: 'Overdue', value: (r) => String(count(r, (x) => Number(x.daysOver) > 0)), caption: () => 'Past due date' },
      { label: 'Over 60 days', value: (r) => money(sum(r, 'balance', (x) => Number(x.daysOver) > 60)), caption: () => 'Needs follow-up' },
    ],
    detailTitle: (r) => String(r.invoice),
    exportName: 'outstanding-balances-sample',
  },
  'r-branch': {
    description: 'Sales, payments, expenses and stock value by branch.',
    cols: [
      { key: 'branch', label: 'Branch' }, { key: 'sales', label: 'Sales', kind: 'money' }, { key: 'payments', label: 'Payments', kind: 'money' },
      { key: 'expenses', label: 'Expenses', kind: 'money' }, { key: 'stockValue', label: 'Stock value', kind: 'money' },
    ],
    rows: branchPerformance,
    kpis: [
      { label: 'Branches', value: (r) => String(r.length), caption: () => 'Active' },
      { label: 'Sales', value: (r) => money(sum(r, 'sales')), caption: () => 'All branches' },
      { label: 'Payments', value: (r) => money(sum(r, 'payments')), caption: () => 'Received' },
      { label: 'Expenses', value: (r) => money(sum(r, 'expenses')), caption: () => 'Approved' },
    ],
    chart: { title: 'Sales by branch', labelKey: 'branch', valueKey: 'sales', money: true },
    detailTitle: (r) => String(r.branch),
    exportName: 'branch-performance-sample',
  },
};
