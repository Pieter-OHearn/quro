import { DateInput, TextInput } from '../../atoms';
import { FormField } from '../FormField';

export type DateNoteRowProps = {
  date: string;
  note: string;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  notePlaceholder?: string;
};

export function DateNoteRow({
  date,
  note,
  onDateChange,
  onNoteChange,
  notePlaceholder = 'e.g. Monthly...',
}: DateNoteRowProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <FormField label="Date">
        <DateInput value={date} onChange={onDateChange} />
      </FormField>
      <FormField label="Note" hint="optional">
        <TextInput value={note} onChange={onNoteChange} placeholder={notePlaceholder} />
      </FormField>
    </div>
  );
}
