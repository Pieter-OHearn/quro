import { useEffect, useState } from 'react';
import type {
  BankingEntityConfirmationInput,
  BankingEntityOption,
  CurrencyCode,
  RunwayResponse,
  SavingsAccount,
} from '@quro/shared';
import { CURRENCY_CODES } from '@quro/shared';
import {
  Badge,
  Button,
  FormField,
  LoadingState,
  Modal,
  SelectInput,
  TextInput,
} from '@/components/ui';
import {
  useBankingEntities,
  useConfirmBankingEntity,
  useSavingsAccounts,
} from '@/features/savings/hooks';

const MANUAL_VALUE = '__manual__';
const DEFAULT_MANUAL_CAP = 100_000;

function findGuarantee(accountId: number, guarantees: RunwayResponse['depositGuarantee']) {
  return guarantees.find((guarantee) => guarantee.accountIds.includes(accountId)) ?? null;
}

function initialSelection(
  account: SavingsAccount,
  guarantee: RunwayResponse['depositGuarantee'][number] | null,
) {
  if (account.bankingEntityId?.startsWith('manual:')) return MANUAL_VALUE;
  return account.bankingEntityId ?? guarantee?.entityId ?? '';
}

type AccountRowProps = {
  account: SavingsAccount;
  guarantee: RunwayResponse['depositGuarantee'][number] | null;
  entities: BankingEntityOption[];
  pending: boolean;
  onConfirm: (accountId: number, confirmation: BankingEntityConfirmationInput) => Promise<void>;
};

