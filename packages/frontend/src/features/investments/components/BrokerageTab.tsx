import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Edit3,
  Plus,
} from "lucide-react";
import type { Holding, HoldingTransaction } from "@quro/shared";
import type { Position } from "../utils/position";
import { HoldingTxnHistory } from "./HoldingTxnHistory";

type BrokerageTabProps = {
  holdings: Holding[];
  holdingTxns: HoldingTransaction[];
  positions: Record<number, Position>;
  baseCurrency: string;
  totalDividendsBase: number;
  totalRealizedBase: number;
  totalBrokerageBase: number;
  totalGainBase: number;
  gainPct: number;
  expandedHoldingId: number | null;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  convertToBase: (value: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
  onAddHolding: () => void;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
  onAddTxnForHolding: (holding: Holding) => void;
  onDeleteTxn: (id: number) => void;
};

export function BrokerageTab({
  holdings,
  holdingTxns,
  positions,
  baseCurrency,
  totalDividendsBase,
  totalRealizedBase,
  totalBrokerageBase,
  totalGainBase,
  gainPct,
  expandedHoldingId,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  onAddHolding,
  onEditHolding,
  onToggleExpanded,
  onAddTxnForHolding,
  onDeleteTxn,
}: BrokerageTabProps) {
  return (
    <div>
      <div className="flex justify-between items-center px-6 pt-5 pb-3">
        <p className="text-xs text-slate-400">{holdings.length} holdings · click row to view & record transactions</p>
        <button
          onClick={onAddHolding}
          className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={15} /> Add Holding
        </button>
      </div>

      <div className="grid grid-cols-12 gap-2 px-6 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
        <span className="col-span-3">Asset</span>
        <span className="col-span-2 text-right">Position</span>
        <span className="col-span-2 text-right">Current</span>
        <span className="col-span-2 text-right">Value ({baseCurrency})</span>
        <span className="col-span-2 text-right">Gain / Loss</span>
        <span className="col-span-1"></span>
      </div>

      <div className="divide-y divide-slate-50">
        {holdings.map((holding) => {
          const position = positions[holding.id];
          const nativeValue = position.shares * holding.currentPrice;
          const valueInBase = convertToBase(nativeValue, holding.currency);
          const gain = (holding.currentPrice - position.avgCost) * position.shares;
          const gainPctHolding = position.avgCost > 0 ? ((holding.currentPrice - position.avgCost) / position.avgCost) * 100 : 0;
          const foreign = isForeign(holding.currency);
          const isExpanded = expandedHoldingId === holding.id;
          const txnCount = holdingTxns.filter((transaction) => transaction.holdingId === holding.id).length;

          return (
            <div key={holding.id}>
              <div className="grid grid-cols-12 gap-2 px-6 py-3.5 hover:bg-slate-50/60 transition-colors items-center">
                <div className="col-span-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
                    {holding.ticker.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{holding.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400">{holding.ticker}</span>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded-full">{holding.sector}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          foreign ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {holding.currency}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{txnCount} transactions</p>
                  </div>
                </div>

                <div className="col-span-2 text-right">
                  <p className="text-sm font-semibold text-slate-800">{position.shares.toFixed(4).replace(/\.?0+$/, "")}</p>
                  <p className="text-xs text-slate-400">@ {fmtNative(position.avgCost, holding.currency, true)}</p>
                </div>

                <div className="col-span-2 text-right">
                  <p className="text-sm font-semibold text-slate-800">{fmtNative(holding.currentPrice, holding.currency, true)}</p>
                  <p className="text-xs text-slate-400">{holding.currency}</p>
                </div>

                <div className="col-span-2 text-right">
                  <p className="text-sm font-semibold text-slate-800">{fmtBase(valueInBase)}</p>
                  {foreign && <p className="text-xs text-amber-600">{fmtNative(nativeValue, holding.currency, true)}</p>}
                </div>

                <div className={`col-span-2 text-right ${gain >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                  <div className="flex items-center justify-end gap-0.5">
                    {gain >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    <p className="text-sm font-semibold">
                      {gain >= 0 ? "+" : ""}
                      {fmtNative(gain, holding.currency, true)}
                    </p>
                  </div>
                  <p className="text-xs">
                    {gainPctHolding >= 0 ? "+" : ""}
                    {gainPctHolding.toFixed(1)}%
                  </p>
                </div>

                <div className="col-span-1 flex items-center justify-end gap-0.5">
                  <button
                    onClick={() => onEditHolding(holding)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Edit holding"
                  >
                    <Edit3 size={13} />
                  </button>
                  <button
                    onClick={() => onToggleExpanded(holding.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                    title={isExpanded ? "Collapse" : "View transactions"}
                  >
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <HoldingTxnHistory
                  holding={holding}
                  position={position}
                  transactions={holdingTxns}
                  onAdd={() => onAddTxnForHolding(holding)}
                  onDelete={onDeleteTxn}
                />
              )}
            </div>
          );
        })}
      </div>

      {holdings.length > 0 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <div>
            <p className="text-sm font-semibold text-slate-700">Total Portfolio</p>
            <p className="text-xs text-slate-400">
              +{fmtBase(totalDividendsBase)} dividends · {totalRealizedBase >= 0 ? "+" : ""}
              {fmtBase(totalRealizedBase)} realized
            </p>
          </div>
          <div className="flex items-center gap-6">
            <p className="font-bold text-slate-900">{fmtBase(totalBrokerageBase)}</p>
            <div className={`flex items-center gap-1 ${totalGainBase >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
              {totalGainBase >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              <p className="font-bold">
                {totalGainBase >= 0 ? "+" : ""}
                {fmtBase(Math.abs(totalGainBase))} ({gainPct.toFixed(1)}%)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
