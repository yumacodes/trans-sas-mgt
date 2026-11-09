import PDFDocument from 'pdfkit';
import { PROFORMA_STATUS_LABELS, type ProformaDto } from '@tsm/shared';

export interface PdfCompany {
  name: string;
  tagline?: string | null;
  /** Address and contact lines, shown under the header. */
  lines: string[];
  /** Single line printed in the page footer. */
  footer?: string;
}

const NAVY = '#27298f';
const ACCENT = '#4a4dc4';
const MUTED = '#667085';
const RULE = '#e4e7ec';
const SHADE = '#f1f2fb';
const INK = '#1d2939';

const amountFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/** Display-only formatting; arithmetic happens on decimal strings elsewhere. */
const money = (value: string, currency: string) => `${currency} ${amountFormat.format(Number(value))}`;

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Render a proforma invoice as an A4 PDF. */
export function renderProformaPdf(proforma: ProformaDto, company: PdfCompany): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: `Proforma Invoice ${proforma.number}`, Author: company.name },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const left = 40;
  const right = pageW - 40;
  const width = right - left;
  const bottomLimit = pageH - 60;

  // Header band
  doc.rect(0, 0, pageW, 104).fill(NAVY);
  doc.rect(0, 104, pageW, 4).fill(ACCENT);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19).text(company.name.toUpperCase(), left, 30, { width: width * 0.62 });
  if (company.tagline) {
    doc.fillColor('#cfd1f5').font('Helvetica').fontSize(8.5).text(company.tagline, left, doc.y + 3, { width: width * 0.62 });
  }
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17).text('PROFORMA', left, 32, { width, align: 'right', characterSpacing: 1 });
  doc.fillColor('#cfd1f5').font('Helvetica').fontSize(10).text('INVOICE', left, 54, { width, align: 'right', characterSpacing: 4 });

  // Company contact (left) and invoice meta (right)
  const top = 128;
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5);
  company.lines.forEach((line, i) => {
    doc.text(line, left, i === 0 ? top : doc.y, { width: width * 0.5, lineGap: 1 });
  });
  const leftBottom = company.lines.length ? doc.y : top;

  const metaX = left + width * 0.58;
  const metaW = right - metaX;
  const meta: [string, string][] = [
    ['Invoice no.', proforma.number],
    ['Date', longDate(proforma.issueDate)],
    ['Currency', proforma.currency],
    ['Status', PROFORMA_STATUS_LABELS[proforma.status]],
  ];
  let my = top;
  for (const [label, value] of meta) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), metaX, my + 1, { width: 70, characterSpacing: 0.5 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(value, metaX + 72, my, { width: metaW - 72, align: 'right' });
    my += 17;
  }
  let y = Math.max(leftBottom, my) + 16;

  // Bill-to card
  const details = [proforma.customerAddress, proforma.customerPhone, proforma.customerEmail].filter((l): l is string => Boolean(l));
  const cardH = 38 + details.length * 12 + 8;
  doc.roundedRect(left, y, width, cardH, 4).fill(SHADE);
  doc.rect(left, y, 3, cardH).fill(ACCENT);
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7.5).text('BILLED TO', left + 14, y + 10, { characterSpacing: 1 });
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11.5).text(proforma.customerName, left + 14, y + 22, { width: width - 28 });
  doc.fillColor(INK).font('Helvetica').fontSize(9);
  for (const line of details) doc.text(line, left + 14, doc.y + 1, { width: width - 28 });
  y += cardH + 20;

  // Items table
  const noW = 28;
  const qtyW = 52;
  const unitW = 46;
  const priceW = 90;
  const amountW = 94;
  const descX = left + noW;
  const descW = width - noW - qtyW - unitW - priceW - amountW;
  const qtyX = descX + descW;
  const unitX = qtyX + qtyW;
  const priceX = unitX + unitW;
  const amountX = priceX + priceW;

  const header = (at: number) => {
    doc.rect(left, at, width, 24).fill(NAVY);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    const t = at + 8.5;
    doc.text('NO', left + 8, t, { width: noW });
    doc.text('DESCRIPTION', descX, t, { width: descW });
    doc.text('QTY', qtyX, t, { width: qtyW - 8, align: 'right' });
    doc.text('UNIT', unitX + 8, t, { width: unitW - 8 });
    doc.text('UNIT PRICE', priceX, t, { width: priceW - 8, align: 'right' });
    doc.text('AMOUNT', amountX, t, { width: amountW - 8, align: 'right' });
    return at + 24;
  };

  y = header(y);
  proforma.items.forEach((item, i) => {
    doc.font('Helvetica').fontSize(9.5);
    const rowH = Math.max(doc.heightOfString(item.name, { width: descW - 8 }), 12) + 14;
    if (y + rowH > bottomLimit - 20) {
      doc.addPage();
      y = header(40);
    }
    if (i % 2 === 1) doc.rect(left, y, width, rowH).fill(SHADE);
    const t = y + 7;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(String(i + 1), left + 8, t, { width: noW });
    doc.fillColor(INK).text(item.name, descX, t, { width: descW - 8 });
    doc.text(quantityFormat.format(Number(item.quantity)), qtyX, t, { width: qtyW - 8, align: 'right' });
    doc.text(item.unit, unitX + 8, t, { width: unitW - 8 });
    doc.text(amountFormat.format(Number(item.unitPrice)), priceX, t, { width: priceW - 8, align: 'right' });
    doc.font('Helvetica-Bold').text(amountFormat.format(Number(item.amount)), amountX, t, { width: amountW - 8, align: 'right' });
    y += rowH;
  });
  doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
  y += 14;

  // Totals and notes side by side; kept together on one page.
  if (y > bottomLimit - 120) {
    doc.addPage();
    y = 40;
  }
  const boxW = 230;
  const boxX = right - boxW;
  const cur = proforma.currency;
  const row = (label: string, value: string) => {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(label, boxX + 10, y, { width: 110 });
    doc.fillColor(INK).text(value, boxX + 110, y, { width: boxW - 120, align: 'right' });
    y += 17;
  };
  const totalsTop = y;
  row('Subtotal', money(proforma.subtotal, cur));
  row(`VAT (${Number(proforma.vatRate)}%)`, money(proforma.vatAmount, cur));
  if (Number(proforma.taxRate) > 0) row(`Tax (${Number(proforma.taxRate)}%)`, money(proforma.taxAmount, cur));
  y += 4;
  doc.roundedRect(boxX, y, boxW, 30, 4).fill(NAVY);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5).text('TOTAL DUE', boxX + 10, y + 10.5, { width: 80 });
  doc.fontSize(12).text(money(proforma.total, cur), boxX + 90, y + 9, { width: boxW - 100, align: 'right' });
  const totalsBottom = y + 30;

  let notesBottom = totalsBottom;
  if (proforma.notes) {
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7.5).text('NOTES & TERMS', left, totalsTop, { characterSpacing: 1 });
    doc.fillColor(INK).font('Helvetica').fontSize(9).text(proforma.notes, left, doc.y + 4, { width: boxX - left - 20 });
    notesBottom = doc.y;
  }
  y = Math.max(totalsBottom, notesBottom) + 24;

  // Signatures sit at the foot of the last page, leaving the space above for the listing.
  const sigY = pageH - 118;
  if (y > sigY - 10) doc.addPage();
  y = sigY;
  const sigW = 190;
  const sig = (x: number, label: string, name: string) => {
    doc.moveTo(x, y).lineTo(x + sigW, y).strokeColor(MUTED).lineWidth(0.75).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x, y + 5, { width: sigW, characterSpacing: 0.8 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(name, x, y + 17, { width: sigW });
  };
  sig(left, 'Prepared by', proforma.preparedByName);
  sig(right - sigW, 'Approved by', 'Manager');

  // Footer and page numbers on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(left, pageH - 48).lineTo(right, pageH - 48).strokeColor(RULE).lineWidth(0.75).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
    doc.text(company.footer ?? company.name, left, pageH - 40, { width: width - 70, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, right - 60, pageH - 40, { width: 60, align: 'right', lineBreak: false });
    doc.text('This is a proforma invoice and not a demand for payment.', left, pageH - 29, { width, lineBreak: false });
  }

  doc.end();
  return done;
}
