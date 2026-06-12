import { normalizePdfDocument } from '@/lib/pdfDocuments';
import type { Payslip, SalaryHistory } from '@quro/shared';
import type { ApiPayslip, ApiSalaryHistory } from '../types';

export const normalizePayslip = (payslip: ApiPayslip): Payslip => ({
  ...payslip,
  document: normalizePdfDocument(payslip.document),
});

export const normalizeSalaryHistory = (entry: ApiSalaryHistory): SalaryHistory => entry;
