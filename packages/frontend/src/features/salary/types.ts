import type { CurrencyCode, Payslip, SalaryHistory } from '@quro/shared';
import type { LucideIcon } from 'lucide-react';
import type { ApiPdfDocument } from '@/lib/pdfDocuments';

export type FmtFn = (value: number, fromCurrency?: CurrencyCode) => string;

export type SalaryStatCard = {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  color: 'indigo' | 'emerald' | 'rose' | 'amber';
};

export type SalaryChartEntry = {
  year: string;
  gross: number;
};

export type SalaryHistoryEntry = Pick<SalaryHistory, 'year' | 'annualSalary' | 'currency'>;

export type PayslipFormState = {
  month: string;
  date: string;
  gross: string;
  tax: string;
  pension: string;
  bonus: string;
  currency: CurrencyCode;
};

export type PayslipFieldErrorMap = Record<string, string>;

export type ApiPayslip = Omit<
  Payslip,
  'gross' | 'tax' | 'pension' | 'net' | 'bonus' | 'document'
> & {
  gross: number | string;
  tax: number | string;
  pension: number | string;
  net: number | string;
  bonus: number | string | null;
  document?: ApiPdfDocument | null;
};

export type ApiSalaryHistory = Omit<SalaryHistory, 'annualSalary'> & {
  annualSalary: number | string;
};

export type SavePayslipInput = Omit<Payslip, 'id' | 'document'>;
