import PDFDocument from 'pdfkit';
import { TENDER_STATUS_LABELS, type TenderDto } from '@tsm/shared';
import type { PdfCompany } from './proforma-pdf';
import {
  amountFormat,
  collect,
  contactAndMeta,
  footers,
  headerBand,
  longDate,
  money,
  partyCard,
  PDF_COLORS,
  quantityFormat,
} from './pdf-theme';

const { NAVY, MUTED, RULE, SHADE, INK, ACCENT } = PDF_COLORS;

/** Render a tender price schedule as A4 landscape; one page unless the items need more. */
export function renderTenderPdf(tender: TenderDto, company: PdfCompany): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 40,
    bufferPages: true,
    info: { Title: `Price Schedule ${tender.number}`, Author: company.name },
  });
  const done = collect(doc);

  const pageH = doc.page.height;
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const bottomLimit = pageH - 60;

  headerBand(doc, company, 'PRICE SCHEDULE', tender.lot ? `LOT NO. ${tender.lot.toUpperCase()}` : undefined, { compact: true });
  const head = contactAndMeta(doc, company, [
    ['Schedule no.', tender.number],
    ['Date', longDate(tender.scheduleDate)],
    ...(tender.tenderReference ? ([['Your ref', tender.tenderReference]] as [string, string][]) : []),
    ...(tender.submissionDeadline ? ([['Deadline', longDate(tender.submissionDeadline)]] as [string, string][]) : []),
    ['Currency', tender.currency],
    ['Status', TENDER_STATUS_LABELS[tender.status]],
  ], { compact: true });
  // Landscape has room to put the recipient beside the reference details.
  const cardBottom = partyCard(
    doc,
    head.leftBottom + 10,
    'TO',
    tender.customerName,
    tender.customerAddress ? [tender.customerAddress] : [],
    head.metaX - left - 30,
  );
  let y = Math.max(cardBottom, head.metaBottom) + 12;

  // Columns, left to right; widths add up to the printable width.
  const taxHead = `TOTAL INCL. ${tender.taxLabel.toUpperCase()} (${Number(tender.taxRate)}%)`;
  const cols = [
    { key: 'no', head: 'NO', w: 22 },
    { key: 'desc', head: 'DESCRIPTION', w: 0 },
    { key: 'qty', head: 'QTY', w: 36, right: true },
    { key: 'unit', head: 'UNIT', w: 50 },
    { key: 'price', head: 'UNIT PRICE', w: 66, right: true },
    { key: 'total', head: 'TOTAL', w: 70, right: true },
    { key: 'tax', head: taxHead, w: 84, right: true },
    { key: 'origin', head: 'ORIGIN', w: 56 },
    { key: 'maker', head: 'MANUFACTURER', w: 120 },
    { key: 'brand', head: 'BRAND', w: 76 },
    { key: 'expiry', head: 'EXPIRY', w: 46 },
  ];
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  cols[1]!.w = width - fixed;
  const xs: number[] = [];
  cols.reduce((x, c) => (xs.push(x), x + c.w), left);

  const header = (at: number) => {
    doc.font('Helvetica-Bold').fontSize(7);
    const h = Math.max(...cols.map((c) => doc.heightOfString(c.head, { width: c.w - 8 }))) + 12;
    doc.rect(left, at, width, h).fill(NAVY);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7);
    cols.forEach((c, i) => doc.text(c.head, xs[i]! + 4, at + 6, { width: c.w - 8, align: c.right ? 'right' : 'left' }));
    return at + h;
  };

  y = header(y);
  tender.items.forEach((item, n) => {
    const cells: Record<string, string> = {
      no: String(n + 1),
      desc: item.description,
      qty: quantityFormat.format(Number(item.quantity)),
      unit: item.unit,
      price: amountFormat.format(Number(item.unitPrice)),
      total: amountFormat.format(Number(item.amount)),
      tax: amountFormat.format(Number(item.amountWithTax)),
      origin: item.countryOfOrigin ?? '',
      maker: item.manufacturer ?? '',
      brand: item.brand ?? '',
      expiry: item.expiryDate ?? '',
    };
    doc.font('Helvetica').fontSize(8);
    const rowH = Math.max(...cols.map((c) => doc.heightOfString(cells[c.key] ?? '', { width: c.w - 8 })), 10) + 10;
    if (y + rowH > bottomLimit - 20) {
      doc.addPage();
      y = header(40);
    }
    if (n % 2 === 1) doc.rect(left, y, width, rowH).fill(SHADE);
    cols.forEach((c, i) => {
      doc
        .fillColor(c.key === 'no' ? MUTED : INK)
        .font(c.key === 'tax' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .text(cells[c.key] ?? '', xs[i]! + 4, y + 5, { width: c.w - 8, align: c.right ? 'right' : 'left' });
    });
    y += rowH;
  });
  doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
  y += 10;

  // Three columns, kept together: amount in words and notes | signature | totals.
  const boxW = 260;
  const boxX = right - boxW;
  const sigW = 200;
  const sigX = boxX - 30 - sigW;
  const textW = sigX - left - 30;
  doc.font('Helvetica-Bold').fontSize(9);
  let wordsH = doc.heightOfString(tender.totalInWords, { width: textW }) + 14;
  doc.font('Helvetica').fontSize(9);
  if (tender.notes) wordsH += doc.heightOfString(tender.notes, { width: textW }) + 18;
  if (y + Math.max(67, wordsH) > pageH - 56) {
    doc.addPage();
    y = 40;
  }
  const top = y;
  const row = (label: string, value: string) => {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(label, boxX + 10, y, { width: 140 });
    doc.fillColor(INK).text(value, boxX + 140, y, { width: boxW - 150, align: 'right' });
    y += 16;
  };
  row('Subtotal', money(tender.subtotal, tender.currency));
  row(`${tender.taxLabel} (${Number(tender.taxRate)}%)`, money(tender.taxAmount, tender.currency));
  y += 3;
  doc.roundedRect(boxX, y, boxW, 30, 4).fill(NAVY);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5).text('GRAND TOTAL', boxX + 10, y + 10.5, { width: 100 });
  doc.fontSize(12).text(money(tender.total, tender.currency), boxX + 100, y + 9, { width: boxW - 110, align: 'right' });

  // Signature level with the grand total, so it needs no height of its own.
  doc.moveTo(sigX, y).lineTo(sigX + sigW, y).strokeColor(MUTED).lineWidth(0.75).stroke();
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('PREPARED BY', sigX, y + 5, { width: sigW, characterSpacing: 0.8 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(tender.preparedBy.toUpperCase(), sigX, y + 17, { width: sigW });

  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7.5).text('TOTAL AMOUNT IN WORDS', left, top, { characterSpacing: 1 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(tender.totalInWords, left, doc.y + 3, { width: textW });
  if (tender.notes) {
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7.5).text('NOTES', left, doc.y + 8, { characterSpacing: 1 });
    doc.fillColor(INK).font('Helvetica').fontSize(9).text(tender.notes, left, doc.y + 3, { width: textW });
  }
  footers(doc, company, 'Thank you for doing business with us.');
  doc.end();
  return done;
}
