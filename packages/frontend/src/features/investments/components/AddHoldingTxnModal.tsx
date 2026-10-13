import { HOLDING_TXN_META as TXN_META } from '../constants';
import { useMemo, useState } from 'react';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  Change,
  Modal,
  ModalFooter,
  FormField,
  CurrencyInput,
  TextInput,
  TxnTypeSelector,
  DateNoteRow,
} from '@/components/ui';
import {
  previewHoldingTrade,
  sumMoney,
  todayIsoDate,
  type Holding,
  type HoldingTransaction,
} from '@quro/shared';
import { PreviewPanel, PreviewRow } from '@/components/finance/PreviewPanel';
import { TxnAmount } from '@/components/finance/TxnAmount';
import { useUnitPriceFormatter, type UnitPriceFormatFn } from '../hooks/useUnitPriceFormatter';
import type { SaveHoldingTxnInput } from '../types';
import { getIncomeTxnLabels } from '../utils/incomeTxnLabels';
import { formatShares, type HoldingTxnType, type Position } from '../utils/position';

type AddHoldingTxnModalProps = {
  holding: Holding;
  currentPosition: Position;
  existing?: HoldingTransaction;
  onClose: () => void;
  onSave: (t: SaveHoldingTxnInput) => void;
};

type InitialHoldingTxnFormValues = {
  type: HoldingTxnType;
  shares: string;
  price: string;
  date: string;
  note: string;
};

const TXN_TYPES = ['buy', 'sell', 'dividend'] as const satisfies HoldingTxnType[];

type FmtNative = (value: number, currency: string, compact?: boolean) => string;

type BuyPreviewProps = {
  parsedShares: number;
  parsedPrice: number;
  holding: Holding;
  currentPosition: Position;
  newAvgCost: number;
  fmtNative: FmtNative;
  fmtPrice: UnitPriceFormatFn;
};

function BuyPreview({
  parsedShares,
  parsedPrice,
  holding,
  currentPosition,
  newAvgCost,
  fmtNative,
  fmtPrice,
}: BuyPreviewProps) {
  if (parsedShares <= 0) return null;
  return (
    <PreviewPanel>
      <PreviewRow label="Total cost">
        {fmtNative(parsedShares * parsedPrice, holding.currency, true)}
      </PreviewRow>
      <PreviewRow label="New avg cost">
        {fmtPrice(newAvgCost, holding.currency)}
        {newAvgCost !== currentPosition.avgCost && currentPosition.shares > 0 && (
          <span className="ml-1 text-fg-subtle">
            (was {fmtPrice(currentPosition.avgCost, holding.currency)})
          </span>
        )}
      </PreviewRow>
      <PreviewRow label="New position">
        {formatShares(currentPosition.shares + parsedShares)} shares
      </PreviewRow>
    </PreviewPanel>
  );
}

type SellPreviewProps = {
  parsedShares: number;
  parsedPrice: number;
  holding: Holding;
  currentPosition: Position;
  realizedGain: number;
  fmtNative: FmtNative;
};

function SellPreview({
  parsedShares,
  parsedPrice,
  holding,
  currentPosition,
  realizedGain,
  fmtNative,
}: SellPreviewProps) {
  if (parsedShares <= 0) return null;
  return (
    <PreviewPanel>
      <PreviewRow label="Proceeds">
        {fmtNative(parsedShares * parsedPrice, holding.currency, true)}
      </PreviewRow>
      <PreviewRow label="Realized gain/loss">
        <Change value={realizedGain} format="amount" currency={holding.currency} />
      </PreviewRow>
      <PreviewRow label="Remaining shares">
        {formatShares(Math.max(0, currentPosition.shares - parsedShares))}
      </PreviewRow>
    </PreviewPanel>
  );
}

type TxnPreviewProps = {
  type: HoldingTxnType;
  parsedShares: number;
  parsedPrice: number;
  holding: Holding;
  currentPosition: Position;
  newAvgCost: number;
  realizedGain: number;
  fmtNative: FmtNative;
  fmtPrice: UnitPriceFormatFn;
  incomeLabel: string;
};

