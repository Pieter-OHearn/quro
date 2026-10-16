import { CURRENCY_CODES, type CsvImportKind, type CsvImportProfile } from '@quro/shared';
import { DateInput, FormField, SelectInput, TextInput } from '@/components/ui';
import {
  DATE_FORMAT_OPTIONS,
  NO_COLUMN,
  draftFromProfile,
  type MappingDraft,
} from '../mappingDraft';
import type { CsvDescription } from '../hooks';

type Props = {
  kind: CsvImportKind;
  description: CsvDescription;
  draft: MappingDraft;
  profiles: CsvImportProfile[];
  onChange: (draft: MappingDraft) => void;
};

type ColumnFieldProps = {
  label: string;
  field: keyof MappingDraft['columns'];
  optional?: boolean;
  headers: string[];
  draft: MappingDraft;
  onChange: (draft: MappingDraft) => void;
};

function ColumnField({
  label,
  field,
  optional,
  headers,
  draft,
  onChange,
}: Readonly<ColumnFieldProps>) {
  const options = [{ value: NO_COLUMN, label: optional ? 'None' : 'Choose a column' }].concat(
    headers.map((header) => ({ value: header, label: header })),
  );
  return (
    <FormField label={label} required={!optional}>
      <SelectInput
        value={draft.columns[field]}
        options={options}
        onChange={(value) => onChange({ ...draft, columns: { ...draft.columns, [field]: value } })}
      />
    </FormField>
  );
}

function AmountColumns(props: Readonly<Omit<ColumnFieldProps, 'label' | 'field'>>) {
  const { draft, onChange } = props;
  return (
    <>
      <FormField label="Amounts are in" required>
        <SelectInput
          value={draft.amountMode}
          options={[
            { value: 'signed', label: 'One column, money out is negative' },
            { value: 'split', label: 'Two columns, debit and credit' },
          ]}
          onChange={(value) =>
            onChange({ ...draft, amountMode: value as MappingDraft['amountMode'] })
          }
        />
      </FormField>
      {draft.amountMode === 'signed' ? (
        <ColumnField {...props} label="Amount column" field="amount" />
      ) : (
        <>
          <ColumnField {...props} label="Debit column (money out)" field="debit" optional />
          <ColumnField {...props} label="Credit column (money in)" field="credit" optional />
        </>
      )}
    </>
  );
}

function SavedMappings({
  profiles,
  draft,
  onChange,
}: Readonly<Pick<Props, 'profiles' | 'draft' | 'onChange'>>) {
  if (profiles.length === 0) return null;
  return (
    <FormField label="Saved mapping" hint="(optional)">
      <SelectInput
        value=""
        options={[
          { value: '', label: 'Choose to fill in the form' },
          ...profiles.map((profile) => ({ value: String(profile.id), label: profile.source })),
        ]}
        onChange={(id) => {
          const profile = profiles.find((candidate) => String(candidate.id) === id);
          if (profile) onChange(draftFromProfile(draft, profile));
        }}
      />
    </FormField>
  );
}

function FormatFields({ draft, onChange }: Readonly<Pick<Props, 'draft' | 'onChange'>>) {
  return (
    <>
      <FormField label="Date format">
        <SelectInput
          value={draft.dateFormat}
          options={DATE_FORMAT_OPTIONS}
          onChange={(value) =>
            onChange({ ...draft, dateFormat: value as MappingDraft['dateFormat'] })
          }
        />
      </FormField>
      <FormField label="Decimal separator">
        <SelectInput
          value={draft.decimalSeparator}
          options={[
            { value: '.', label: 'Dot, as in 1,234.56' },
            { value: ',', label: 'Comma, as in 1.234,56' },
          ]}
          onChange={(value) =>
            onChange({ ...draft, decimalSeparator: value as MappingDraft['decimalSeparator'] })
          }
        />
      </FormField>
      <FormField label="Currency of rows without one">
        <SelectInput
          value={draft.defaultCurrency}
          options={[...CURRENCY_CODES]}
          onChange={(value) =>
            onChange({ ...draft, defaultCurrency: value as MappingDraft['defaultCurrency'] })
          }
        />
      </FormField>
    </>
  );
}

function SignOption({ draft, onChange }: Readonly<Pick<Props, 'draft' | 'onChange'>>) {
  return (
    <label className="flex items-center gap-2 text-cell text-fg max-sm:min-h-11">
      <input
        type="checkbox"
        checked={draft.invertSign}
        onChange={(event) => onChange({ ...draft, invertSign: event.target.checked })}
        className="h-4 w-4 rounded-sm border-border-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
      />
      The file writes money going out as positive numbers
    </label>
  );
}

function SavingsFields({ props }: Readonly<{ props: Props }>) {
  const { description, draft, onChange } = props;
  return (
    <>
      <ColumnField
        label="Running balance column"
        field="balance"
        optional
        headers={description.headers}
        draft={draft}
        onChange={onChange}
      />
      <FormField label="Statement closing balance" hint="(only if the file has no balance column)">
        <TextInput
          inputMode="decimal"
          value={draft.closingBalance}
          onChange={(value) => onChange({ ...draft, closingBalance: value })}
        />
      </FormField>
      <FormField label="Closing balance date">
        <DateInput
          value={draft.closingDate}
          onChange={(value) => onChange({ ...draft, closingDate: value })}
        />
      </FormField>
    </>
  );
}

function BudgetFields({ props }: Readonly<{ props: Props }>) {
  const { description, draft, onChange } = props;
  const shared = { headers: description.headers, draft, onChange, optional: true };
  return (
    <>
      <ColumnField {...shared} label="Category column" field="category" />
      <ColumnField {...shared} label="Merchant column" field="merchant" />
      <FormField label="Category for rows without one">
        <TextInput
          value={draft.defaultCategory}
          onChange={(value) => onChange({ ...draft, defaultCategory: value })}
        />
      </FormField>
    </>
  );
}

function Sample({ description }: Readonly<{ description: CsvDescription }>) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-default">
      <table className="min-w-full text-caption">
        <thead className="bg-surface-sunken text-left text-fg-muted">
          <tr>
            {description.headers.map((header) => (
              <th key={header} className="px-2 py-1 font-medium whitespace-nowrap">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {description.sample.map((cells, index) => (
            <tr key={index} className="border-t border-border-subtle text-fg">
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex} className="max-w-48 truncate px-2 py-1 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MappingStep(props: Readonly<Props>) {
  const { kind, description, draft, profiles, onChange } = props;
  const shared = { headers: description.headers, draft, onChange };
  return (
    <div className="space-y-3">
      <p className="text-cell text-fg-muted">
        {description.rowCount} rows found. Match the columns once; Quro can remember the choice for
        the next file from the same source.
      </p>
      <Sample description={description} />
      <SavedMappings profiles={profiles} draft={draft} onChange={onChange} />
      <FormField label="Source" required hint="(names where the file comes from)">
        <TextInput
          value={draft.source}
          maxLength={60}
          placeholder="Bank and account"
          onChange={(value) => onChange({ ...draft, source: value })}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <ColumnField {...shared} label="Date column" field="date" />
        <ColumnField {...shared} label="Description column" field="description" />
        <AmountColumns {...shared} />
        <ColumnField {...shared} label="Currency column" field="currency" optional />
        <ColumnField {...shared} label="Bank id column" field="externalId" optional />
        {kind === 'savings' ? <SavingsFields props={props} /> : <BudgetFields props={props} />}
        <FormatFields draft={draft} onChange={onChange} />
      </div>
      <SignOption draft={draft} onChange={onChange} />
    </div>
  );
}
