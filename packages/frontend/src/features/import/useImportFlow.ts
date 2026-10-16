import { useMemo, useState } from 'react';
import type { CsvImportKind, CsvImportPreview, CsvImportProfile, CurrencyCode } from '@quro/shared';
import { resolveApiErrorMessage } from '@/lib/api';
import {
  useDescribeCsv,
  useImportProfiles,
  usePreviewCsv,
  useRunImport,
  type CsvDescription,
  type ImportRequest,
} from './hooks';
import { readCsvFile } from './csvFile';
import {
  draftFromProfile,
  draftFromSuggestion,
  draftProblem,
  draftToMapping,
  emptyDraft,
  profileFits,
  type MappingDraft,
} from './mappingDraft';

export type ImportStep = 'file' | 'mapping' | 'review' | 'run';

type FlowOptions = { kind: CsvImportKind; accountId?: number; currency: CurrencyCode };

function closingFields(draft: MappingDraft): Partial<ImportRequest> | string {
  const balance = draft.closingBalance.trim();
  if (balance === '' && draft.closingDate === '') return {};
  const amount = Number(balance);
  if (balance === '' || !Number.isFinite(amount) || draft.closingDate === '') {
    return 'Enter both the closing balance and its date, or neither.';
  }
  return { closingBalance: amount, closingDate: draft.closingDate };
}

function buildRequest(
  draft: MappingDraft,
  csv: string | null,
  kind: CsvImportKind,
  accountId?: number,
): ImportRequest | string {
  const problem = draftProblem(draft);
  const closing = closingFields(draft);
  if (problem) return problem;
  if (typeof closing === 'string') return closing;
  if (csv === null) return 'Choose a file first.';
  return { kind, accountId, csv, mapping: draftToMapping(draft, kind), ...closing };
}

/** The mapping to start from: a saved one that fits the file, else the header-based guess. */
function startingDraft(
  currency: CurrencyCode,
  described: CsvDescription,
  saved: CsvImportProfile | undefined,
): MappingDraft {
  const base = emptyDraft(currency);
  return saved ? draftFromProfile(base, saved) : draftFromSuggestion(base, described.suggestion);
}

/** The state and actions of the import dialog: file, mapping, review, run. */
export function useImportFlow({ kind, accountId, currency }: FlowOptions) {
  const profiles = useImportProfiles(kind);
  const describe = useDescribeCsv();
  const previewMutation = usePreviewCsv();
  const run = useRunImport();
  const [step, setStep] = useState<ImportStep>('file');
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [description, setDescription] = useState<CsvDescription | null>(null);
  const [draft, setDraft] = useState<MappingDraft>(() => emptyDraft(currency));
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [saveProfile, setSaveProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = async (chosen: File) => {
    setError(null);
    try {
      const csv = await readCsvFile(chosen);
      const described = await describe.mutateAsync(csv);
      const saved = profiles.data?.find((profile) => profileFits(profile, described.headers));
      setFile({ name: chosen.name, csv });
      setDescription(described);
      setDraft(startingDraft(currency, described, saved));
      setStep('mapping');
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, 'The file could not be read.'));
    }
  };

  const request = useMemo(
    () => buildRequest(draft, file?.csv ?? null, kind, accountId),
    [draft, file, kind, accountId],
  );

  const runPreview = async () => {
    if (typeof request === 'string') return setError(request);
    setError(null);
    try {
      const result = await previewMutation.mutateAsync(request);
      setPreview(result);
      setSelected(
        new Set(result.rows.filter((row) => row.status === 'ready').map((r) => r.rowNumber)),
      );
      setStep('review');
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, 'The file could not be previewed.'));
    }
  };

  const confirm = () => {
    if (typeof request === 'string' || !file || !preview) return;
    setStep('run');
    void run.start({
      ...request,
      fileName: file.name,
      fileSha256: preview.fileSha256,
      selectedRows: [...selected].sort((a, b) => a - b),
      saveProfile,
    });
  };

  return {
    step,
    setStep,
    file,
    description,
    draft,
    setDraft,
    preview,
    selected,
    setSelected,
    saveProfile,
    setSaveProfile,
    error,
    profiles: profiles.data ?? [],
    busy: describe.isPending || previewMutation.isPending,
    chooseFile,
    runPreview,
    confirm,
    run,
  };
}
