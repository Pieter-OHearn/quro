import { normalizePdfDocument } from '@/lib/pdfDocuments';
import type { Payslip } from '@quro/shared';
import type { ApiPayslip } from '../types';

export const normalizePayslip = (payslip: ApiPayslip): Payslip => ({
  ...payslip,
  document: normalizePdfDocument(payslip.document),
});
