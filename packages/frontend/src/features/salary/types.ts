import type { Payslip, SalaryHistory } from '@quro/shared';
import type { LucideIcon } from 'lucide-react';

export type FmtFn = (value: number) => string;

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

export type SalaryHistoryEntry = Pick<SalaryHistory, 'year' | 'annualSalary'>;

export type PayslipFormState = {
  month: string;
  date: string;
  gross: string;
  tax: string;
  pension: string;
  bonus: string;
};

export type PayslipFieldErrorMap = Record<string, string>;

export type ApiPayslip = Omit<Payslip, 'gross' | 'tax' | 'pension' | 'net' | 'bonus'> & {
  gross: number | string;
  tax: number | string;
  pension: number | string;
  net: number | string;
  bonus: number | string | null;
};

export type ApiSalaryHistory = Omit<SalaryHistory, 'annualSalary'> & {
  annualSalary: number | string;
};
