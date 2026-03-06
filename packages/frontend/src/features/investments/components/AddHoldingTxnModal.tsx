import { useMemo, useState } from 'react';
import { ShoppingCart, Sparkles, Tag } from 'lucide-react';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  Modal,
  ModalFooter,
  FormField,
  CurrencyInput,
  TextInput,
  TxnTypeSelector,
  DateNoteRow,
} from '@/components/ui';
import type { TxnTypeMeta } from '@/components/ui';
import type { Holding, HoldingTransaction } from '@quro/shared';
import type { SaveHoldingTxnInput } from '../types';
import { getIncomeTxnLabels } from '../utils/incomeTxnLabels';
import type { HoldingTxnType, Position } from '../utils/position';

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

const TXN_META: Record<HoldingTxnType, TxnTypeMeta> = {
  buy: {
    key: 'buy',
    label: 'Buy',
    icon: ShoppingCart,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
  },
  sell: {
    key: 'sell',
    label: 'Sell',
    icon: Tag,
    color: 'text-rose-500',
    bg: 'bg-rose-50',
    borderColor: 'border-rose-300',
  },
  dividend: {
    key: 'dividend',
    label: 'Dividend',
    icon: Sparkles,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    borderColor: 'border-indigo-300',
  },
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
};

function BuyPreview({
  parsedShares,
  parsedPrice,
  holding,
  currentPosition,
  newAvgCost,
  fmtNative,
}: BuyPreviewProps) {
  if (parsedShares <= 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Total cost</span>
        <span className="font-semibold text-slate-800">
          {fmtNative(parsedShares * parsedPrice, holding.currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">New avg cost</span>
        <span className="font-semibold text-emerald-700">
          {fmtNative(newAvgCost, holding.currency, true)}
          {newAvgCost !== currentPosition.avgCost && currentPosition.shares > 0 && (
            <span className="text-slate-400 font-normal ml-1">
              (was {fmtNative(currentPosition.avgCost, holding.currency, true)})
            </span>
          )}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">New position</span>
        <span className="font-semibold text-slate-800">
          {(currentPosition.shares + parsedShares).toFixed(4).replace(/\.?0+$/, '')} shares
        </span>
      </div>
    </div>
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
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Proceeds</span>
        <span className="font-semibold text-slate-800">
          {fmtNative(parsedShares * parsedPrice, holding.currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Realized gain/loss</span>
        <span
          className={`font-semibold ${realizedGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
        >
          {realizedGain >= 0 ? '+' : ''}
          {fmtNative(realizedGain, holding.currency, true)}
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">Remaining shares</span>
        <span className="font-semibold text-slate-800">
          {Math.max(0, currentPosition.shares - parsedShares)
            .toFixed(4)
            .replace(/\.?0+$/, '')}
        </span>
      </div>
    </div>
  );
}

type DividendPreviewProps = {
  parsedPrice: number;
  holding: Holding;
  fmtNative: FmtNative;
  incomeLabel: string;
};

function DividendPreview({ parsedPrice, holding, fmtNative, incomeLabel }: DividendPreviewProps) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-indigo-700 font-medium">{incomeLabel} income</span>
      <span className="font-bold text-indigo-700">
        +{fmtNative(parsedPrice, holding.currency, true)}
      </span>
    </div>
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
  incomeLabel,
}: TxnPreviewProps) {
  const bgClass =
    type === 'sell'
      ? 'bg-rose-50 border-rose-100'
      : type === 'dividend'
        ? 'bg-indigo-50 border-indigo-100'
        : 'bg-emerald-50 border-emerald-100';

  return (
    <div className={`rounded-xl p-4 border ${bgClass}`}>
      {type === 'buy' && (
        <BuyPreview
          parsedShares={parsedShares}
          parsedPrice={parsedPrice}
          holding={holding}
          currentPosition={currentPosition}
          newAvgCost={newAvgCost}
          fmtNative={fmtNative}
        />
      )}
      {type === 'sell' && (
        <SellPreview
          parsedShares={parsedShares}
          parsedPrice={parsedPrice}
          holding={holding}
          currentPosition={currentPosition}
          realizedGain={realizedGain}
          fmtNative={fmtNative}
        />
      )}
      {type === 'dividend' && (
        <DividendPreview
          parsedPrice={parsedPrice}
          holding={holding}
          fmtNative={fmtNative}
          incomeLabel={incomeLabel}
        />
      )}
    </div>
  );
}

type PositionInfoBarProps = {
  currentPosition: Position;
  holding: Holding;
  fmtNative: FmtNative;
};

function PositionInfoBar({ currentPosition, holding, fmtNative }: PositionInfoBarProps) {
  if (currentPosition.shares <= 0) return null;
  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5 text-xs text-slate-600">
      <span className="font-semibold text-slate-800">
        {currentPosition.shares.toFixed(4).replace(/\.?0+$/, '')} shares
      </span>
      <span className="text-slate-300">·</span>
      <span>avg cost {fmtNative(currentPosition.avgCost, holding.currency, true)}</span>
      <span className="text-slate-300">·</span>
      <span>current {fmtNative(holding.currentPrice, holding.currency, true)}</span>
    </div>
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
      label={type === 'sell' ? `Shares to Sell (max: ${currentPosition.shares})` : 'Shares to Buy'}
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
          ? `Total ${incomeLabel} Received (${holding.currency})`
          : `Price per Share (${holding.currency})`
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
        step="0.0001"
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
      <FormField label="Transaction Type">
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
        fmtNative={props.fmtNative}
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
          incomeLabel={props.incomeLabel}
        />
      )}
    </>
  );
}

function computeNextAverageCost(
  type: HoldingTxnType,
  parsedShares: number,
  parsedPrice: number,
  currentPosition: Position,
): number {
  if (type !== 'buy' || parsedShares <= 0 || parsedPrice <= 0) return currentPosition.avgCost;
  const newTotal = currentPosition.shares * currentPosition.avgCost + parsedShares * parsedPrice;
  return newTotal / (currentPosition.shares + parsedShares);
}

function computeRealizedGainEstimate(
  type: HoldingTxnType,
  parsedShares: number,
  parsedPrice: number,
  currentPosition: Position,
): number {
  if (type !== 'sell' || parsedShares <= 0 || parsedPrice <= 0) return 0;
  return (parsedPrice - currentPosition.avgCost) * parsedShares;
}

function buildInitialHoldingTxnValues(
  existing: HoldingTransaction | undefined,
): InitialHoldingTxnFormValues {
  const today = new Date().toISOString().slice(0, 10);
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
      title={isEditing ? 'Edit Transaction' : 'Record Transaction'}
      subtitle={`${holding.ticker} · ${holding.name}`}
      onClose={onClose}
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={isEditing ? 'Save Changes' : 'Record'}
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
