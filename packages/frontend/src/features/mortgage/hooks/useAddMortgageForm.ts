import { useState } from 'react';
import type { CurrencyCode } from '@/lib/CurrencyContext';
import type { Mortgage as MortgageType, Property } from '@quro/shared';
import type { MortgageFormPayload, MortgageFormState } from '../types';

type UseAddMortgageFormParams = {
  existing?: MortgageType;
  properties: Property[];
  linkedPropertyId: number | null;
  onClose: () => void;
  onSave: (mortgage: MortgageFormPayload) => Promise<void> | void;
};

const DEFAULT_OVERPAYMENT_LIMIT_PERCENT = 10;

const n = (value: string) => parseFloat(value) || 0;

function validateMortgageRequiredFields(form: MortgageFormState): Record<string, string> {
  const next: Record<string, string> = {};
  if (!form.linkedPropertyId) next.linkedPropertyId = 'Select a property to continue';
  if (!form.propertyAddress.trim()) next.propertyAddress = 'Required';
  if (!form.lender.trim()) next.lender = 'Required';
  return next;
}

function validateMortgageAmounts(form: MortgageFormState): Record<string, string> {
  const next: Record<string, string> = {};
  if (!form.originalAmount || n(form.originalAmount) <= 0)
    next.originalAmount = 'Enter a valid amount';
  if (!form.outstandingBalance || n(form.outstandingBalance) < 0)
    next.outstandingBalance = 'Enter a valid amount';
  if (!form.propertyValue || n(form.propertyValue) <= 0)
    next.propertyValue = 'Enter a valid amount';
  if (!form.monthlyPayment || n(form.monthlyPayment) <= 0)
    next.monthlyPayment = 'Enter a valid amount';
  return next;
}

function validateMortgageRateAndTerm(form: MortgageFormState): Record<string, string> {
  const next: Record<string, string> = {};
  if (!form.interestRate || n(form.interestRate) <= 0) next.interestRate = 'Enter a valid rate';
  if (!form.termYears || n(form.termYears) <= 0) next.termYears = 'Enter term in years';
  return next;
}

function validateMortgageForm(form: MortgageFormState): Record<string, string> {
  return {
    ...validateMortgageRequiredFields(form),
    ...validateMortgageAmounts(form),
    ...validateMortgageRateAndTerm(form),
  };
}

function buildPayload(form: MortgageFormState, existing?: MortgageType): MortgageFormPayload {
  return {
    linkedPropertyId: Number.parseInt(form.linkedPropertyId, 10),
    propertyAddress: form.propertyAddress.trim(),
    lender: form.lender.trim(),
    currency: form.currency,
    originalAmount: n(form.originalAmount),
    outstandingBalance: n(form.outstandingBalance),
    propertyValue: n(form.propertyValue),
    monthlyPayment: n(form.monthlyPayment),
    interestRate: n(form.interestRate),
    rateType: form.rateType,
    fixedUntil: form.rateType === 'Fixed' ? form.fixedUntil.trim() || 'N/A' : 'N/A',
    termYears: n(form.termYears),
    startDate: form.startDate.trim() || 'N/A',
    endDate: form.endDate.trim() || 'N/A',
    overpaymentLimit: n(form.overpaymentLimit) || DEFAULT_OVERPAYMENT_LIMIT_PERCENT,
    ...(existing ? { id: existing.id } : {}),
  };
}

function applyLinkedProperty(
  next: MortgageFormState,
  value: string,
  properties: Property[],
): MortgageFormState {
  const selectedId = Number.parseInt(String(value), 10);
  const property = Number.isInteger(selectedId)
    ? properties.find((entry) => entry.id === selectedId)
    : undefined;
  if (property) {
    next.propertyAddress = property.address;
    next.currency = property.currency;
    next.propertyValue = property.currentValue.toString();
  }
  return next;
}

function buildInitialMortgageState(
  existing: MortgageType | undefined,
  linkedPropertyId: number | null,
): MortgageFormState {
  const linkedPropId = linkedPropertyId ? String(linkedPropertyId) : '';

  if (!existing) {
    return {
      linkedPropertyId: linkedPropId,
      propertyAddress: '',
      lender: '',
      currency: 'EUR' as CurrencyCode,
      originalAmount: '',
      outstandingBalance: '',
      propertyValue: '',
      monthlyPayment: '',
      interestRate: '',
      rateType: 'Fixed',
      fixedUntil: '',
      termYears: '',
      startDate: '',
      endDate: '',
      overpaymentLimit: '10',
    };
  }

  return {
    linkedPropertyId: linkedPropId,
    propertyAddress: existing.propertyAddress,
    lender: existing.lender,
    currency: existing.currency as CurrencyCode,
    originalAmount: String(existing.originalAmount ?? ''),
    outstandingBalance: String(existing.outstandingBalance ?? ''),
    propertyValue: String(existing.propertyValue ?? ''),
    monthlyPayment: String(existing.monthlyPayment ?? ''),
    interestRate: String(existing.interestRate ?? ''),
    rateType: existing.rateType,
    fixedUntil: existing.fixedUntil,
    termYears: String(existing.termYears ?? ''),
    startDate: existing.startDate,
    endDate: existing.endDate,
    overpaymentLimit: String(existing.overpaymentLimit ?? '10'),
  };
}

export function useAddMortgageForm({
  existing,
  properties,
  linkedPropertyId,
  onClose,
  onSave,
}: UseAddMortgageFormParams) {
  const [form, setForm] = useState<MortgageFormState>(() =>
    buildInitialMortgageState(existing, linkedPropertyId),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof MortgageFormState>(field: K, value: MortgageFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'linkedPropertyId') {
        return applyLinkedProperty(next, String(value), properties);
      }
      return next;
    });

    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSave = async () => {
    const nextErrors = validateMortgageForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      await onSave(buildPayload(form, existing));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return { form, errors, saving, setField, handleSave };
}
