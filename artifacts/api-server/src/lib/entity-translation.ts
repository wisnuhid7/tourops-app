import { storage } from "../storage";
import { aiService } from "./ai";
import { hasCompleteTranslations } from "./tour-translation";

/**
 * Generic lazy translation layer for any DB entity with a `translations` jsonb
 * column. Register a kind once (translatable keys + persist function) and call
 * maybeAutoTranslateEntitiesInBackground(kind, records) from any GET route that
 * serves those records to customers. Missing es/id translations are filled by
 * AI in the background and persisted, so the next request serves them.
 */

type EntityKind = "hotel" | "guide" | "tourDayItem";

interface KindConfig {
  /** Fields worth translating (proper nouns like names are excluded on purpose). */
  keys: string[];
  /** Persist merged translations for one record. */
  update: (id: string, translations: Record<string, any>) => Promise<unknown>;
}

const KINDS: Record<EntityKind, KindConfig> = {
  hotel: {
    keys: ["description", "hotelPolicy", "cancellationPolicy"],
    update: (id, translations) => storage.updateHotel(id, { translations } as any),
  },
  guide: {
    keys: ["language", "notes"],
    update: (id, translations) => storage.updateGuideRate(id, { translations } as any),
  },
  tourDayItem: {
    keys: ["title", "description"],
    update: (id, translations) => storage.updateTourDayItem(id, { translations } as any),
  },
};

function pickFilled(obj: Record<string, any>, keys: string[]) {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

function asStrings(obj: any, keys: string[]) {
  const out: Record<string, string> = {};
  if (obj && typeof obj === "object") {
    for (const k of keys) {
      if (typeof obj[k] === "string") out[k] = obj[k];
    }
  }
  return out;
}

function mergeLang(existing: any, fresh: { es: any; id: any }) {
  return {
    ...(existing && typeof existing === "object" ? existing : {}),
    es: { ...(existing?.es || {}), ...fresh.es },
    id: { ...(existing?.id || {}), ...fresh.id },
  };
}

// ---- Lazy background auto-translation (same guards as tours) ----
const inFlight = new Set<string>();
const failedUntil = new Map<string, number>();
const verifiedCompleteUntil = new Map<string, number>();
const VERIFIED_TTL_MS = 15 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_MEMO_ENTRIES = 5000;

function pruneMemo(map: Map<string, number>) {
  const now = Date.now();
  for (const [k, exp] of map) if (exp <= now) map.delete(k);
  if (map.size > MAX_MEMO_ENTRIES) map.clear();
}

// Cap each AI call so a large catalog can't produce an oversized prompt.
const MAX_BATCH_RECORDS = 20;
const MAX_BATCH_CHARS = 8000;

function chunkInputs(inputs: Array<Record<string, string>>): Array<Array<Record<string, string>>> {
  const chunks: Array<Array<Record<string, string>>> = [];
  let current: Array<Record<string, string>> = [];
  let chars = 0;
  for (const input of inputs) {
    const size = JSON.stringify(input).length;
    if (current.length > 0 && (current.length >= MAX_BATCH_RECORDS || chars + size > MAX_BATCH_CHARS)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(input);
    chars += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Translate + persist es/id for the given records of one kind.
 * Returns the merged translations per record id so callers can verify
 * completeness without re-reading the DB.
 */
export async function autoFillEntityTranslations(
  kind: EntityKind,
  records: Array<Record<string, any>>,
): Promise<Map<string, Record<string, any>>> {
  const cfg = KINDS[kind];
  const merged = new Map<string, Record<string, any>>();
  const inputs = records
    .map((r) => ({ id: r.id as string, ...pickFilled(r, cfg.keys) }))
    .filter((r) => Object.keys(r).length > 1);
  if (inputs.length === 0) return merged;

  const byId = new Map(records.map((r) => [r.id as string, r]));
  for (const chunk of chunkInputs(inputs)) {
    const translated = await aiService.translateRecords(chunk);
    for (const input of chunk) {
      const record = byId.get(input.id)!;
      const es = asStrings(translated.es?.[record.id], cfg.keys);
      const id = asStrings(translated.id?.[record.id], cfg.keys);
      if (Object.keys(es).length === 0 && Object.keys(id).length === 0) continue;
      const mergedTr = mergeLang(record.translations, { es, id });
      await cfg.update(record.id, mergedTr);
      merged.set(record.id, mergedTr);
    }
  }
  return merged;
}

/**
 * Fire-and-forget: translate any records whose es/id translations are
 * incomplete. Dedupes in-flight work per record and backs off on failure.
 */
export function maybeAutoTranslateEntitiesInBackground(
  kind: EntityKind,
  records: Array<Record<string, any>>,
): void {
  const cfg = KINDS[kind];
  pruneMemo(verifiedCompleteUntil);
  pruneMemo(failedUntil);
  const now = Date.now();

  const pending = records.filter((r) => {
    const key = `${kind}:${r.id}`;
    if (!r.id || inFlight.has(key)) return false;
    const verified = verifiedCompleteUntil.get(key);
    if (verified && now < verified) return false;
    const cooldown = failedUntil.get(key);
    if (cooldown && now < cooldown) return false;
    if (hasCompleteTranslations(r, cfg.keys)) {
      verifiedCompleteUntil.set(key, now + VERIFIED_TTL_MS);
      return false;
    }
    return true;
  });
  if (pending.length === 0) return;

  const keys = pending.map((r) => `${kind}:${r.id}`);
  keys.forEach((k) => inFlight.add(k));
  autoFillEntityTranslations(kind, pending)
    .then((merged) => {
      let complete = 0;
      for (const r of pending) {
        const key = `${kind}:${r.id}`;
        // Only memoize records that are actually complete after the merge;
        // partial/empty model output stays eligible for retry.
        const after = { ...r, translations: merged.get(r.id) ?? r.translations };
        if (hasCompleteTranslations(after, cfg.keys)) {
          verifiedCompleteUntil.set(key, Date.now() + VERIFIED_TTL_MS);
          complete++;
        }
        failedUntil.delete(key);
      }
      console.log(`Auto-translated ${complete}/${pending.length} ${kind} record(s) (es/id)`);
    })
    .catch((err) => {
      keys.forEach((k) => failedUntil.set(k, Date.now() + FAILURE_COOLDOWN_MS));
      console.error(`Auto-translation failed for ${kind}:`, err?.message || err);
    })
    .finally(() => keys.forEach((k) => inFlight.delete(k)));
}
