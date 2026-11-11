import PDFDocument from 'pdfkit';
import type { ReportCell, ReportColumn, ReportDto } from '@tsm/shared';
import { amountFormat, collect, contactAndMeta, footers, headerBand, PDF_COLORS, quantityFormat } from './pdf-theme';
import type { PdfCompany } from './proforma-pdf';

const { NAVY, MUTED, RULE, SHADE, INK } = PDF_COLORS;

function cellText(column: ReportColumn, value: ReportCell): string {
  if (value === null || value === undefined || value === '') return '';
  switch (column.format) {
    case 'money':
      return amountFormat.format(Number(value));
    case 'quantity':
      return quantityFormat.format(Number(value));
    case 'percent':
      return `${value}%`;
    default:
      return String(value);
  }
}

const RIGHT = new Set(['money', 'quantity', 'count', 'percent']);

/** Any report as a landscape table, with its criteria and notes, readable when printed. */
export function renderReportPdf(report: ReportDto, company: PdfCompany): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true, info: { Title: report.title, Author: company.name } });
  const done = collect(doc);
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const bottomLimit = doc.page.height - 60;

  headerBand(doc, company, 'REPORT', report.title.toUpperCase(), { compact: true });
  let { bottom: y } = contactAndMeta(doc, company, [['Generated', report.generatedAt.slice(0, 16).replace('T', ' ')], ...report.criteria.map((c) => {
    const [label, ...rest] = c.split(': ');
    return [rest.length ? label! : 'Scope', rest.length ? rest.join(': ') : c] as [string, string];
  })], { compact: true });

  const widths = report.columns.map((c) => (c.format === 'text' ? 2 : 1.2));
  const unit = width / widths.reduce((a, b) => a + b, 0);
  const xs: number[] = [];
  widths.reduce((x, w) => (xs.push(x), x + w * unit), left);

  const head = () => {
    doc.rect(left, y, width, 20).fill(NAVY);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    report.columns.forEach((c, i) =>
      doc.text(c.label.toUpperCase(), xs[i]! + 4, y + 7, { width: widths[i]! * unit - 8, align: RIGHT.has(c.format) ? 'right' : 'left', lineBreak: false }),
    );
    y += 20;
  };
  const line = (row: Record<string, ReportCell>, shade: boolean, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    const h = Math.max(...report.columns.map((c, i) => doc.heightOfString(cellText(c, row[c.key] ?? null), { width: widths[i]! * unit - 8 })), 10) + 8;
    if (y + h > bottomLimit) {
      doc.addPage();
      y = 40;
      head();
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    }
    if (shade) doc.rect(left, y, width, h).fill(SHADE);
    doc.fillColor(INK);
    report.columns.forEach((c, i) =>
      doc.text(cellText(c, row[c.key] ?? null), xs[i]! + 4, y + 4, { width: widths[i]! * unit - 8, align: RIGHT.has(c.format) ? 'right' : 'left' }),
    );
    y += h;
  };

  head();
  if (report.rows.length === 0) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No records match these criteria.', left, y + 8);
    y = doc.y + 8;
  }
  report.rows.forEach((r, i) => line(r, i % 2 === 1));
  if (report.totals.length) {
    doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
    report.totals.forEach((t) => line(t, false, true));
  }
  y += 12;
  if (y > bottomLimit - 40) {
    doc.addPage();
    y = 40;
  }
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
  for (const note of report.notes) {
    doc.text(`• ${note}`, left, y, { width });
    y = doc.y + 2;
  }

  footers(doc, company);
  doc.end();
  return done;
}
