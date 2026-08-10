import { useState } from 'react';
import type { EmploymentProfileInput, EmploymentType } from '@quro/shared';
import { BriefcaseBusiness } from 'lucide-react';
import { Button, Card, FormField, SelectInput, TextInput } from '@/components/ui';
import { useUpdateEmployment } from '../hooks';

const EMPLOYMENT_OPTIONS = [
  { value: '', label: 'Select employment type' },
  { value: 'employed', label: 'Employed' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'other', label: 'Other' },
] as const;

function optionalNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function RunwaySetupCard() {
  const updateEmployment = useUpdateEmployment();
  const [employmentType, setEmploymentType] = useState<EmploymentType | ''>('');
  const [tenureMonths, setTenureMonths] = useState('');
  const [noticePeriodMonths, setNoticePeriodMonths] = useState('');
  const [hasDependents, setHasDependents] = useState('');

  const submit = () => {
    const input: EmploymentProfileInput = {
      employmentType: employmentType || null,
      tenureMonths: optionalNumber(tenureMonths),
      noticePeriodMonths: optionalNumber(noticePeriodMonths),
      hasDependents: hasDependents === '' ? null : hasDependents === 'yes',
    };
    updateEmployment.mutate(input);
  };

  return (
    <Card className="border-sky-200 bg-sky-50/60">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white p-2 text-sky-700 shadow-sm">
          <BriefcaseBusiness size={20} />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-slate-900">Refine income support</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            The runway already uses available balances and spending. These details add notice,
            severance, and jurisdiction benefits without blocking the estimate.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FormField label="Employment type">
              <SelectInput
                value={employmentType}
                onChange={(value) => setEmploymentType(value as EmploymentType | '')}
                options={EMPLOYMENT_OPTIONS}
              />
            </FormField>
            <FormField label="Tenure (months)">
              <TextInput
                type="number"
                min={0}
                max={720}
                value={tenureMonths}
                onChange={setTenureMonths}
              />
            </FormField>
            <FormField label="Notice period (months)">
              <TextInput
                type="number"
                min={0}
                max={24}
                step="1"
                value={noticePeriodMonths}
                onChange={setNoticePeriodMonths}
              />
            </FormField>
            <FormField label="Financial dependants">
              <SelectInput
                value={hasDependents}
                onChange={setHasDependents}
                options={[
                  { value: '', label: 'Not specified' },
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
              />
            </FormField>
          </div>
          {updateEmployment.isError ? (
            <p className="mt-3 text-sm text-rose-600">Employment details could not be saved.</p>
          ) : null}
          <div className="mt-5 flex justify-end">
            <Button onClick={submit} loading={updateEmployment.isPending}>
              Save employment details
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
