import { useState } from 'react';
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Edit3,
  Loader2,
  Plus,
  RefreshCcw,
} from 'lucide-react';
import {
  formatItemType,
  type Holding,
  type HoldingPriceSyncResult,
  type HoldingTransaction,
} from '@quro/shared';
import type { Position } from '../utils/position';
import { HoldingTxnHistory } from './HoldingTxnHistory';

type BrokerageTabProps = {
  activeHoldings: Holding[];
  closedHoldings: Holding[];
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
  onEditTxn: (transaction: HoldingTransaction) => void;
  onDeleteTxn: (id: number) => void;
  onSyncPrices: () => void;
  isSyncingPrices: boolean;
  syncSummary: HoldingPriceSyncResult | null;
};

type HoldingRowProps = {
  holding: Holding;
  holdingTxns: HoldingTransaction[];
  position: Position;
  isExpanded: boolean;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  convertToBase: (value: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
  onAddTxnForHolding: (holding: Holding) => void;
  onEditTxn: (transaction: HoldingTransaction) => void;
  onDeleteTxn: (id: number) => void;
};

type HoldingRowMetrics = {
  nativeValue: number;
  valueInBase: number;
  gain: number;
  gainPctHolding: number;
  foreign: boolean;
  txnCount: number;
};

function computeHoldingRowMetrics(
  holding: Holding,
  holdingTxns: HoldingTransaction[],
  position: Position,
  convertToBase: (value: number, currency: string) => number,
  isForeign: (currency: string) => boolean,
): HoldingRowMetrics {
  const nativeValue = position.shares * holding.currentPrice;
  const valueInBase = convertToBase(nativeValue, holding.currency);
  const gain = (holding.currentPrice - position.avgCost) * position.shares;
  const gainPctHolding =
    position.avgCost > 0 ? ((holding.currentPrice - position.avgCost) / position.avgCost) * 100 : 0;
  const foreign = isForeign(holding.currency);
  const txnCount = holdingTxns.filter((t) => t.holdingId === holding.id).length;
  return { nativeValue, valueInBase, gain, gainPctHolding, foreign, txnCount };
}

type HoldingAssetCellProps = {
  holding: Holding;
  foreign: boolean;
  txnCount: number;
};

function HoldingAssetCell({ holding, foreign, txnCount }: HoldingAssetCellProps) {
  const itemTypeLabel = formatItemType(holding.itemType);
  const sectorLabel = holding.sector?.trim();
  return (
    <div className="col-span-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
        {holding.ticker.slice(0, 2)}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{holding.name}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{holding.ticker}</span>
          {itemTypeLabel && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded-full">
              {itemTypeLabel}
            </span>
          )}
          {sectorLabel && sectorLabel !== itemTypeLabel && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded-full">
              {sectorLabel}
            </span>
          )}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${foreign ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
          >
            {holding.currency}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5">{txnCount} transactions</p>
      </div>
    </div>
  );
}

