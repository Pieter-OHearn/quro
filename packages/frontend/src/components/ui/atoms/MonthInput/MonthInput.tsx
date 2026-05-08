import { TextInput, type TextInputProps } from '../TextInput';

export type MonthInputProps = Omit<TextInputProps, 'type'>;

export function MonthInput(props: MonthInputProps) {
  return <TextInput type="month" {...props} />;
}
