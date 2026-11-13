import PDFDocument from 'pdfkit';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, amountInWords, type PaymentDto } from '@tsm/shared';
import { collect, contactAndMeta, footers, headerBand, longDate, money, partyCard, PDF_COLORS, signatureY, ruledHead } from './pdf-theme';
import type { PdfCompany } from './proforma-pdf';

const { MUTED, RULE, SHADE, INK } = PDF_COLORS;

/** One-page receipt for a customer payment. */
export function renderReceiptPdf(payment: PaymentDto, company: PdfCompany): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: `Receipt ${payment.number}`, Author: company.name },
  });
  const done = collect(doc);
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;

  headerBand(doc, company, 'RECEIPT', 'PAYMENT');
  let { bottom: y } = contactAndMeta(doc, company, [
    ['Receipt no.', payment.number],
    ['Date', longDate(payment.paymentDate)],
    ['Sale', payment.sale.number],
    ['Status', PAYMENT_STATUS_LABELS[payment.status]],
  ]);
  y = partyCard(doc, y, 'RECEIVED FROM', payment.customerName, []);
  y += 20;

  const rows: [string, string][] = [
    ['Payment method', PAYMENT_METHOD_LABELS[payment.method]],
    ...(payment.externalReference ? ([['Reference', payment.externalReference]] as [string, string][]) : []),
    ['Sale total', money(payment.sale.total, payment.currency)],
    ['Balance now outstanding', money(payment.sale.balance, payment.currency)],
    ...(payment.status === 'reversed' && payment.reverseReason
      ? ([['Reversed because', payment.reverseReason]] as [string, string][])
      : []),
  ];
  ruledHead(doc, left, y, width, 24);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(8);
  doc.text('DETAIL', left + 10, y + 8.5, { width: 170 });
  doc.text('VALUE', left + 180, y + 8.5, { width: width - 190 });
  y += 24;
  rows.forEach(([label, value], i) => {
    doc.font('Helvetica').fontSize(9.5);
    const rowH = Math.max(doc.heightOfString(value, { width: width - 190 }), 12) + 14;
    if (i % 2 === 1) doc.rect(left, y, width, rowH).fill(SHADE);
    doc.fillColor(MUTED).text(label, left + 10, y + 7, { width: 165 });
    doc.fillColor(INK).text(value, left + 180, y + 7, { width: width - 190 });
    y += rowH;
  });
  doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
  y += 16;

  const boxW = 240;
  const boxX = right - boxW;
  doc.roundedRect(boxX, y, boxW, 34, 4).lineWidth(1.2).strokeColor(INK).stroke();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text('AMOUNT PAID', boxX + 10, y + 12.5, { width: 90 });
  doc.fontSize(12.5).text(money(payment.amount, payment.currency), boxX + 90, y + 11, { width: boxW - 100, align: 'right' });
  y += 44;
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(amountInWords(payment.amount, payment.currency), left, y, { width });
  y = doc.y;
  if (payment.notes) {
    doc.fillColor(INK).font('Helvetica').fontSize(9).text(payment.notes, left, y + 8, { width });
    y = doc.y;
  }

  const sigY = signatureY(doc, y);
  const sigW = 190;
  doc.moveTo(left, sigY).lineTo(left + sigW, sigY).strokeColor(MUTED).lineWidth(0.75).stroke();
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('RECEIVED BY', left, sigY + 5, { width: sigW, characterSpacing: 0.8 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(payment.recordedBy, left, sigY + 17, { width: sigW });

  footers(doc, company);
  doc.end();
  return done;
}