type HoldingGainCellProps = {
  gain: number;
  gainPctHolding: number;
  holding: Holding;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function HoldingGainCell({ gain, gainPctHolding, holding, fmtNative }: HoldingGainCellProps) {
  return (
    <div className={`col-span-2 text-right ${gain >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
      <div className="flex items-center justify-end gap-0.5">
        {gain >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
        <p className="text-sm font-semibold">
          {gain >= 0 ? '+' : ''}
          {fmtNative(gain, holding.currency, true)}
        </p>
      </div>
      <p className="text-xs">
        {gainPctHolding >= 0 ? '+' : ''}
        {gainPctHolding.toFixed(1)}%
      </p>
    </div>
  );
}

type HoldingValueCellsProps = {
  holding: Holding;
  position: Position;
  nativeValue: number;
  valueInBase: number;
  foreign: boolean;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
};

function HoldingValueCells({
  holding,
  position,
  nativeValue,
  valueInBase,
  foreign,
  fmtBase,
  fmtNative,
}: HoldingValueCellsProps) {
  return (
    <>
      <div className="col-span-2 text-right">
        <p className="text-sm font-semibold text-slate-800">
          {position.shares.toFixed(4).replace(/\.?0+$/, '')}
        </p>
        <p className="text-xs text-slate-400">
          @ {fmtNative(position.avgCost, holding.currency, true)}
        </p>
      </div>
      <div className="col-span-2 text-right">
        <p className="text-sm font-semibold text-slate-800">
          {fmtNative(holding.currentPrice, holding.currency, true)}
        </p>
        <p className="text-xs text-slate-400">{holding.currency}</p>
      </div>
      <div className="col-span-2 text-right">
        <p className="text-sm font-semibold text-slate-800">{fmtBase(valueInBase)}</p>
        {foreign && (
          <p className="text-xs text-amber-600">{fmtNative(nativeValue, holding.currency, true)}</p>
        )}
      </div>
    </>
  );
}

type HoldingRowActionsProps = {
  holding: Holding;
  isExpanded: boolean;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
};

function HoldingRowActions({
  holding,
  isExpanded,
  onEditHolding,
  onToggleExpanded,
}: HoldingRowActionsProps) {
  return (
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
        title={isExpanded ? 'Collapse' : 'View transactions'}
      >
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
    </div>
  );
}

type HoldingHistoryProps = {
  holding: Holding;
  holdingTxns: HoldingTransaction[];
  position: Position;
  onAddTxnForHolding: (holding: Holding) => void;
  onEditTxn: (transaction: HoldingTransaction) => void;
  onDeleteTxn: (id: number) => void;
};

function HoldingHistory({
  holding,
  holdingTxns,
  position,
  onAddTxnForHolding,
  onEditTxn,
  onDeleteTxn,
}: HoldingHistoryProps) {
  return (
    <HoldingTxnHistory
      holding={holding}
      position={position}
      transactions={holdingTxns}
      onAdd={() => onAddTxnForHolding(holding)}
      onEdit={onEditTxn}
      onDelete={onDeleteTxn}
    />
  );
}

function HoldingRow(props: HoldingRowProps) {
  const {
    holding,
    holdingTxns,
    position,
    isExpanded,
    fmtBase,
    fmtNative,
    convertToBase,
    isForeign,
  } = props;
  const { onEditHolding, onToggleExpanded } = props;
  const { nativeValue, valueInBase, gain, gainPctHolding, foreign, txnCount } =
    computeHoldingRowMetrics(holding, holdingTxns, position, convertToBase, isForeign);

  return (
    <div key={holding.id}>
      <div className="grid grid-cols-12 gap-2 px-6 py-3.5 hover:bg-slate-50/60 transition-colors items-center">
        <HoldingAssetCell holding={holding} foreign={foreign} txnCount={txnCount} />
        <HoldingValueCells
          holding={holding}
          position={position}
          nativeValue={nativeValue}
          valueInBase={valueInBase}
          foreign={foreign}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
        />
        <HoldingGainCell
          gain={gain}
          gainPctHolding={gainPctHolding}
          holding={holding}
          fmtNative={fmtNative}
        />
        <HoldingRowActions
          holding={holding}
          isExpanded={isExpanded}
          onEditHolding={onEditHolding}
          onToggleExpanded={onToggleExpanded}
        />
      </div>
      {isExpanded && (
        <HoldingHistory
          holding={holding}
          holdingTxns={holdingTxns}
          position={position}
          onAddTxnForHolding={props.onAddTxnForHolding}
          onEditTxn={props.onEditTxn}
          onDeleteTxn={props.onDeleteTxn}
        />
      )}
    </div>
  );
}

type BrokerageSummaryProps = {
  totalBrokerageBase: number;
  totalDividendsBase: number;
  totalRealizedBase: number;
  totalGainBase: number;
  gainPct: number;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
};

function BrokerageSummary({
  totalBrokerageBase,
  totalDividendsBase,
  totalRealizedBase,
  totalGainBase,
  gainPct,
  fmtBase,
}: BrokerageSummaryProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60">
      <div>
        <p className="text-sm font-semibold text-slate-700">Total Portfolio</p>
        <p className="text-xs text-slate-400">
          +{fmtBase(totalDividendsBase)} dividends · {totalRealizedBase >= 0 ? '+' : ''}
          {fmtBase(totalRealizedBase)} realized
        </p>
      </div>
      <div className="flex items-center gap-6">
        <p className="font-bold text-slate-900">{fmtBase(totalBrokerageBase)}</p>
        <div
          className={`flex items-center gap-1 ${totalGainBase >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
        >
          {totalGainBase >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <p className="font-bold">
            {totalGainBase >= 0 ? '+' : ''}
            {fmtBase(Math.abs(totalGainBase))} ({gainPct.toFixed(1)}%)
          </p>
        </div>
      </div>
    </div>
  );
}

type BrokerageHoldingsListProps = {
  holdings: Holding[];
  holdingTxns: HoldingTransaction[];
  positions: Record<number, Position>;
  expandedHoldingId: number | null;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  convertToBase: (value: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
  onAddTxnForHolding: (holding: Holding) => void;
  onEditTxn: (transaction: HoldingTransaction) => void;
  onDeleteTxn: (id: number) => void;
};

function BrokerageHoldingsList({
  holdings,
  holdingTxns,
  positions,
  expandedHoldingId,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  onEditHolding,
  onToggleExpanded,
  onAddTxnForHolding,
  onEditTxn,
  onDeleteTxn,
}: BrokerageHoldingsListProps) {
  return (
    <div className="divide-y divide-slate-50">
      {holdings.map((holding) => (
        <HoldingRow
          key={holding.id}
          holding={holding}
          holdingTxns={holdingTxns}
          position={positions[holding.id]}
          isExpanded={expandedHoldingId === holding.id}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          convertToBase={convertToBase}
          isForeign={isForeign}
          onEditHolding={onEditHolding}
          onToggleExpanded={onToggleExpanded}
          onAddTxnForHolding={onAddTxnForHolding}
          onEditTxn={onEditTxn}
          onDeleteTxn={onDeleteTxn}
        />
      ))}
    </div>
  );
}

type ClosedHoldingMetrics = {
  txnCount: number;
  lastSellPrice: number | null;
  costBasis: number;
  realizedPct: number;
};

function computeClosedHoldingMetrics(
  holding: Holding,
  holdingTxns: HoldingTransaction[],
  position: Position,
): ClosedHoldingMetrics {
  const txns = holdingTxns.filter((txn) => txn.holdingId === holding.id);
  const txnCount = txns.length;
  const sellTxns = txns
    .filter((txn) => txn.type === 'sell' && Number(txn.shares ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastSellPrice = sellTxns[0]?.price ?? null;
  const costBasis = txns.reduce((sum, txn) => {
    if (txn.type !== 'buy') return sum;
    return sum + Number(txn.shares ?? 0) * txn.price;
  }, 0);
  const realizedPct = costBasis > 0 ? (position.realizedGain / costBasis) * 100 : 0;
  return { txnCount, lastSellPrice, costBasis, realizedPct };
}

type ClosedHoldingRowProps = {
  holding: Holding;
  holdingTxns: HoldingTransaction[];
  position: Position;
  isExpanded: boolean;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  convertToBase: (value: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
  onAddTxnForHolding: (holding: Holding) => void;
  onEditTxn: (transaction: HoldingTransaction) => void;
  onDeleteTxn: (id: number) => void;
};

function ClosedHoldingPriceCell({
  lastSellPrice,
  holding,
  fmtNative,
}: {
  lastSellPrice: number | null;
  holding: Holding;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
}) {
  if (lastSellPrice === null) {
    return (
      <div className="col-span-2 text-right">
        <p className="text-sm text-slate-300">—</p>
        <p className="text-xs text-slate-300">no sells</p>
      </div>
    );
  }

  return (
    <div className="col-span-2 text-right">
      <p className="text-sm text-slate-500">{fmtNative(lastSellPrice, holding.currency, true)}</p>
      <p className="text-xs text-slate-300">last sell</p>
    </div>
  );
}

function ClosedHoldingDividendsCell({
  totalDividends,
  holding,
  fmtBase,
  fmtNative,
  convertToBase,
  foreign,
}: {
  totalDividends: number;
  holding: Holding;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  convertToBase: (value: number, currency: string) => number;
  foreign: boolean;
}) {
  if (totalDividends <= 0) {
    return (
      <div className="col-span-2 text-right">
        <p className="text-sm text-slate-300">—</p>
      </div>
    );
  }

  return (
    <div className="col-span-2 text-right">
      <p className="text-sm font-semibold text-slate-500">
        +{fmtBase(convertToBase(totalDividends, holding.currency))}
      </p>
      {foreign && (
        <p className="text-xs text-amber-600">
          +{fmtNative(totalDividends, holding.currency, true)}
        </p>
      )}
    </div>
  );
}

function ClosedHoldingRealizedCell({
  realizedGain,
  realizedPct,
  costBasis,
  holding,
  fmtNative,
}: {
  realizedGain: number;
  realizedPct: number;
  costBasis: number;
  holding: Holding;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
}) {
  return (
    <div
      className={`col-span-2 text-right ${realizedGain >= 0 ? 'text-emerald-500' : 'text-rose-400'}`}
    >
      <div className="flex items-center justify-end gap-0.5">
        {realizedGain >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
        <p className="text-sm font-semibold">
          {realizedGain >= 0 ? '+' : ''}
          {fmtNative(realizedGain, holding.currency, true)}
        </p>
      </div>
      <p className="text-xs">
        {costBasis > 0 ? `${realizedPct >= 0 ? '+' : ''}${realizedPct.toFixed(1)}%` : '—'}
      </p>
    </div>
  );
}

function ClosedHoldingAssetCell({
  holding,
  txnCount,
  isForeign,
}: {
  holding: Holding;
  txnCount: number;
  isForeign: boolean;
}) {
  const itemTypeLabel = formatItemType(holding.itemType);
  const sectorLabel = holding.sector?.trim();

  return (
    <div className="col-span-5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-slate-200/80 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
        {holding.ticker.slice(0, 2)}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-slate-500 truncate">{holding.name}</p>
          <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
            Closed
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-400">{holding.ticker}</span>
          {itemTypeLabel && (
            <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 rounded-full">
              {itemTypeLabel}
            </span>
          )}
          {sectorLabel && sectorLabel !== itemTypeLabel && (
            <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 rounded-full">
              {sectorLabel}
            </span>
          )}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${isForeign ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}
          >
            {holding.currency}
          </span>
        </div>
        <p className="text-[10px] text-slate-300 mt-0.5">{txnCount} transactions</p>
      </div>
    </div>
  );
}

function ClosedHoldingRow({
  holding,
  holdingTxns,
  position,
  isExpanded,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  onEditHolding,
  onToggleExpanded,
  onAddTxnForHolding,
  onEditTxn,
  onDeleteTxn,
}: ClosedHoldingRowProps) {
  const isForeignHolding = isForeign(holding.currency);
  const { txnCount, lastSellPrice, costBasis, realizedPct } = computeClosedHoldingMetrics(
    holding,
    holdingTxns,
    position,
  );

  return (
    <div>
      <div className="grid grid-cols-12 gap-2 px-6 py-3.5 items-center hover:bg-slate-100/50 transition-colors">
        <ClosedHoldingAssetCell
          holding={holding}
          txnCount={txnCount}
          isForeign={isForeignHolding}
        />

        <ClosedHoldingPriceCell
          lastSellPrice={lastSellPrice}
          holding={holding}
          fmtNative={fmtNative}
        />
        <ClosedHoldingDividendsCell
          totalDividends={position.totalDividends}
          holding={holding}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          convertToBase={convertToBase}
          foreign={isForeignHolding}
        />
        <ClosedHoldingRealizedCell
          realizedGain={position.realizedGain}
          realizedPct={realizedPct}
          costBasis={costBasis}
          holding={holding}
          fmtNative={fmtNative}
        />

        <div className="col-span-1 flex items-center justify-end gap-0.5">
          <button
            onClick={() => onEditHolding(holding)}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-300 hover:text-slate-500 transition-colors"
            title="Edit holding"
          >
            <Edit3 size={13} />
          </button>
          <button
            onClick={() => onToggleExpanded(holding.id)}
            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-300 hover:text-slate-500 transition-colors"
            title={isExpanded ? 'Collapse' : 'View transactions'}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <HoldingHistory
          holding={holding}
          holdingTxns={holdingTxns}
          position={position}
          onAddTxnForHolding={onAddTxnForHolding}
          onEditTxn={onEditTxn}
          onDeleteTxn={onDeleteTxn}
        />
      )}
    </div>
  );
}

type ClosedHoldingsSectionProps = {
  closedHoldings: Holding[];
  holdingTxns: HoldingTransaction[];
  positions: Record<number, Position>;
  expandedHoldingId: number | null;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  convertToBase: (value: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
  onAddTxnForHolding: (holding: Holding) => void;
  onEditTxn: (transaction: HoldingTransaction) => void;
  onDeleteTxn: (id: number) => void;
  showClosed: boolean;
  onToggleClosed: () => void;
};

type ClosedHoldingsSummary = {
  realized: string;
  dividends: string;
};

function buildClosedHoldingsSummary(
  closedHoldings: Holding[],
  positions: Record<number, Position>,
  convertToBase: (value: number, currency: string) => number,
  fmtBase: (value: number, currency?: string, compact?: boolean) => string,
  fmtNative: (value: number, currency: string, compact?: boolean) => string,
): ClosedHoldingsSummary {
  const uniqueCurrencies = [...new Set(closedHoldings.map((holding) => holding.currency))];
  const singleCurrency = uniqueCurrencies.length === 1 ? uniqueCurrencies[0] : null;

  const totalClosedRealizedBase = closedHoldings.reduce(
    (sum, holding) => sum + convertToBase(positions[holding.id].realizedGain, holding.currency),
    0,
  );
  const totalClosedDividendsBase = closedHoldings.reduce(
    (sum, holding) => sum + convertToBase(positions[holding.id].totalDividends, holding.currency),
    0,
  );

  if (!singleCurrency) {
    return {
      realized: `${totalClosedRealizedBase >= 0 ? '+' : ''}${fmtBase(totalClosedRealizedBase)}`,
      dividends: fmtBase(totalClosedDividendsBase),
    };
  }

  const totalClosedRealizedNative = closedHoldings.reduce(
    (sum, holding) => sum + positions[holding.id].realizedGain,
    0,
  );
  const totalClosedDividendsNative = closedHoldings.reduce(
    (sum, holding) => sum + positions[holding.id].totalDividends,
    0,
  );

  return {
    realized: `${totalClosedRealizedNative >= 0 ? '+' : ''}${fmtNative(totalClosedRealizedNative, singleCurrency)}`,
    dividends: fmtNative(totalClosedDividendsNative, singleCurrency),
  };
}

function ClosedHoldingsHeader({
  closedCount,
  showClosed,
  onToggleClosed,
}: {
  closedCount: number;
  showClosed: boolean;
  onToggleClosed: () => void;
}) {
  return (
    <button
      onClick={onToggleClosed}
      className="w-full flex items-center gap-3 px-6 py-3.5 bg-slate-50/70 hover:bg-slate-50 transition-colors"
    >
      <Archive size={14} className="text-slate-400 flex-shrink-0" />
      <p className="text-sm font-semibold text-slate-500">Closed Holdings</p>
      <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
        {closedCount}
      </span>
      <span className="text-xs text-slate-400">positions no longer held</span>
      <div className="flex-1" />
      <span className="text-xs text-slate-400">{showClosed ? 'Hide' : 'Show'}</span>
      {showClosed ? (
        <ChevronUp size={14} className="text-slate-400" />
      ) : (
        <ChevronDown size={14} className="text-slate-400" />
      )}
    </button>
  );
}

function ClosedHoldingsTable({
  closedHoldings,
  holdingTxns,
  positions,
  expandedHoldingId,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  onEditHolding,
  onToggleExpanded,
  onAddTxnForHolding,
  onEditTxn,
  onDeleteTxn,
}: {
  closedHoldings: Holding[];
  holdingTxns: HoldingTransaction[];
  positions: Record<number, Position>;
  expandedHoldingId: number | null;
  fmtBase: (value: number, currency?: string, compact?: boolean) => string;
  fmtNative: (value: number, currency: string, compact?: boolean) => string;
  convertToBase: (value: number, currency: string) => number;
  isForeign: (currency: string) => boolean;
  onEditHolding: (holding: Holding) => void;
  onToggleExpanded: (id: number) => void;
  onAddTxnForHolding: (holding: Holding) => void;
  onEditTxn: (transaction: HoldingTransaction) => void;
  onDeleteTxn: (id: number) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-12 gap-2 px-6 py-2 text-[10px] font-semibold text-slate-300 uppercase tracking-wide bg-slate-50/90">
        <span className="col-span-5">Asset</span>
        <span className="col-span-2 text-right">Sold Price</span>
        <span className="col-span-2 text-right">Dividends</span>
        <span className="col-span-2 text-right">Realized P&L</span>
        <span className="col-span-1"></span>
      </div>

      <div className="divide-y divide-slate-100/80 bg-slate-50/50">
        {closedHoldings.map((holding) => (
          <ClosedHoldingRow
            key={holding.id}
            holding={holding}
            holdingTxns={holdingTxns}
            position={positions[holding.id]}
            isExpanded={expandedHoldingId === holding.id}
            fmtBase={fmtBase}
            fmtNative={fmtNative}
            convertToBase={convertToBase}
            isForeign={isForeign}
            onEditHolding={onEditHolding}
            onToggleExpanded={onToggleExpanded}
            onAddTxnForHolding={onAddTxnForHolding}
            onEditTxn={onEditTxn}
            onDeleteTxn={onDeleteTxn}
          />
        ))}
      </div>
    </>
  );
}

function ClosedHoldingsFooter({
  closedCount,
  summary,
}: {
  closedCount: number;
  summary: ClosedHoldingsSummary;
}) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-slate-50/80 border-t border-slate-100">
      <p className="text-xs text-slate-400">
        {closedCount} closed positions · total realized {summary.realized} · dividends{' '}
        {summary.dividends}
      </p>
      <p className="text-xs text-slate-400">excluded from active portfolio totals</p>
    </div>
  );
}

function ClosedHoldingsSection({
  closedHoldings,
  holdingTxns,
  positions,
  expandedHoldingId,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  onEditHolding,
  onToggleExpanded,
  onAddTxnForHolding,
  onEditTxn,
  onDeleteTxn,
  showClosed,
  onToggleClosed,
}: ClosedHoldingsSectionProps) {
  if (closedHoldings.length === 0) return null;
  const summary = buildClosedHoldingsSummary(
    closedHoldings,
    positions,
    convertToBase,
    fmtBase,
    fmtNative,
  );

  return (
    <div className="border-t-2 border-dashed border-slate-200">
      <ClosedHoldingsHeader
        closedCount={closedHoldings.length}
        showClosed={showClosed}
        onToggleClosed={onToggleClosed}
      />
      {showClosed && (
        <>
          <ClosedHoldingsTable
            closedHoldings={closedHoldings}
            holdingTxns={holdingTxns}
            positions={positions}
            expandedHoldingId={expandedHoldingId}
            fmtBase={fmtBase}
            fmtNative={fmtNative}
            convertToBase={convertToBase}
            isForeign={isForeign}
            onEditHolding={onEditHolding}
            onToggleExpanded={onToggleExpanded}
            onAddTxnForHolding={onAddTxnForHolding}
            onEditTxn={onEditTxn}
            onDeleteTxn={onDeleteTxn}
          />
          <ClosedHoldingsFooter closedCount={closedHoldings.length} summary={summary} />
        </>
      )}
    </div>
  );
}

type BrokerageHeaderProps = {
  activeHoldingsCount: number;
  totalHoldingsCount: number;
  baseCurrency: string;
  onAddHolding: () => void;
  onSyncPrices: () => void;
  isSyncingPrices: boolean;
  syncSummary: HoldingPriceSyncResult | null;
};

function BrokerageHeader({
  activeHoldingsCount,
  totalHoldingsCount,
  baseCurrency,
  onAddHolding,
  onSyncPrices,
  isSyncingPrices,
  syncSummary,
}: BrokerageHeaderProps) {
  const syncSummaryText = syncSummary
    ? `${syncSummary.updatedHoldings}/${syncSummary.requestedHoldings} updated · ${syncSummary.skippedHoldings} skipped`
    : null;

  return (
    <>
      <div className="flex justify-between items-center px-6 pt-5 pb-3">
        <div>
          <p className="text-xs text-slate-400">
            {activeHoldingsCount} active holdings · click row to view & record transactions
          </p>
          {syncSummaryText && (
            <p className="text-[11px] text-slate-500 mt-1">Last sync: {syncSummaryText}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSyncPrices}
            disabled={isSyncingPrices || activeHoldingsCount === 0}
            className="flex items-center gap-2 text-sm bg-slate-100 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 px-4 py-2 rounded-xl transition-colors"
            title={
              activeHoldingsCount === 0
                ? 'No active holdings to sync'
                : `Sync prices for ${activeHoldingsCount} active holdings`
            }
          >
            {isSyncingPrices ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCcw size={15} />
            )}
            Sync Prices
          </button>
          <button
            onClick={onAddHolding}
            className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors"
          >
            <Plus size={15} /> Add Holding
          </button>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-2 px-6 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
        <span className="col-span-3">Asset</span>
        <span className="col-span-2 text-right">Position</span>
        <span className="col-span-2 text-right">Current</span>
        <span className="col-span-2 text-right">Value ({baseCurrency})</span>
        <span className="col-span-2 text-right">Gain / Loss</span>
        <span className="col-span-1"></span>
      </div>
      {totalHoldingsCount > activeHoldingsCount && (
        <p className="px-6 pb-2 text-[11px] text-slate-400">
          {totalHoldingsCount - activeHoldingsCount} closed holdings excluded from sync and active
          portfolio totals
        </p>
      )}
    </>
  );
}

export function BrokerageTab(props: BrokerageTabProps) {
  const {
    activeHoldings,
    closedHoldings,
    holdingTxns,
    positions,
    baseCurrency,
    totalDividendsBase,
    totalRealizedBase,
  } = props;
  const { totalBrokerageBase, totalGainBase, gainPct, expandedHoldingId, fmtBase, fmtNative } =
    props;
  const { convertToBase, isForeign, onAddHolding, onEditHolding, onToggleExpanded } = props;
  const { onAddTxnForHolding, onEditTxn, onDeleteTxn, onSyncPrices, isSyncingPrices, syncSummary } =
    props;
  const [showClosed, setShowClosed] = useState(true);
  return (
    <div>
      <BrokerageHeader
        activeHoldingsCount={activeHoldings.length}
        totalHoldingsCount={activeHoldings.length + closedHoldings.length}
        baseCurrency={baseCurrency}
        onAddHolding={onAddHolding}
        onSyncPrices={onSyncPrices}
        isSyncingPrices={isSyncingPrices}
        syncSummary={syncSummary}
      />
      <BrokerageHoldingsList
        holdings={activeHoldings}
        holdingTxns={holdingTxns}
        positions={positions}
        expandedHoldingId={expandedHoldingId}
        fmtBase={fmtBase}
        fmtNative={fmtNative}
        convertToBase={convertToBase}
        isForeign={isForeign}
        onEditHolding={onEditHolding}
        onToggleExpanded={onToggleExpanded}
        onAddTxnForHolding={onAddTxnForHolding}
        onEditTxn={onEditTxn}
        onDeleteTxn={onDeleteTxn}
      />
      {activeHoldings.length > 0 && (
        <BrokerageSummary
          totalBrokerageBase={totalBrokerageBase}
          totalDividendsBase={totalDividendsBase}
          totalRealizedBase={totalRealizedBase}
          totalGainBase={totalGainBase}
          gainPct={gainPct}
          fmtBase={fmtBase}
        />
      )}
      <ClosedHoldingsSection
        closedHoldings={closedHoldings}
        holdingTxns={holdingTxns}
        positions={positions}
        expandedHoldingId={expandedHoldingId}
        fmtBase={fmtBase}
        fmtNative={fmtNative}
        convertToBase={convertToBase}
        isForeign={isForeign}
        onEditHolding={onEditHolding}
        onToggleExpanded={onToggleExpanded}
        onAddTxnForHolding={onAddTxnForHolding}
        onEditTxn={onEditTxn}
        onDeleteTxn={onDeleteTxn}
        showClosed={showClosed}
        onToggleClosed={() => setShowClosed((open) => !open)}
      />
    </div>
  );
}
