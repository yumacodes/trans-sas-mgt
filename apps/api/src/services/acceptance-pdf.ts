import PDFDocument from 'pdfkit';
import type { AcceptanceDto } from '@tsm/shared';
import type { PdfCompany } from './proforma-pdf';
import { collect, contactAndMeta, footers, headerBand, longDate, partyCard, PDF_COLORS } from './pdf-theme';

const { NAVY, INK, MUTED } = PDF_COLORS;

/** Render an acceptance letter on one A4 page (more only if the text is very long). */
export function renderAcceptancePdf(letter: AcceptanceDto, company: PdfCompany): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    bufferPages: true,
    info: { Title: `Acceptance Letter ${letter.number}`, Author: company.name },
  });
  const done = collect(doc);

  const left = 40;
  const width = doc.page.width - 80;

  headerBand(doc, company, 'ACCEPTANCE', 'LETTER');
  let { bottom: y } = contactAndMeta(doc, company, [
    ['Our ref', letter.number],
    ...(letter.yourReference ? ([['Your ref', letter.yourReference]] as [string, string][]) : []),
    ['Date', longDate(letter.letterDate)],
  ]);
  y = partyCard(doc, y, 'TO', letter.recipientName, letter.recipientAddress ? [letter.recipientAddress] : []);
  y += 28;

  doc.fillColor(INK).font('Helvetica').fontSize(10.5).text('Dear Sir/Madam,', left, y);
  y = doc.y + 18;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(letter.subject, left, y, { width, align: 'center', underline: true });
  y = doc.y + 18;
  doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(letter.body, left, y, { width, lineGap: 3, paragraphGap: 4 });
  y = doc.y + 28;
  doc.text('Yours faithfully,', left, y);
  // Space for a hand signature and stamp, then the signatory.
  y = doc.y + 52;
  if (y > doc.page.height - 110) {
    doc.addPage();
    y = 80;
  }
  doc.moveTo(left, y).lineTo(left + 200, y).strokeColor(MUTED).lineWidth(0.75).dash(2, { space: 2 }).stroke().undash();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(letter.signatoryName.toUpperCase(), left, y + 6, { width: 300 });
  if (letter.signatoryTitle) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(`(${letter.signatoryTitle.toUpperCase()})`, left, doc.y + 1, { width: 300 });
  }

  footers(doc, company);
  doc.end();
  return done;
}