// Each row owns its draft so users can review several accounts without losing other edits.
// eslint-disable-next-line max-lines-per-function, complexity
function BankingEntityAccountRow({
  account,
  guarantee,
  entities,
  pending,
  onConfirm,
}: Readonly<AccountRowProps>) {
  const [selection, setSelection] = useState(() => initialSelection(account, guarantee));
  const [entityName, setEntityName] = useState(account.bankingEntityName ?? '');
  const [scheme, setScheme] = useState(account.depositGuaranteeScheme ?? '');
  const [cap, setCap] = useState(String(account.depositGuaranteeCap ?? DEFAULT_MANUAL_CAP));
  const [currency, setCurrency] = useState<CurrencyCode>(account.depositGuaranteeCurrency ?? 'EUR');
  const [error, setError] = useState('');
  const confirmed = Boolean(account.bankingEntityConfirmedAt);
  const unresolved = guarantee?.confidence === 'unverified';
  const persistedSelection = initialSelection(account, guarantee);
  const persistedEntityName = account.bankingEntityName ?? '';
  const persistedScheme = account.depositGuaranteeScheme ?? '';
  const persistedCap = String(account.depositGuaranteeCap ?? DEFAULT_MANUAL_CAP);
  const persistedCurrency = account.depositGuaranteeCurrency ?? 'EUR';

  useEffect(() => {
    setSelection(persistedSelection);
    setEntityName(persistedEntityName);
    setScheme(persistedScheme);
    setCap(persistedCap);
    setCurrency(persistedCurrency);
  }, [persistedCap, persistedCurrency, persistedEntityName, persistedScheme, persistedSelection]);

  const submit = async (confirmation: BankingEntityConfirmationInput) => {
    setError('');
    try {
      await onConfirm(account.id, confirmation);
    } catch {
      setError('The banking entity could not be saved.');
    }
  };

  const save = async () => {
    let confirmation: BankingEntityConfirmationInput;
    if (selection === MANUAL_VALUE) {
      const parsedCap = Number(cap);
      if (!entityName.trim() || !scheme.trim() || !Number.isFinite(parsedCap) || parsedCap <= 0) {
        setError('Enter the licensed entity, protection scheme, and a positive guarantee cap.');
        return;
      }
      confirmation = {
        mode: 'manual',
        entityName: entityName.trim(),
        scheme: scheme.trim(),
        cap: parsedCap,
        currency,
      };
    } else if (selection) {
      confirmation = { mode: 'known', entityId: selection };
    } else {
      setError('Choose a licensed entity.');
      return;
    }
    await submit(confirmation);
  };

  return (
    <section className="rounded-xl border border-border-subtle p-4" aria-label={account.name}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-fg">{account.name}</h3>
          <p className="text-sm text-fg-muted">Entered bank: {account.bank}</p>
        </div>
        <Badge tone={confirmed ? 'success' : unresolved ? 'warningSoft' : 'neutral'}>
          {confirmed ? 'Confirmed by you' : unresolved ? 'Needs review' : 'Matched automatically'}
        </Badge>
      </div>
      <div className="mt-4 space-y-3">
        <FormField
          label="Licensed banking entity"
          hint="Deposit protection is grouped by the licensed entity, not the account brand."
        >
          <SelectInput
            value={selection}
            onChange={(value) => {
              setSelection(value);
              setError('');
            }}
            options={[
              { value: '', label: 'Choose an entity' },
              ...entities.map((entity) => ({
                value: entity.id,
                label: `${entity.name} · ${entity.country} · ${entity.scheme}`,
              })),
              { value: MANUAL_VALUE, label: 'Enter another licensed entity…' },
            ]}
          />
        </FormField>
        {selection === MANUAL_VALUE ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Licensed entity name">
              <TextInput
                value={entityName}
                onChange={setEntityName}
                placeholder="Legal bank name"
              />
            </FormField>
            <FormField label="Deposit protection scheme">
              <TextInput value={scheme} onChange={setScheme} placeholder="Country or scheme name" />
            </FormField>
            <FormField
              label="Protection cap"
              hint="Enter the per-depositor limit stated by the scheme."
            >
              <TextInput
                type="number"
                min="0.01"
                step="0.01"
                value={cap}
                onChange={setCap}
                placeholder="100000"
              />
            </FormField>
            <FormField label="Cap currency">
              <SelectInput
                value={currency}
                onChange={(value) => setCurrency(value as CurrencyCode)}
                options={CURRENCY_CODES.map((code) => ({ value: code, label: code }))}
              />
            </FormField>
          </div>
        ) : null}
        {guarantee?.source ? (
          <p className="text-xs text-fg-subtle">
            Official source:{' '}
            <a
              className="font-medium text-brand-fg underline decoration-brand-border underline-offset-2"
              href={guarantee.source.url}
              target="_blank"
              rel="noreferrer"
            >
              {guarantee.source.publisher}: {guarantee.source.title}
            </a>
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger-fg">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          {confirmed ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => void submit({ mode: 'clear' })}
            >
              Use automatic matching
            </Button>
          ) : null}
          <Button size="sm" disabled={pending} loading={pending} onClick={() => void save()}>
            {confirmed ? 'Save entity' : 'Confirm entity'}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function BankingEntityReviewModal({
  guarantees,
  onClose,
}: Readonly<{
  guarantees: RunwayResponse['depositGuarantee'];
  onClose: () => void;
}>) {
  const accountsQuery = useSavingsAccounts();
  const entitiesQuery = useBankingEntities();
  const confirmEntity = useConfirmBankingEntity();
  const accounts = [...(accountsQuery.data ?? [])].sort((a, b) => {
    const aUnresolved = findGuarantee(a.id, guarantees)?.confidence === 'unverified' ? 0 : 1;
    const bUnresolved = findGuarantee(b.id, guarantees)?.confidence === 'unverified' ? 0 : 1;
    return aUnresolved - bUnresolved;
  });

  return (
    <Modal
      title="Review banking entities"
      subtitle="Confirm how savings balances share deposit protection"
      onClose={onClose}
      maxWidth="xl"
      scrollable
    >
      <p className="text-sm leading-6 text-fg-muted">
        Quro matches bank names automatically. Confirm the licensed entity when the brand is
        ambiguous; changing the bank name in Savings will reset that confirmation.
      </p>
      {accountsQuery.isPending || entitiesQuery.isPending ? (
        <LoadingState label="Loading banking entities" />
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <BankingEntityAccountRow
              key={account.id}
              account={account}
              guarantee={findGuarantee(account.id, guarantees)}
              entities={entitiesQuery.data ?? []}
              pending={confirmEntity.isPending}
              onConfirm={(accountId, confirmation) =>
                confirmEntity.mutateAsync({ accountId, confirmation }).then(() => undefined)
              }
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
