import { FormField, TextInput } from './FormField';

type DateNoteRowProps = {
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
        <input
          type="date"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </FormField>
      <FormField label="Note" hint="optional">
        <TextInput value={note} onChange={onNoteChange} placeholder={notePlaceholder} />
      </FormField>
    </div>
  );
}
