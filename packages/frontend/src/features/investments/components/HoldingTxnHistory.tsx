import { useState } from "react";
import { ShoppingCart, Sparkles, Tag } from "lucide-react";
import { useCurrency } from "@/lib/CurrencyContext";
import { TxnHistoryPanel, TxnRow } from "@/components/ui";
import type { TxnTypeMeta } from "@/components/ui";
import type { Holding, HoldingTransaction } from "@quro/shared";
import type { HoldingTxnType, Position } from "../utils/position";

type HoldingTxnHistoryProps = {
  holding: Holding;
  position: Position;
  transactions: HoldingTransaction[];
  onAdd: () => void;
  onDelete: (id: number) => void;
};

const TXN_META: Record<HoldingTxnType, TxnTypeMeta & { sign: string }> = {
  buy: {
    key: "buy",
    label: "Buy",
    icon: ShoppingCart,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    borderColor: "border-emerald-300",
    sign: "-",
  },
  sell: {
    key: "sell",
    label: "Sell",
    icon: Tag,
    color: "text-rose-500",
    bg: "bg-rose-50",
    borderColor: "border-rose-300",
    sign: "+",
  },
  dividend: {
    key: "dividend",
    label: "Dividend",
    icon: Sparkles,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    borderColor: "border-indigo-300",
    sign: "+",
  },
};

const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "buy", label: "Buys" },
  { key: "sell", label: "Sells" },
  { key: "dividend", label: "Dividends" },
];

export function HoldingTxnHistory({ holding, position, transactions, onAdd, onDelete }: HoldingTxnHistoryProps) {
  const { fmtNative } = useCurrency();
  const [filter, setFilter] = useState<HoldingTxnType | "all">("all");

  const sorted = [...transactions]
    .filter(
      (transaction) =>
        transaction.holdingId === holding.id &&
        (transaction.type as string) in TXN_META &&
        (filter === "all" || transaction.type === filter),
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const stats = [
    {
      label: "Avg Cost",
      value: fmtNative(position.avgCost, holding.currency, true),
      color: "text-slate-800",
    },
    {
      label: "Total Dividends",
      value: `+${fmtNative(position.totalDividends, holding.currency, true)}`,
      color: "text-indigo-600",
    },
    {
      label: "Realized Gain",
      value: `${position.realizedGain >= 0 ? "+" : ""}${fmtNative(position.realizedGain, holding.currency, true)}`,
      color: position.realizedGain >= 0 ? "text-emerald-600" : "text-rose-500",
    },
  ];

  return (
    <TxnHistoryPanel
      filterOptions={FILTER_OPTIONS}
      filter={filter}
      onFilterChange={(key) => setFilter(key as HoldingTxnType | "all")}
      stats={stats}
      statsColumns={3}
      onAdd={onAdd}
      isEmpty={sorted.length === 0}
    >
      {sorted.map((transaction) => {
        const meta = TXN_META[transaction.type as HoldingTxnType];

        const amount =
          transaction.type === "buy" || transaction.type === "sell" ? (
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-semibold ${transaction.type === "buy" ? "text-slate-700" : "text-emerald-600"}`}>
                {transaction.type === "buy" ? "-" : "+"}
                {fmtNative((transaction.shares ?? 0) * transaction.price, holding.currency, true)}
              </p>
              <p className="text-[10px] text-slate-400">
                {transaction.shares ?? 0} @ {fmtNative(transaction.price, holding.currency, true)}
              </p>
            </div>
          ) : (
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-indigo-600">+{fmtNative(transaction.price, holding.currency, true)}</p>
              <p className="text-[10px] text-slate-400">dividend</p>
            </div>
          );

        return (
          <TxnRow
            key={transaction.id}
            icon={meta.icon}
            iconColor={meta.color}
            iconBg={meta.bg}
            label={transaction.note || meta.label}
            date={transaction.date}
            amount={amount}
            onDelete={() => onDelete(transaction.id)}
          />
        );
      })}
    </TxnHistoryPanel>
  );
}
