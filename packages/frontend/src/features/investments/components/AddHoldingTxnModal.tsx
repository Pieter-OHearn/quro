import { useMemo, useState } from "react";
import { ShoppingCart, Sparkles, Tag } from "lucide-react";
import { useCurrency } from "@/lib/CurrencyContext";
import {
  Modal,
  ModalFooter,
  FormField,
  CurrencyInput,
  TextInput,
  TxnTypeSelector,
  DateNoteRow,
} from "@/components/ui";
import type { TxnTypeMeta } from "@/components/ui";
import type { Holding, HoldingTransaction } from "@quro/shared";
import type { HoldingTxnType, Position } from "../utils/position";

type AddHoldingTxnModalProps = {
  holding: Holding;
  currentPosition: Position;
  onClose: () => void;
  onSave: (t: Omit<HoldingTransaction, "id">) => void;
};

const TXN_META: Record<HoldingTxnType, TxnTypeMeta> = {
  buy: {
    key: "buy",
    label: "Buy",
    icon: ShoppingCart,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    borderColor: "border-emerald-300",
  },
  sell: {
    key: "sell",
    label: "Sell",
    icon: Tag,
    color: "text-rose-500",
    bg: "bg-rose-50",
    borderColor: "border-rose-300",
  },
  dividend: {
    key: "dividend",
    label: "Dividend",
    icon: Sparkles,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    borderColor: "border-indigo-300",
  },
};

const TXN_TYPES = ["buy", "sell", "dividend"] as const satisfies HoldingTxnType[];

type TxnPreviewProps = {
  type: HoldingTxnType;
  parsedShares: number;
  parsedPrice: number;
  holding: Holding;
  currentPosition: Position;
  newAvgCost: number;
  realizedGain: number;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function TxnPreview({ type, parsedShares, parsedPrice, holding, currentPosition, newAvgCost, realizedGain, fmtNative }: TxnPreviewProps) {
  const bgClass = type === "sell"
    ? "bg-rose-50 border-rose-100"
    : type === "dividend"
      ? "bg-indigo-50 border-indigo-100"
      : "bg-emerald-50 border-emerald-100";

  return (
    <div className={`rounded-xl p-4 border ${bgClass}`}>
      {type === "buy" && parsedShares > 0 && (
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
              {(currentPosition.shares + parsedShares).toFixed(4).replace(/\.?0+$/, "")} shares
            </span>
          </div>
        </div>
      )}

      {type === "sell" && parsedShares > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-600">Proceeds</span>
            <span className="font-semibold text-slate-800">
              {fmtNative(parsedShares * parsedPrice, holding.currency, true)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-600">Realized gain/loss</span>
            <span className={`font-semibold ${realizedGain >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {realizedGain >= 0 ? "+" : ""}
              {fmtNative(realizedGain, holding.currency, true)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-600">Remaining shares</span>
            <span className="font-semibold text-slate-800">
              {Math.max(0, currentPosition.shares - parsedShares).toFixed(4).replace(/\.?0+$/, "")}
            </span>
          </div>
        </div>
      )}

      {type === "dividend" && (
        <div className="flex justify-between text-xs">
          <span className="text-indigo-700 font-medium">Dividend income</span>
          <span className="font-bold text-indigo-700">+{fmtNative(parsedPrice, holding.currency, true)}</span>
        </div>
      )}
    </div>
  );
}

export function AddHoldingTxnModal({ holding, currentPosition, onClose, onSave }: AddHoldingTxnModalProps) {
  const { fmtNative } = useCurrency();
  const [type, setType] = useState<HoldingTxnType>("buy");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const parsedShares = parseFloat(shares) || 0;
  const parsedPrice = parseFloat(price) || 0;

  const newAvgCost = useMemo(() => {
    if (type !== "buy" || parsedShares <= 0 || parsedPrice <= 0) return currentPosition.avgCost;
    const newTotal = currentPosition.shares * currentPosition.avgCost + parsedShares * parsedPrice;
    return newTotal / (currentPosition.shares + parsedShares);
  }, [type, parsedShares, parsedPrice, currentPosition]);

  const realizedGain = useMemo(() => {
    if (type !== "sell" || parsedShares <= 0 || parsedPrice <= 0) return 0;
    return (parsedPrice - currentPosition.avgCost) * parsedShares;
  }, [type, parsedShares, parsedPrice, currentPosition]);

  function handleTypeChange(t: HoldingTxnType) {
    setType(t);
    setError("");
    setShares("");
    setPrice("");
  }

  function handleSave() {
    if (parsedPrice <= 0) {
      setError("Enter a valid price / amount");
      return;
    }
    if ((type === "buy" || type === "sell") && parsedShares <= 0) {
      setError("Enter a valid number of shares");
      return;
    }
    if (type === "sell" && parsedShares > currentPosition.shares) {
      setError(`You only hold ${currentPosition.shares} shares`);
      return;
    }

    onSave({
      holdingId: holding.id,
      type,
      shares: type === "buy" || type === "sell" ? parsedShares : null,
      price: parsedPrice,
      date,
      note,
    });
    onClose();
  }

  const needsShares = type === "buy" || type === "sell";

  return (
    <Modal
      title="Record Transaction"
      subtitle={`${holding.ticker} · ${holding.name}`}
      onClose={onClose}
      footer={<ModalFooter onCancel={onClose} onConfirm={handleSave} confirmLabel="Record" />}
    >
      <FormField label="Transaction Type">
        <TxnTypeSelector<HoldingTxnType>
          types={TXN_TYPES.map((txnType) => TXN_META[txnType])}
          value={type}
          onChange={handleTypeChange}
        />
      </FormField>

      {currentPosition.shares > 0 && (
        <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">
            {currentPosition.shares.toFixed(4).replace(/\.?0+$/, "")} shares
          </span>
          <span className="text-slate-300">·</span>
          <span>avg cost {fmtNative(currentPosition.avgCost, holding.currency, true)}</span>
          <span className="text-slate-300">·</span>
          <span>current {fmtNative(holding.currentPrice, holding.currency, true)}</span>
        </div>
      )}

      {needsShares && (
        <FormField
          label={type === "sell" ? `Shares to Sell (max: ${currentPosition.shares})` : "Shares to Buy"}
          error={error && parsedShares <= 0 ? error : undefined}
        >
          <TextInput
            type="number"
            step="0.0001"
            value={shares}
            onChange={(value) => {
              setShares(value);
              setError("");
            }}
            error={Boolean(error) && parsedShares <= 0}
            placeholder="0"
          />
        </FormField>
      )}

      <FormField
        label={
          type === "dividend"
            ? `Total Dividend Received (${holding.currency})`
            : `Price per Share (${holding.currency})`
        }
        error={error && (parsedPrice <= 0 || (!needsShares && type === "dividend")) ? error : undefined}
      >
        <CurrencyInput
          currency={holding.currency}
          value={price}
          onChange={(value) => {
            setPrice(value);
            setError("");
          }}
          error={Boolean(error) && parsedPrice <= 0}
          step="0.0001"
        />
      </FormField>

      <DateNoteRow
        date={date}
        note={note}
        onDateChange={setDate}
        onNoteChange={setNote}
        notePlaceholder="e.g. DCA top-up..."
      />

      {parsedPrice > 0 && (
        <TxnPreview
          type={type}
          parsedShares={parsedShares}
          parsedPrice={parsedPrice}
          holding={holding}
          currentPosition={currentPosition}
          newAvgCost={newAvgCost}
          realizedGain={realizedGain}
          fmtNative={fmtNative}
        />
      )}
    </Modal>
  );
}
