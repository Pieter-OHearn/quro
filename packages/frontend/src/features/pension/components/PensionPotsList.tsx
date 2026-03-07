import { useState } from 'react';
import { ChevronDown, ChevronUp, Edit3, Info, Lock, Plus, Trash2 } from 'lucide-react';
import type { AppCapabilityStatus, PensionPot, PensionTransaction } from '@quro/shared';
import { TYPE_COLORS } from '../constants';
import type {
  ConvertToBaseFn,
  DeletePotMutation,
  IsForeignFn,
  PensionFormatBaseFn,
  PensionFormatNativeFn,
} from '../types';
import { computeCurrentPensionBalance } from '../utils/pension-calculations';
import { PensionTxnHistory } from './PensionTxnHistory';

type PensionPotsListProps = {
  pensions: PensionPot[];
  pensionTxns: PensionTransaction[];
  expanded: number | null;
  setExpanded: (value: number | null) => void;
  setEditing: (value: PensionPot | undefined) => void;
  setShowModal: (value: boolean) => void;
  setAddTxnForPot: (value: PensionPot | null) => void;
  openImportModal: (pot: PensionPot, importId?: number | null) => void;
  setEditingTxn: (value: PensionTransaction | null) => void;
  deletePot: DeletePotMutation;
  handleDeletePensionTxn: (id: number) => void;
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  convertToBase: ConvertToBaseFn;
  isForeign: IsForeignFn;
  baseCurrency: string;
  pensionImportCapability: AppCapabilityStatus;
};

type PensionPotCardProps = {
  pot: PensionPot;
  isOpen: boolean;
  pensionTxns: PensionTransaction[];
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  convertToBase: ConvertToBaseFn;
  isForeign: IsForeignFn;
  baseCurrency: string;
  onEdit: (pot: PensionPot) => void;
  onToggle: (id: number | null) => void;
  onDelete: (id: number) => void;
  onAddTxn: (pot: PensionPot) => void;
  onImportStatement: (pot: PensionPot) => void;
  onEditTxn: (transaction: PensionTransaction) => void;
  onDeleteTxn: (id: number) => void;
  pensionImportCapability: AppCapabilityStatus;
};

type PensionPotExpandedProps = {
  pot: PensionPot;
  pensionTxns: PensionTransaction[];
  currentBalance: number;
  foreign: boolean;
  balanceInBase: number;
  baseCurrency: string;
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  onDelete: (id: number) => void;
  onAddTxn: (pot: PensionPot) => void;
  onImportStatement: (pot: PensionPot) => void;
  onEditTxn: (transaction: PensionTransaction) => void;
  onDeleteTxn: (id: number) => void;
  pensionImportCapability: AppCapabilityStatus;
};

type PensionPotDetailsProps = {
  pot: PensionPot;
  currentBalance: number;
  foreign: boolean;
  balanceInBase: number;
  baseCurrency: string;
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  onDelete: (id: number) => void;
};

function PensionPotDetails({
  pot,
  currentBalance,
  foreign,
  balanceInBase,
  baseCurrency,
  fmtBase,
  fmtNative,
  onDelete,
}: Readonly<PensionPotDetailsProps>) {
  const metadataEntries = Object.entries(pot.metadata ?? {});
  const detailStats = [
    { label: 'Balance (Native)', value: fmtNative(currentBalance, pot.currency) },
    { label: `Balance (${baseCurrency})`, value: fmtBase(balanceInBase) },
    { label: 'Your Contribution', value: `${fmtNative(pot.employeeMonthly, pot.currency)}/mo` },
    {
      label: 'Employer Contributions',
      value: `${fmtNative(pot.employerMonthly, pot.currency)}/mo`,
    },
    {
      label: 'Strategy',
      value: pot.investmentStrategy ?? '\u2014',
    },
  ];

  return (
    <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/30">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
        {detailStats.map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl p-3 border border-slate-100">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className="text-sm font-semibold text-slate-800">{value}</p>
          </div>
        ))}
      </div>
      {foreign && (
        <div className="mb-3 p-2.5 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2 text-xs text-amber-700">
          <Info size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            This pot is held in <strong>{pot.currency}</strong>. The {baseCurrency} equivalent uses
            approximate exchange rates.
          </span>
        </div>
      )}
      {pot.notes && (
        <p className="text-xs text-slate-500 flex items-start gap-1.5">
          <Info size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
          {pot.notes}
        </p>
      )}
      {metadataEntries.length > 0 && (
        <div className="mt-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-600 mb-1">Metadata</p>
          <div className="flex flex-wrap gap-1.5">
            {metadataEntries.map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1"
              >
                <strong className="text-slate-700">{key}:</strong> {value || '\u2014'}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onDelete(pot.id)}
          className="flex items-center gap-1.5 text-xs border border-rose-100 rounded-lg px-3 py-1.5 text-rose-500 hover:bg-rose-50 transition-colors"
        >
          <Trash2 size={12} /> Remove Pot
        </button>
      </div>
    </div>
  );
}

