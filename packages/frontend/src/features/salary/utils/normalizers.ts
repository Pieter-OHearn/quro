import type { Payslip, SalaryHistory } from '@quro/shared';
import type { ApiPayslip, ApiSalaryHistory } from '../types';

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const normalizePayslip = (payslip: ApiPayslip): Payslip => ({
  ...payslip,
  gross: toNumber(payslip.gross),
  tax: toNumber(payslip.tax),
  pension: toNumber(payslip.pension),
  net: toNumber(payslip.net),
  bonus: payslip.bonus == null ? null : toNumber(payslip.bonus),
});

export const normalizeSalaryHistory = (entry: ApiSalaryHistory): SalaryHistory => ({
  ...entry,
  annualSalary: toNumber(entry.annualSalary),
});
