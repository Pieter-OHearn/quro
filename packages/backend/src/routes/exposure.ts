import { Hono } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import {
  MAX_RISK_CLASS,
  MIN_RISK_CLASS,
  isAssetClass,
  parseExposureSettings,
  type AssetClass,
} from '@quro/shared';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { holdings } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import { buildExposureReport, resetExposureSettings, saveExposureSettings } from '../lib/exposure';
import {
  err,
  isRecord,
  ok,
  parseOptionalIntegerField,
  readJsonBody,
  rejectUnknownFields,
  type ParseResult,
} from '../lib/requestValidation';

const app = new Hono();

// A person has tens of holdings, not thousands; the cap only bounds a request.
const MAX_CLASSIFICATIONS = 500;

type Classification = {
  id: number;
  assetClass?: AssetClass | null;
  riskClassOverride?: number | null;
};

function parseRiskClassChange(value: unknown): ParseResult<number | null> {
  return parseOptionalIntegerField(
    value,
    `Risk class must be a whole number from ${MIN_RISK_CLASS} to ${MAX_RISK_CLASS}`,
    MIN_RISK_CLASS,
    MAX_RISK_CLASS,
  );
}

function parseClassificationChanges(
  value: Record<string, unknown>,
): ParseResult<Omit<Classification, 'id'>> {
  const changes: Omit<Classification, 'id'> = {};
  if ('assetClass' in value) {
    if (value.assetClass !== null && !isAssetClass(value.assetClass)) {
      return err('Invalid asset class');
    }
    changes.assetClass = value.assetClass;
  }
  if ('riskClassOverride' in value) {
    const risk = parseRiskClassChange(value.riskClassOverride);
    if (!risk.ok) return risk;
    changes.riskClassOverride = risk.value;
  }
  return Object.keys(changes).length === 0
    ? err('Nothing to change for this holding')
    : ok(changes);
}

function parseClassification(value: unknown): ParseResult<Classification> {
  if (!isRecord(value)) return err('Invalid classification');
  const rejected = rejectUnknownFields(value, ['id', 'assetClass', 'riskClassOverride']);
  if (!rejected.ok) return rejected;
  if (typeof value.id !== 'number' || !Number.isInteger(value.id) || value.id <= 0) {
    return err('Invalid holding id');
  }
  const changes = parseClassificationChanges(value);
  return changes.ok ? ok({ id: value.id, ...changes.value }) : changes;
}

function parseClassifications(payload: unknown): ParseResult<Classification[]> {
  if (!isRecord(payload)) return err('Invalid classification payload');
  const rejected = rejectUnknownFields(payload, ['updates']);
  if (!rejected.ok) return rejected;
  const { updates } = payload;
  if (!Array.isArray(updates) || updates.length === 0) {
    return err('At least one holding update is required');
  }
  if (updates.length > MAX_CLASSIFICATIONS) return err('Too many holding updates');
  const parsed: Classification[] = [];
  for (const update of updates) {
    const item = parseClassification(update);
    if (!item.ok) return item;
    parsed.push(item.value);
  }
  if (new Set(parsed.map((item) => item.id)).size !== parsed.length) {
    return err('A holding can appear only once');
  }
  return ok(parsed);
}

// The breakdown, its facts and the settings it was worked out with.
app.get('/', async (c) => {
  const user = getAuthUser(c);
  return c.json({ data: await buildExposureReport(user.id) });
});

app.put('/settings', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid exposure settings');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);
  const parsed = parseExposureSettings(rawBody.value);
  // The page checks the same rules before it sends, so the first problem is enough here.
  if (!parsed.ok) return c.json({ error: parsed.errors[0] }, HTTP_STATUS.BAD_REQUEST);
  return c.json({ data: await saveExposureSettings(user.id, parsed.value) });
});

app.delete('/settings', async (c) => {
  const user = getAuthUser(c);
  return c.json({ data: await resetExposureSettings(user.id) });
});

// Sets the asset class (and optionally a fund's own risk class) of several holdings at once. All
// or none: one holding the caller does not own fails the whole request with the same answer as a
// holding that does not exist.
app.patch('/classification', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid classification payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);
  const parsed = parseClassifications(rawBody.value);
  if (!parsed.ok) return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);

  const data = await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: holdings.id })
      .from(holdings)
      .where(
        and(
          eq(holdings.userId, user.id),
          inArray(
            holdings.id,
            parsed.value.map((update) => update.id),
          ),
        ),
      );
    if (owned.length !== parsed.value.length) return null;
    const updated = [];
    for (const { id, ...changes } of parsed.value) {
      const [row] = await tx
        .update(holdings)
        .set(changes)
        .where(and(eq(holdings.id, id), eq(holdings.userId, user.id)))
        .returning({
          id: holdings.id,
          assetClass: holdings.assetClass,
          riskClassOverride: holdings.riskClassOverride,
        });
      updated.push(row);
    }
    return updated;
  });
  return data ? c.json({ data }) : c.json({ error: 'Holding not found' }, HTTP_STATUS.NOT_FOUND);
});

export default app;
