import { useRef } from 'react';
import { FileText } from 'lucide-react';
import { CSV_IMPORT_LIMITS, type CsvImportKind } from '@quro/shared';
import { Button, LoadingSpinner } from '@/components/ui';

type Props = {
  kind: CsvImportKind;
  busy: boolean;
  onFile: (file: File) => void;
};

/** Where a file's rows go, for the first line of the dialog. */
export function importTarget(kind: CsvImportKind): string {
  return kind === 'savings'
    ? 'Rows become deposits and withdrawals on this account.'
    : 'Rows become budget expenses, grouped by category and month.';
}

export function FileStep({ kind, busy, onFile }: Readonly<Props>) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <p className="text-cell text-fg-muted">
        {importTarget(kind)} You choose the columns, review every row, and nothing is written until
        you confirm. A CSV can be up to {CSV_IMPORT_LIMITS.maxBytes / 1_000_000} MB and{' '}
        {CSV_IMPORT_LIMITS.maxRows} rows.
      </p>
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="sr-only"
        aria-label="CSV file"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) onFile(chosen);
          event.target.value = '';
        }}
      />
      {busy ? (
        <LoadingSpinner />
      ) : (
        <Button
          variant="primary"
          leadingIcon={<FileText size={16} aria-hidden="true" />}
          onClick={() => input.current?.click()}
        >
          Choose a CSV file
        </Button>
      )}
    </div>
  );
}
