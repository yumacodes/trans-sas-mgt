import PDFDocument from 'pdfkit';
import { WAYBILL_STATUS_LABELS, type WaybillDto } from '@tsm/shared';
import { collect, contactAndMeta, footers, headerBand, longDate, partyCard, PDF_COLORS, quantityFormat, signatureY, ruledHead } from './pdf-theme';
import type { PdfCompany } from './proforma-pdf';

const { NAVY, MUTED, RULE, SHADE, INK } = PDF_COLORS;

/** Delivery note listing what left the branch, with signature lines for both sides. */
export function renderWaybillPdf(waybill: WaybillDto, company: PdfCompany): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: `Waybill ${waybill.number}`, Author: company.name },
  });
  const done = collect(doc);
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const bottomLimit = doc.page.height - 60;

  headerBand(doc, company, 'WAYBILL', 'DELIVERY NOTE');
  let { bottom: y } = contactAndMeta(doc, company, [
    ['Waybill no.', waybill.number],
    ['Delivery date', longDate(waybill.deliveryDate)],
    ...(waybill.sale ? ([['Sale', waybill.sale.number]] as [string, string][]) : []),
    ...(waybill.branch ? ([['Dispatch from', waybill.branch.name]] as [string, string][]) : []),
    ['Status', WAYBILL_STATUS_LABELS[waybill.status]],
  ]);
  const transport = [
    waybill.carrier ? `Carrier: ${waybill.carrier}` : null,
    waybill.vehicleNumber ? `Vehicle: ${waybill.vehicleNumber}` : null,
  ].filter((l): l is string => Boolean(l));
  y = partyCard(doc, y, 'DELIVER TO', waybill.recipientName, [
    ...(waybill.deliveryAddress ? [waybill.deliveryAddress] : []),
    ...transport,
  ]);
  y += 18;

  const qtyW = 80;
  const unitW = 80;
  const numW = 30;
  const nameW = width - qtyW - unitW - numW;
  const head = () => {
    ruledHead(doc, left, y, width, 24);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(8);
    doc.text('#', left + 8, y + 8.5, { width: numW - 8 });
    doc.text('ITEM', left + numW, y + 8.5, { width: nameW - 8 });
    doc.text('QTY', left + numW + nameW, y + 8.5, { width: qtyW - 8, align: 'right' });
    doc.text('UNIT', left + numW + nameW + qtyW + 8, y + 8.5, { width: unitW - 8 });
    y += 24;
  };
  head();
  waybill.items.forEach((item, i) => {
    doc.font('Helvetica').fontSize(9.5);
    const rowH = Math.max(doc.heightOfString(item.name, { width: nameW - 8 }), 12) + 12;
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = 50;
      head();
      doc.font('Helvetica').fontSize(9.5);
    }
    if (i % 2 === 1) doc.rect(left, y, width, rowH).fill(SHADE);
    doc.fillColor(MUTED).text(String(i + 1), left + 8, y + 6, { width: numW - 8 });
    doc.fillColor(INK).text(item.name, left + numW, y + 6, { width: nameW - 8 });
    doc.text(quantityFormat.format(Number(item.quantity)), left + numW + nameW, y + 6, { width: qtyW - 8, align: 'right' });
    doc.text(item.unit, left + numW + nameW + qtyW + 8, y + 6, { width: unitW - 8 });
    y += rowH;
  });
  doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
  y += 14;

  if (waybill.notes) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(waybill.notes, left, y, { width });
    y = doc.y;
  }

  const sigY = signatureY(doc, y);
  const sigW = 190;
  const sig = (x: number, label: string, name: string) => {
    doc.moveTo(x, sigY).lineTo(x + sigW, sigY).strokeColor(MUTED).lineWidth(0.75).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label.toUpperCase(), x, sigY + 5, { width: sigW, characterSpacing: 0.8 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(name, x, sigY + 17, { width: sigW });
  };
  sig(left, 'Dispatched by', waybill.preparedBy);
  sig(right - sigW, 'Received by', waybill.receivedBy ?? '');

  footers(doc, company);
  doc.end();
  return done;
}