function TxnPreview({
  type,
  parsedShares,
  parsedPrice,
  holding,
  currentPosition,
  newAvgCost,
  realizedGain,
  fmtNative,
  fmtPrice,
  incomeLabel,
}: TxnPreviewProps) {
  if (type === 'buy') {
    return (
      <BuyPreview
        parsedShares={parsedShares}
        parsedPrice={parsedPrice}
        holding={holding}
        currentPosition={currentPosition}
        newAvgCost={newAvgCost}
        fmtNative={fmtNative}
        fmtPrice={fmtPrice}
      />
    );
  }
  if (type === 'sell') {
    return (
      <SellPreview
        parsedShares={parsedShares}
        parsedPrice={parsedPrice}
        holding={holding}
        currentPosition={currentPosition}
        realizedGain={realizedGain}
        fmtNative={fmtNative}
      />
    );
  }
  return (
    <PreviewPanel>
      <PreviewRow label={`${incomeLabel} income`}>
        <TxnAmount
          value={parsedPrice}
          format={(amount) => fmtNative(amount, holding.currency, true)}
        />
      </PreviewRow>
    </PreviewPanel>
  );
}

type PositionInfoBarProps = {
  currentPosition: Position;
  holding: Holding;
  fmtPrice: UnitPriceFormatFn;
};

function PositionInfoBar({ currentPosition, holding, fmtPrice }: PositionInfoBarProps) {
  if (currentPosition.shares <= 0) return null;
  return (
    <p className="text-caption text-fg-subtle">
      <span className="font-numeric font-medium text-fg">
        {formatShares(currentPosition.shares)} shares
      </span>
      {' · '}avg cost{' '}
      <span className="font-numeric">{fmtPrice(currentPosition.avgCost, holding.currency)}</span>
      {' · '}current{' '}
      <span className="font-numeric">{fmtPrice(holding.currentPrice, holding.currency)}</span>
    </p>
  );
}

type SharesFormFieldProps = {
  type: HoldingTxnType;
  shares: string;
  parsedShares: number;
  error: string;
  currentPosition: Position;
  onChange: (value: string) => void;
};

function SharesFormField({
  type,
  shares,
  parsedShares,
  error,
  currentPosition,
  onChange,
}: SharesFormFieldProps) {
  return (
    <FormField
      label={type === 'sell' ? `Shares to sell (max: ${currentPosition.shares})` : 'Shares to buy'}
      error={error && parsedShares <= 0 ? error : undefined}
    >
      <TextInput
        type="number"
        step="0.0001"
        value={shares}
        onChange={onChange}
        error={Boolean(error) && parsedShares <= 0}
        placeholder="0"
      />
    </FormField>
  );
}

type PriceFormFieldProps = {
  type: HoldingTxnType;
  price: string;
  parsedPrice: number;
  needsShares: boolean;
  error: string;
  holding: Holding;
  incomeLabel: string;
  onChange: (value: string) => void;
};

function PriceFormField({
  type,
  price,
  parsedPrice,
  needsShares,
  error,
  holding,
  incomeLabel,
  onChange,
}: PriceFormFieldProps) {
  return (
    <FormField
      label={
        type === 'dividend'
          ? `Total ${incomeLabel.toLowerCase()} received (${holding.currency})`
          : `Price per share (${holding.currency})`
      }
      error={
        error && (parsedPrice <= 0 || (!needsShares && type === 'dividend')) ? error : undefined
      }
    >
      <CurrencyInput
        currency={holding.currency}
        value={price}
        onChange={onChange}
        error={Boolean(error) && parsedPrice <= 0}
        // Unit prices take six decimals; dividends and distributions are money, so two.
        step={type === 'dividend' ? '0.01' : '0.000001'}
      />
    </FormField>
  );
}

function validateHoldingTxn(
  type: HoldingTxnType,
  parsedPrice: number,
  parsedShares: number,
  currentPosition: Position,
): string {
  if (parsedPrice <= 0) return 'Enter a valid price / amount';
  if ((type === 'buy' || type === 'sell') && parsedShares <= 0) {
    return 'Enter a valid number of shares';
  }
  if (type === 'sell' && parsedShares > currentPosition.shares) {
    return `You only hold ${currentPosition.shares} shares`;
  }
  return '';
}

