import { storage } from "../storage";
import { aiService } from "./ai";

export const TOUR_TRANSLATABLE_KEYS = ["title", "description", "highlights", "inclusions", "exclusions"];
export const DAY_TRANSLATABLE_KEYS = ["title", "description", "activities"];
const LANGS = ["es", "id"] as const;

// Only send fields that actually have source (English) content.
function pickFilled(obj: Record<string, any>, keys: string[]) {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) out[k] = v;
  }
  return out;
}

// Never trust the model's output shape: keep only expected keys whose
// values are strings before writing anything to the DB.
function asStrings(obj: any, keys: string[]) {
  const out: Record<string, string> = {};
  if (obj && typeof obj === "object") {
    for (const k of keys) {
      if (typeof obj[k] === "string") out[k] = obj[k];
    }
  }
  return out;
}

// Merge into any existing translations so we never drop other languages.
function mergeLang(existing: any, fresh: { es: any; id: any }) {
  return {
    ...(existing && typeof existing === "object" ? existing : {}),
    es: { ...(existing?.es || {}), ...fresh.es },
    id: { ...(existing?.id || {}), ...fresh.id },
  };
}

/** True if every source-filled field on the record has a translation for every language. */
export function hasCompleteTranslations(record: Record<string, any>, keys: string[]): boolean {
  const source = pickFilled(record, keys);
  const sourceKeys = Object.keys(source);
  if (sourceKeys.length === 0) return true;
  const tr = record.translations;
  if (!tr || typeof tr !== "object") return false;
  return LANGS.every((lang) =>
    sourceKeys.every((k) => typeof tr[lang]?.[k] === "string" && tr[lang][k].trim()),
  );
}

/**
 * Translate a tour + its itinerary days to ES/ID via AI and persist the result
 * into the `translations` jsonb columns. Idempotent; merges with existing
 * translations. Returns the updated tour and days.
 */
export async function autoFillTourTranslations(
  tourId: string,
  actor?: { userId?: string; userName?: string },
) {
  const tour = await storage.getTour(tourId);
  if (!tour) throw new Error("Tour not found");
  const days = await storage.getTourDays(tourId);

  const tourInput = pickFilled(tour as any, TOUR_TRANSLATABLE_KEYS);
  // Key days by their unique id (dayNumber is not guaranteed unique per tour).
  const dayInputs = days.map((d) => ({ id: d.id, ...pickFilled(d as any, DAY_TRANSLATABLE_KEYS) }));

  const translated = await aiService.translateTourBundle({ tour: tourInput, days: dayInputs });

  const tourTranslations = mergeLang((tour as any).translations, {
    es: asStrings(translated.es?.tour, TOUR_TRANSLATABLE_KEYS),
    id: asStrings(translated.id?.tour, TOUR_TRANSLATABLE_KEYS),
  });

  const updatedTour = await storage.updateTour(
    tourId,
    { translations: tourTranslations } as any,
    actor?.userId,
    actor?.userName,
  );

  const updatedDays = [];
  for (const day of days) {
    const dayTranslations = mergeLang((day as any).translations, {
      es: asStrings(translated.es?.days?.[day.id], DAY_TRANSLATABLE_KEYS),
      id: asStrings(translated.id?.days?.[day.id], DAY_TRANSLATABLE_KEYS),
    });
    updatedDays.push(await storage.updateTourDay(day.id, { translations: dayTranslations } as any));
  }

  return { tour: updatedTour, days: updatedDays };
}

// ---- Lazy background auto-translation ----
// When a tour is fetched and its translations are incomplete, kick off ONE
// background translation for it. Dedupe in-flight work and remember failures
// briefly so a broken AI key can't hammer the AI endpoint on every page view.
const inFlight = new Set<string>();
const failedUntil = new Map<string, number>();
// Completeness memo with TTL: avoids re-reading days on every view, but
// expires so content edits get re-checked (and re-translated) within the TTL.
const verifiedCompleteUntil = new Map<string, number>();
const VERIFIED_TTL_MS = 15 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const MAX_MEMO_ENTRIES = 5000;

// Drop expired entries; if a map is still oversized, clear it (cheap, safe —
// worst case is a redundant completeness re-check).
function pruneMemo(map: Map<string, number>) {
  const now = Date.now();
  for (const [k, exp] of map) if (exp <= now) map.delete(k);
  if (map.size > MAX_MEMO_ENTRIES) map.clear();
}

export function maybeAutoTranslateTourInBackground(tour: Record<string, any>): void {
  const id = tour.id as string;
  if (!id || inFlight.has(id)) return;
  pruneMemo(verifiedCompleteUntil);
  pruneMemo(failedUntil);
  const verified = verifiedCompleteUntil.get(id);
  if (verified && Date.now() < verified) return;
  const cooldown = failedUntil.get(id);
  if (cooldown && Date.now() < cooldown) return;

  inFlight.add(id);
  (async () => {
    if (hasCompleteTranslations(tour, TOUR_TRANSLATABLE_KEYS)) {
      // Tour record is complete — still verify itinerary days once.
      const days = await storage.getTourDays(id);
      if (days.every((d) => hasCompleteTranslations(d as any, DAY_TRANSLATABLE_KEYS))) {
        verifiedCompleteUntil.set(id, Date.now() + VERIFIED_TTL_MS);
        return;
      }
    }
    await autoFillTourTranslations(id);
    verifiedCompleteUntil.set(id, Date.now() + VERIFIED_TTL_MS);
    failedUntil.delete(id);
    console.log(`Auto-translated tour ${id} (es/id)`);
  })()
    .catch((err) => {
      failedUntil.set(id, Date.now() + FAILURE_COOLDOWN_MS);
      console.error(`Auto-translation failed for tour ${id}:`, err?.message || err);
    })
    .finally(() => inFlight.delete(id));
}
