import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui';
import { CsvImportDialog } from '@/features/import/components';

/** The budget page's entry to the reviewed CSV import. */
export function BudgetImportAction() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end">
      <Button
        variant="secondary"
        size="sm"
        leadingIcon={<Upload size={12} aria-hidden="true" />}
        onClick={() => setOpen(true)}
      >
        Import CSV
      </Button>
      {open && <CsvImportDialog kind="budget" onClose={() => setOpen(false)} />}
    </div>
  );
}
