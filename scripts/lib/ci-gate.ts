export type NeedsContext = Record<string, { result?: string }>;

export function findFailedNeeds(needs: NeedsContext): string[] {
  const entries = Object.entries(needs);
  if (entries.length === 0) return ['(no needed jobs reported)'];
  return entries
    .filter(([, job]) => job.result !== 'success')
    .map(([name, job]) => `${name}: ${job.result ?? 'unknown'}`);
}

if (import.meta.main) {
  const raw = process.env.NEEDS_JSON;
  let failed: string[];
  try {
    failed = findFailedNeeds(JSON.parse(raw ?? '') as NeedsContext);
  } catch {
    failed = ['NEEDS_JSON missing or invalid'];
  }
  if (failed.length > 0) {
    console.error(`CI gate failed:\n${failed.map((line) => `  - ${line}`).join('\n')}`);
    process.exit(1);
  }
  console.log('All needed jobs succeeded');
}