type TxnFormBodyProps = {
  type: HoldingTxnType;
  shares: string;
  price: string;
  date: string;
  note: string;
  error: string;
  parsedShares: number;
  parsedPrice: number;
  newAvgCost: number;
  realizedGain: number;
  holding: Holding;
  currentPosition: Position;
  fmtNative: FmtNative;
  fmtPrice: UnitPriceFormatFn;
  incomeLabel: string;
  onTypeChange: (t: HoldingTxnType) => void;
  onSharesChange: (v: string) => void;
  onPriceChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onNoteChange: (v: string) => void;
};

function TxnFormBodyFields(props: TxnFormBodyProps) {
  const needsShares = props.type === 'buy' || props.type === 'sell';
  return (
    <>
      <FormField label="Transaction type">
        <TxnTypeSelector<HoldingTxnType>
          types={TXN_TYPES.map((txnType) =>
            txnType === 'dividend'
              ? { ...TXN_META[txnType], label: props.incomeLabel }
              : TXN_META[txnType],
          )}
          value={props.type}
          onChange={props.onTypeChange}
        />
      </FormField>
      <PositionInfoBar
        currentPosition={props.currentPosition}
        holding={props.holding}
        fmtPrice={props.fmtPrice}
      />
      {needsShares && (
        <SharesFormField
          type={props.type}
          shares={props.shares}
          parsedShares={props.parsedShares}
          error={props.error}
          currentPosition={props.currentPosition}
          onChange={props.onSharesChange}
        />
      )}
      <PriceFormField
        type={props.type}
        price={props.price}
        parsedPrice={props.parsedPrice}
        needsShares={needsShares}
        error={props.error}
        holding={props.holding}
        incomeLabel={props.incomeLabel}
        onChange={props.onPriceChange}
      />
      <DateNoteRow
        date={props.date}
        note={props.note}
        onDateChange={props.onDateChange}
        onNoteChange={props.onNoteChange}
        notePlaceholder="e.g. DCA top-up..."
      />
    </>
  );
}

function TxnFormBody(props: TxnFormBodyProps) {
  return (
    <>
      <TxnFormBodyFields {...props} />
      {props.parsedPrice > 0 && (
        <TxnPreview
          type={props.type}
          parsedShares={props.parsedShares}
          parsedPrice={props.parsedPrice}
          holding={props.holding}
          currentPosition={props.currentPosition}
          newAvgCost={props.newAvgCost}
          realizedGain={props.realizedGain}
          fmtNative={props.fmtNative}
          fmtPrice={props.fmtPrice}
          incomeLabel={props.incomeLabel}
        />
      )}
    </>
  );
}

// Previews use the shared position rule, so they match the position once the trade is saved.
function computeNextAverageCost(
  type: HoldingTxnType,
  parsedShares: number,
  parsedPrice: number,
  currentPosition: Position,
): number {
  if (type !== 'buy' || parsedShares <= 0 || parsedPrice <= 0) return currentPosition.avgCost;
  return previewHoldingTrade(currentPosition, { type, shares: parsedShares, price: parsedPrice })
    .avgCost;
}

function computeRealizedGainEstimate(
  type: HoldingTxnType,
  parsedShares: number,
  parsedPrice: number,
  currentPosition: Position,
): number {
  if (type !== 'sell' || parsedShares <= 0 || parsedPrice <= 0) return 0;
  const next = previewHoldingTrade(currentPosition, {
    type,
    shares: parsedShares,
    price: parsedPrice,
  });
  return sumMoney([next.realizedGain, -currentPosition.realizedGain]);
}

function buildInitialHoldingTxnValues(
  existing: HoldingTransaction | undefined,
): InitialHoldingTxnFormValues {
  const today = todayIsoDate();
  return {
    type: existing?.type ?? 'buy',
    shares: existing?.shares != null ? String(existing.shares) : '',
    price: existing != null ? String(existing.price) : '',
    date: existing?.date ?? today,
    note: existing?.note ?? '',
  };
}

function parseFormNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function useHoldingTxnForm(currentPosition: Position, existing: HoldingTransaction | undefined) {
  const initialValues = buildInitialHoldingTxnValues(existing);
  const [type, setType] = useState<HoldingTxnType>(initialValues.type);
  const [shares, setShares] = useState(initialValues.shares);
  const [price, setPrice] = useState(initialValues.price);
  const [date, setDate] = useState(initialValues.date);
  const [note, setNote] = useState(initialValues.note);
  const [error, setError] = useState('');

  const parsedShares = parseFormNumber(shares);
  const parsedPrice = parseFormNumber(price);

  const newAvgCost = useMemo(
    () => computeNextAverageCost(type, parsedShares, parsedPrice, currentPosition),
    [type, parsedShares, parsedPrice, currentPosition],
  );

  const realizedGain = useMemo(
    () => computeRealizedGainEstimate(type, parsedShares, parsedPrice, currentPosition),
    [type, parsedShares, parsedPrice, currentPosition],
  );

  function handleTypeChange(t: HoldingTxnType) {
    setType(t);
    setError('');
    setShares('');
    setPrice('');
  }

  return {
    type,
    shares,
    price,
    date,
    note,
    error,
    parsedShares,
    parsedPrice,
    newAvgCost,
    realizedGain,
    setDate,
    setNote,
    setError,
    setShares,
    setPrice,
    handleTypeChange,
  };
}

function buildHoldingTxnSaveHandler(
  form: ReturnType<typeof useHoldingTxnForm>,
  holding: Holding,
  currentPosition: Position,
  existing: HoldingTransaction | undefined,
  onSave: AddHoldingTxnModalProps['onSave'],
  onClose: () => void,
) {
  return () => {
    const validationError = validateHoldingTxn(
      form.type,
      form.parsedPrice,
      form.parsedShares,
      currentPosition,
    );
    if (validationError) {
      form.setError(validationError);
      return;
    }
    const payload = {
      holdingId: holding.id,
      type: form.type,
      shares: form.type === 'buy' || form.type === 'sell' ? form.parsedShares : null,
      price: form.parsedPrice,
      date: form.date,
      note: form.note,
    };
    onSave(existing ? { id: existing.id, ...payload } : payload);
    onClose();
  };
}

export function AddHoldingTxnModal({
  holding,
  currentPosition,
  existing,
  onClose,
  onSave,
}: AddHoldingTxnModalProps) {
  const { fmtNative } = useCurrency();
  const fmtPrice = useUnitPriceFormatter();
  const incomeLabels = getIncomeTxnLabels(holding);
  const form = useHoldingTxnForm(currentPosition, existing);
  const handleSave = buildHoldingTxnSaveHandler(
    form,
    holding,
    currentPosition,
    existing,
    onSave,
    onClose,
  );
  const isEditing = Boolean(existing);
  const onSharesChange = (value: string) => {
    form.setShares(value);
    form.setError('');
  };
  const onPriceChange = (value: string) => {
    form.setPrice(value);
    form.setError('');
  };

  return (
    <Modal
      title={isEditing ? 'Edit transaction' : 'Record transaction'}
      subtitle={`${holding.ticker} · ${holding.name}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={isEditing ? 'Save changes' : 'Record'}
        />
      }
    >
      <TxnFormBody
        type={form.type}
        shares={form.shares}
        price={form.price}
        date={form.date}
        note={form.note}
        error={form.error}
        parsedShares={form.parsedShares}
        parsedPrice={form.parsedPrice}
        newAvgCost={form.newAvgCost}
        realizedGain={form.realizedGain}
        holding={holding}
        currentPosition={currentPosition}
        fmtNative={fmtNative}
        fmtPrice={fmtPrice}
        incomeLabel={incomeLabels.singular}
        onTypeChange={form.handleTypeChange}
        onSharesChange={onSharesChange}
        onPriceChange={onPriceChange}
        onDateChange={form.setDate}
        onNoteChange={form.setNote}
      />
    </Modal>
  );
}