function PensionPotExpanded({
  pot,
  pensionTxns,
  currentBalance,
  foreign,
  balanceInBase,
  baseCurrency,
  fmtBase,
  fmtNative,
  onDelete,
  onAddTxn,
  onImportStatement,
  onEditTxn,
  onDeleteTxn,
  pensionImportCapability,
}: Readonly<PensionPotExpandedProps>) {
  return (
    <div>
      <PensionPotDetails
        pot={pot}
        currentBalance={currentBalance}
        foreign={foreign}
        balanceInBase={balanceInBase}
        baseCurrency={baseCurrency}
        fmtBase={fmtBase}
        fmtNative={fmtNative}
        onDelete={onDelete}
      />
      <PensionTxnHistory
        pot={pot}
        transactions={pensionTxns}
        onAdd={() => onAddTxn(pot)}
        onEdit={onEditTxn}
        onDelete={onDeleteTxn}
      />
      <div className="px-6 pb-5 -mt-2">
        <PensionImportButton
          pot={pot}
          capability={pensionImportCapability}
          onImportStatement={onImportStatement}
        />
      </div>
    </div>
  );
}

type PensionImportButtonProps = {
  pot: PensionPot;
  capability: AppCapabilityStatus;
  onImportStatement: (pot: PensionPot) => void;
};

function DisabledPensionImportButton({
  capability,
}: Readonly<Pick<PensionImportButtonProps, 'capability'>>) {
  const [showHint, setShowHint] = useState(false);

  return (
    <div className="relative inline-flex max-w-full">
      {showHint && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-3 w-[320px] max-w-[calc(100vw-4rem)] -translate-x-1/2 rounded-[26px] bg-[#0a1430] px-5 py-4 text-sm font-medium text-white shadow-[0_18px_40px_rgba(10,20,48,0.28)]"
        >
          {capability.message}
          <span className="absolute left-1/2 top-full h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#0a1430]" />
        </div>
      )}
      <button
        type="button"
        aria-disabled="true"
        onClick={(event) => {
          event.preventDefault();
          setShowHint((current) => !current);
        }}
        onMouseEnter={() => setShowHint(true)}
        onMouseLeave={() => setShowHint(false)}
        onFocus={() => setShowHint(true)}
        onBlur={() => setShowHint(false)}
        className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-400 shadow-sm shadow-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300/70"
      >
        <Lock size={14} className="flex-shrink-0 text-slate-300" />
        <span className="truncate">Import Annual Statement PDF</span>
        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
          AI off
        </span>
      </button>
    </div>
  );
}

function PensionImportButton({
  pot,
  capability,
  onImportStatement,
}: Readonly<PensionImportButtonProps>) {
  if (!capability.enabled) {
    return <DisabledPensionImportButton capability={capability} />;
  }

  return (
    <button
      type="button"
      onClick={() => onImportStatement(pot)}
      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
    >
      Import Annual Statement PDF
    </button>
  );
}

type PensionPotCardLeftProps = {
  pot: PensionPot;
  totalMonthly: number;
  txnCount: number;
  fmtNative: PensionFormatNativeFn;
};

