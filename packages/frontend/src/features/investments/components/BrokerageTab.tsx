import {
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
  const assetTypeLabel = formatItemType(holding.itemType) || holding.sector;
  return (
    <div className="col-span-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-xs font-bold text-indigo-700 flex-shrink-0">
        {holding.ticker.slice(0, 2)}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{holding.name}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{holding.ticker}</span>
          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded-full">
            {assetTypeLabel}
          </span>
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

function HoldingHistory(props: HoldingRowProps) {
  const { holding, holdingTxns, position, onAddTxnForHolding, onDeleteTxn } = props;
  return (
    <HoldingTxnHistory
      holding={holding}
      position={position}
      transactions={holdingTxns}
      onAdd={() => onAddTxnForHolding(holding)}
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
      {isExpanded && <HoldingHistory {...props} />}
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
          onDeleteTxn={onDeleteTxn}
        />
      ))}
    </div>
  );
}

type BrokerageHeaderProps = {
  holdingsCount: number;
  baseCurrency: string;
  onAddHolding: () => void;
  onSyncPrices: () => void;
  isSyncingPrices: boolean;
  syncSummary: HoldingPriceSyncResult | null;
};

function BrokerageHeader({
  holdingsCount,
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
            {holdingsCount} holdings · click row to view & record transactions
          </p>
          {syncSummaryText && (
            <p className="text-[11px] text-slate-500 mt-1">Last sync: {syncSummaryText}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onSyncPrices}
            disabled={isSyncingPrices || holdingsCount === 0}
            className="flex items-center gap-2 text-sm bg-slate-100 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 px-4 py-2 rounded-xl transition-colors"
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
    </>
  );
}

export function BrokerageTab(props: BrokerageTabProps) {
  const { holdings, holdingTxns, positions, baseCurrency, totalDividendsBase, totalRealizedBase } =
    props;
  const { totalBrokerageBase, totalGainBase, gainPct, expandedHoldingId, fmtBase, fmtNative } =
    props;
  const { convertToBase, isForeign, onAddHolding, onEditHolding, onToggleExpanded } = props;
  const { onAddTxnForHolding, onDeleteTxn, onSyncPrices, isSyncingPrices, syncSummary } = props;
  return (
    <div>
      <BrokerageHeader
        holdingsCount={holdings.length}
        baseCurrency={baseCurrency}
        onAddHolding={onAddHolding}
        onSyncPrices={onSyncPrices}
        isSyncingPrices={isSyncingPrices}
        syncSummary={syncSummary}
      />
      <BrokerageHoldingsList
        holdings={holdings}
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
        onDeleteTxn={onDeleteTxn}
      />
      {holdings.length > 0 && (
        <BrokerageSummary
          totalBrokerageBase={totalBrokerageBase}
          totalDividendsBase={totalDividendsBase}
          totalRealizedBase={totalRealizedBase}
          totalGainBase={totalGainBase}
          gainPct={gainPct}
          fmtBase={fmtBase}
        />
      )}
    </div>
  );
}
