import { useEffect, useState } from 'react';
import type { Employment, EmploymentInput, EmploymentType } from '@quro/shared';
import { FormField, Modal, ModalFooter, SelectInput, TextInput } from '@/components/ui';
import { useCreateEmployment, useUpdateEmployment } from './hooks';

const TYPE_OPTIONS = [
  { value: 'employed', label: 'Employee' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'other', label: 'Other' },
];

type Form = {
  employerName: string;
  employmentType: EmploymentType;
  serviceStartDate: string;
  endDate: string;
  noticePeriodMonths: string;
};

// eslint-disable-next-line complexity
function toForm(employment: Employment | null): Form {
  return {
    employerName: employment?.employerName ?? '',
    employmentType: employment?.employmentType ?? 'employed',
    serviceStartDate: employment?.serviceStartDate ?? '',
    endDate: employment?.endDate ?? '',
    noticePeriodMonths:
      employment?.noticePeriodMonths === null || employment?.noticePeriodMonths === undefined
        ? ''
        : String(employment.noticePeriodMonths),
  };
}

// eslint-disable-next-line max-lines-per-function
export function EmploymentEditorModal({
  employment,
  onClose,
}: Readonly<{ employment: Employment | null; onClose: () => void }>) {
  const createEmployment = useCreateEmployment();
  const updateEmployment = useUpdateEmployment();
  const [form, setForm] = useState(() => toForm(employment));
  const [error, setError] = useState('');
  useEffect(() => setForm(toForm(employment)), [employment]);

  const pending = createEmployment.isPending || updateEmployment.isPending;
  const set = <K extends keyof Form>(field: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [field]: value }));
  // eslint-disable-next-line complexity
  const save = async () => {
    if (!form.employerName.trim()) return setError('Employer or business name is required.');
    if (form.employmentType === 'employed' && !form.serviceStartDate) {
      return setError('Continuous-service start date is required for employees.');
    }
    const notice = form.noticePeriodMonths.trim() === '' ? null : Number(form.noticePeriodMonths);
    if (notice !== null && (!Number.isInteger(notice) || notice < 0 || notice > 24)) {
      return setError('Notice period must be between 0 and 24 months.');
    }
    const input: EmploymentInput = {
      employerName: form.employerName.trim(),
      employmentType: form.employmentType,
      serviceStartDate: form.serviceStartDate || null,
      endDate: form.endDate || null,
      noticePeriodMonths: notice,
      isPrimary: true,
    };
    setError('');
    try {
      if (employment) await updateEmployment.mutateAsync({ id: employment.id, patch: input });
      else await createEmployment.mutateAsync(input);
      onClose();
    } catch {
      setError('Employment details could not be saved.');
    }
  };

  return (
    <Modal
      title={employment ? 'Update employment' : 'Add employment'}
      subtitle="Shared by Salary and your runway plan"
      onClose={onClose}
      maxWidth="lg"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => void save()}
          confirmLabel="Save employment"
          loading={pending}
          disabled={pending}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Employer or business" required>
          <TextInput
            value={form.employerName}
            onChange={(value) => set('employerName', value)}
            placeholder="Employer name"
          />
        </FormField>
        <FormField label="Employment type" required>
          <SelectInput
            value={form.employmentType}
            onChange={(value) => set('employmentType', value as EmploymentType)}
            options={TYPE_OPTIONS}
          />
        </FormField>
        <FormField
          label="Continuous-service start date"
          required={form.employmentType === 'employed'}
          hint="Used to keep tenure and severance current automatically"
        >
          <TextInput
            aria-label="Continuous-service start date"
            type="date"
            value={form.serviceStartDate}
            onChange={(value) => set('serviceStartDate', value)}
          />
        </FormField>
        <FormField label="End date" hint="Leave blank for a current role">
          <TextInput
            aria-label="Employment end date"
            type="date"
            value={form.endDate}
            onChange={(value) => set('endDate', value)}
          />
        </FormField>
        <FormField
          label="Contractual notice (months)"
          hint="Your contract or collective agreement may specify this"
        >
          <TextInput
            type="number"
            min={0}
            max={24}
            step="1"
            value={form.noticePeriodMonths}
            onChange={(value) => set('noticePeriodMonths', value)}
          />
        </FormField>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </Modal>
  );
}
