import { Router } from 'express';
import { REPORT_KEYS, REPORT_META, reportQuerySchema, type ReportKey } from '@tsm/shared';
import { z } from 'zod';
import { can, getAuth } from '../middleware/auth';
import { forbidden } from '../lib/errors';
import { ok } from '../lib/respond';
import { parse } from '../lib/validate';
import { pdfCompany } from '../services/pdf-company';
import { renderReportPdf } from '../services/report-pdf';
import { buildReport } from '../services/reports';

export const reportsRouter = Router();

const keySchema = z.enum(REPORT_KEYS);

function allowed(req: Parameters<typeof getAuth>[0], key: ReportKey) {
  if (!can(getAuth(req), REPORT_META[key].permission)) throw forbidden();
}

reportsRouter.get('/:key', async (req, res) => {
  const key = parse(keySchema, req.params.key);
  allowed(req, key);
  ok(res, await buildReport(getAuth(req), key, parse(reportQuerySchema, req.query)));
});

reportsRouter.get('/:key/pdf', async (req, res) => {
  const key = parse(keySchema, req.params.key);
  allowed(req, key);
  const report = await buildReport(getAuth(req), key, parse(reportQuerySchema, req.query));
  const pdf = await renderReportPdf(report, await pdfCompany(report.title));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${key}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});