function PensionPotCardLeft({
  pot,
  totalMonthly,
  txnCount,
  fmtNative,
}: Readonly<PensionPotCardLeftProps>) {
  return (
    <>
      <span className="text-2xl flex-shrink-0">{pot.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="font-semibold text-slate-800 text-sm">{pot.name}</p>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[pot.type]}`}>
            {pot.type}
          </span>
          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
            {pot.currency}
          </span>
        </div>
        <p className="text-xs text-slate-400">
          {pot.provider} · {fmtNative(totalMonthly, pot.currency)}/mo · {txnCount} transactions
        </p>
      </div>
    </>
  );
}

type PensionPotCardRightProps = {
  pot: PensionPot;
  currentBalance: number;
  totalMonthly: number;
  balanceInBase: number;
  foreign: boolean;
  isOpen: boolean;
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  onEdit: (pot: PensionPot) => void;
  onToggle: (id: number | null) => void;
};

function PensionPotCardRight({
  pot,
  currentBalance,
  totalMonthly,
  balanceInBase,
  foreign,
  isOpen,
  fmtBase,
  fmtNative,
  onEdit,
  onToggle,
}: Readonly<PensionPotCardRightProps>) {
  return (
    <>
      <div className="text-right flex-shrink-0 mr-3">
        <p className="font-bold text-slate-900">{fmtNative(currentBalance, pot.currency)}</p>
        {foreign && (
          <p className="text-xs text-amber-600 font-medium">&asymp; {fmtBase(balanceInBase)}</p>
        )}
        <p className="text-xs text-emerald-600">+{fmtNative(totalMonthly * 12, pot.currency)}/yr</p>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={() => onEdit(pot)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Edit pot"
        >
          <Edit3 size={13} />
        </button>
        <button
          onClick={() => onToggle(isOpen ? null : pot.id)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          title={isOpen ? 'Collapse' : 'View transactions'}
        >
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
    </>
  );
}

function PensionPotCard({
  pot,
  isOpen,
  pensionTxns,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  baseCurrency,
  onEdit,
  onToggle,
  onDelete,
  onAddTxn,
  onImportStatement,
  onEditTxn,
  onDeleteTxn,
  pensionImportCapability,
}: Readonly<PensionPotCardProps>) {
  const potTxns = pensionTxns.filter((txn) => txn.potId === pot.id);
  const currentBalance = computeCurrentPensionBalance(pot, potTxns);
  const totalMonthly = pot.employeeMonthly + pot.employerMonthly;
  const balanceInBase = convertToBase(currentBalance, pot.currency);
  const foreign = isForeign(pot.currency);
  const txnCount = potTxns.length;

  return (
    <div className="overflow-hidden">
      <div className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors">
        <PensionPotCardLeft
          pot={pot}
          totalMonthly={totalMonthly}
          txnCount={txnCount}
          fmtNative={fmtNative}
        />
        <PensionPotCardRight
          pot={pot}
          currentBalance={currentBalance}
          totalMonthly={totalMonthly}
          balanceInBase={balanceInBase}
          foreign={foreign}
          isOpen={isOpen}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          onEdit={onEdit}
          onToggle={onToggle}
        />
      </div>
      {isOpen && (
        <PensionPotExpanded
          pot={pot}
          pensionTxns={pensionTxns}
          currentBalance={currentBalance}
          foreign={foreign}
          balanceInBase={balanceInBase}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          onDelete={onDelete}
          onAddTxn={onAddTxn}
          onImportStatement={onImportStatement}
          onEditTxn={onEditTxn}
          onDeleteTxn={onDeleteTxn}
          pensionImportCapability={pensionImportCapability}
        />
      )}
    </div>
  );
}

function PensionPotsListItems({
  pensions,
  pensionTxns,
  expanded,
  setExpanded,
  setEditing,
  setAddTxnForPot,
  openImportModal,
  setEditingTxn,
  deletePot,
  handleDeletePensionTxn,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  baseCurrency,
  pensionImportCapability,
}: Readonly<PensionPotsListProps>) {
  return (
    <div className="divide-y divide-slate-50">
      {pensions.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm p-6">
          No pension pots yet. Click <strong>Add Pot</strong> to start tracking.
        </div>
      )}
      {pensions.map((pot) => (
        <PensionPotCard
          key={pot.id}
          pot={pot}
          isOpen={expanded === pot.id}
          pensionTxns={pensionTxns}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          convertToBase={convertToBase}
          isForeign={isForeign}
          baseCurrency={baseCurrency}
          onEdit={(item) => setEditing(item)}
          onToggle={setExpanded}
          onDelete={(id) => deletePot.mutate(id)}
          onAddTxn={(pot) => {
            setEditingTxn(null);
            setAddTxnForPot(pot);
          }}
          onImportStatement={(pot) => {
            openImportModal(pot);
          }}
          onEditTxn={(transaction) => {
            setAddTxnForPot(null);
            setEditingTxn(transaction);
          }}
          onDeleteTxn={handleDeletePensionTxn}
          pensionImportCapability={pensionImportCapability}
        />
      ))}
    </div>
  );
}

export function PensionPotsList(props: Readonly<PensionPotsListProps>) {
  const { setEditing, setShowModal } = props;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
        <div>
          <h3 className="font-semibold text-slate-900">Pension Pots</h3>
          <p className="text-xs text-slate-400 mt-0.5">Click a pot to view transactions</p>
        </div>
        <button
          onClick={() => {
            setEditing(undefined);
            setShowModal(true);
          }}
          className="flex items-center gap-2 text-sm bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={15} /> Add Pot
        </button>
      </div>
      <PensionPotsListItems {...props} />
    </div>
  );
}
