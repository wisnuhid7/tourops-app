/**
 * DB-facing quote workflow.
 *
 * Narrow command/query functions over the pricing-quote tables. This module
 * owns transactions, row locks and compare-and-swap updates. It contains NO
 * Express `req`/`res`, role gates, Zod validation or HTTP status mapping — the
 * routes keep those, and keep the pure decisions (status machine, timing patch,
 * snapshot shape, viewed audit, customer projection) in
 * services/quote-lifecycle.ts.
 *
 * Every function takes the Drizzle `db` explicitly and a narrow audit writer so
 * the module never reaches for the storage singleton. Behaviour is strictly
 * identical to the inline route code it replaces — extraction only.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  groupSizeBands,
  pricingQuoteLineItems,
  pricingQuoteOverrides,
  pricingQuotes,
  quotePricingSnapshots,
  type InsertAuditLog,
} from "@workspace/db";
import type { LineItemResult } from "./pricing-engine";
import {
  buildApprovalSnapshot,
  buildViewedAudit,
  nextSnapshotVersionFrom,
  VIEWED_TRANSITION_FROM,
  VIEWED_TRANSITION_TO,
} from "./quote-lifecycle";

/** The Drizzle database handle (or an active transaction). */
export type QuoteDb = typeof db;

export type PricingQuote = typeof pricingQuotes.$inferSelect;
export type PricingQuoteInsert = typeof pricingQuotes.$inferInsert;
export type PricingQuoteLineItem = typeof pricingQuoteLineItems.$inferSelect;
export type PricingQuoteOverride = typeof pricingQuoteOverrides.$inferSelect;
export type QuotePricingSnapshot = typeof quotePricingSnapshots.$inferSelect;
export type GroupSizeBand = typeof groupSizeBands.$inferSelect;

/** Minimal audit-log sink. The route passes `storage`; tests can pass a stub. */
export interface QuoteAuditWriter {
  createAuditLog(data: InsertAuditLog): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Reads (no transactions, no locks)
// ---------------------------------------------------------------------------

export async function findPricingQuote(
  db: QuoteDb,
  quoteId: string,
): Promise<PricingQuote | undefined> {
  const [quote] = await db.select().from(pricingQuotes).where(eq(pricingQuotes.id, quoteId));
  return quote;
}

export async function findPricingQuoteByShareToken(
  db: QuoteDb,
  shareToken: string,
): Promise<PricingQuote | undefined> {
  const [quote] = await db.select().from(pricingQuotes).where(eq(pricingQuotes.shareToken, shareToken));
  return quote;
}

export async function listPricingQuotes(
  db: QuoteDb,
  tourId?: string,
): Promise<PricingQuote[]> {
  return db.select().from(pricingQuotes)
    .where(tourId ? eq(pricingQuotes.tourId, tourId) : undefined)
    .orderBy(desc(pricingQuotes.createdAt));
}

export async function listQuoteLineItems(
  db: QuoteDb,
  quoteId: string,
): Promise<PricingQuoteLineItem[]> {
  return db.select().from(pricingQuoteLineItems)
    .where(eq(pricingQuoteLineItems.quoteId, quoteId))
    .orderBy(pricingQuoteLineItems.hotelChoice);
}

export async function listQuoteOverrides(
  db: QuoteDb,
  quoteId: string,
): Promise<PricingQuoteOverride[]> {
  return db.select().from(pricingQuoteOverrides)
    .where(eq(pricingQuoteOverrides.quoteId, quoteId))
    .orderBy(desc(pricingQuoteOverrides.createdAt));
}

export async function listQuoteSnapshots(
  db: QuoteDb,
  quoteId: string,
): Promise<QuotePricingSnapshot[]> {
  return db.select().from(quotePricingSnapshots)
    .where(eq(quotePricingSnapshots.quoteId, quoteId))
    .orderBy(quotePricingSnapshots.version);
}

/**
 * Internal breakdown read: quote, its line items (hotelChoice ASC) and the
 * resolved group-size band (if any). Returns null when the quote is missing.
 */
export async function findInternalPricingQuote(
  db: QuoteDb,
  quoteId: string,
): Promise<{ quote: PricingQuote; lineItems: PricingQuoteLineItem[]; groupSizeBand: GroupSizeBand | null } | null> {
  const quote = await findPricingQuote(db, quoteId);
  if (!quote) return null;
  const lineItems = await listQuoteLineItems(db, quoteId);
  const groupSizeBand = quote.groupSizeBandId
    ? (await db.select().from(groupSizeBands).where(eq(groupSizeBands.id, quote.groupSizeBandId)))[0] ?? null
    : null;
  return { quote, lineItems, groupSizeBand };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface PersistComputedQuoteInput {
  /** Quote row values (the route builds these from rule/band/body/compute result). */
  quote: PricingQuoteInsert;
  /** Line items produced by computeQuote. adjustmentItems [] is stored as NULL. */
  lineItems: LineItemResult[];
  /**
   * Permanent creation trail, written post-commit (failure never blocks).
   * entityId is filled from the inserted quote id.
   */
  audit: Omit<InsertAuditLog, "entityId">;
}

/**
 * Persist a freshly computed quote and its line items in a single transaction.
 * The creation audit is written after commit and is fire-and-forget.
 */
export async function persistComputedQuote(
  db: QuoteDb,
  auditWriter: QuoteAuditWriter,
  input: PersistComputedQuoteInput,
): Promise<PricingQuote> {
  const quote = await db.transaction(async (tx) => {
    const [q] = await tx.insert(pricingQuotes).values(input.quote).returning();
    if (input.lineItems.length > 0) {
      await tx.insert(pricingQuoteLineItems).values(
        input.lineItems.map((li) => ({
          ...li,
          quoteId: q.id,
          // adjustmentItems is a JSONB column; store as-is.
          adjustmentItems: li.adjustmentItems.length > 0 ? li.adjustmentItems : null,
        })),
      );
    }
    return q;
  });

  await auditWriter.createAuditLog({ ...input.audit, entityId: quote.id }).catch(() => { /* audit failure must not block quoting */ });
  return quote;
}

export type ApplyQuoteUpdateResult =
  | { ok: true; quote: PricingQuote }
  | { ok: false; reason: "conflict" };

export interface ApplyQuoteUpdateInput {
  quoteId: string;
  /** Raw status the caller validated against (including the literal "final"). */
  expectedStatus: PricingQuote["status"];
  /** Full update set (already merged transition + timing patches + updatedAt). */
  patch: Record<string, unknown>;
  /** True when this is a real status transition (drives snapshot + audit). */
  isTransition: boolean;
  /** Normalised target status, used to detect an approval. */
  targetStatus?: string;
  actorId: string;
}

/**
 * Apply a validated quote update.
 *
 * Compare-and-swap on (id, raw expectedStatus). When the update approves the
 * quote, the immutable pricing snapshot is written in the same transaction:
 * line items are locked FOR UPDATE, the compute-time inputs are read from the
 * quote's calculationMeta, and the snapshot version is derived inside the
 * transaction. A snapshot failure rolls the approval back.
 *
 * The status_changed audit is written post-commit and is fire-and-forget; it is
 * emitted only for real transitions.
 */
export async function applyQuoteUpdate(
  db: QuoteDb,
  auditWriter: QuoteAuditWriter,
  input: ApplyQuoteUpdateInput,
): Promise<ApplyQuoteUpdateResult> {
  const { quoteId, expectedStatus, patch, isTransition, targetStatus, actorId } = input;

  const quote = await db.transaction(async (tx) => {
    // Compare-and-swap: fail if a concurrent transition already moved the
    // quote away from the status we validated against.
    const [q] = await tx.update(pricingQuotes)
      .set(patch)
      .where(and(
        eq(pricingQuotes.id, quoteId),
        eq(pricingQuotes.status, expectedStatus),
      )).returning();
    if (!q) return null; // concurrent update detected

    if (isTransition && targetStatus === "approved") {
      // Lock all line items for this quote so no concurrent price override
      // can commit after we read them. The UPDATE on pricing_quotes above
      // implicitly holds a row lock on the quote; the SELECT FOR UPDATE below
      // extends that to the line items. Any concurrent override that already
      // holds a line item lock will cause this SELECT to wait; once it
      // releases, we read the post-override prices (the correct final values).
      // Any override that tries to lock a line item AFTER this point will block
      // until this transaction commits, then see status "approved" in its own
      // status check and fail with 409.
      await tx.execute(
        sql`SELECT id FROM pricing_quote_line_items WHERE quote_id = ${q.id} FOR UPDATE`,
      );
      const lineItems = await tx.select().from(pricingQuoteLineItems)
        .where(eq(pricingQuoteLineItems.quoteId, q.id))
        .orderBy(pricingQuoteLineItems.hotelChoice);

      // Retrieve the inputs captured at computation time — the exact rule
      // values / hotel inputs / adjustment rules used when computeQuote ran,
      // not re-queried mutable live records.
      const computeInputs = (q.calculationMeta as any)?._computeInputs ?? null;

      // Concurrency-safe version number: query max inside the same transaction;
      // the unique index on (quote_id, version) rejects a second concurrent
      // insert for the same version.
      const vrows = await tx.execute<{ maxver: string }>(
        sql`SELECT COALESCE(MAX(version), 0)::text AS maxver
            FROM quote_pricing_snapshots
            WHERE quote_id = ${q.id}`,
      );
      const nextVersion = nextSnapshotVersionFrom(vrows.rows[0]?.maxver ?? null);

      await tx.insert(quotePricingSnapshots).values(buildApprovalSnapshot({
        quote: q,
        lineItems,
        computeInputs,
        version: nextVersion,
        createdBy: actorId,
      }));
    }

    return q;
  });

  if (!quote) return { ok: false, reason: "conflict" };

  if (isTransition) {
    await auditWriter.createAuditLog({
      entityType: "pricing_quote", entityId: quote.id, action: "status_changed",
      changedBy: actorId, previousValue: expectedStatus, newValue: quote.status,
    }).catch(() => {});
  }
  return { ok: true, quote };
}

export type ApplyPriceOverrideFailure =
  | "quote_not_found"
  | "quote_not_overridable"
  | "line_item_not_found";

export type ApplyPriceOverrideResult =
  | { ok: true; override: PricingQuoteOverride }
  | { ok: false; reason: ApplyPriceOverrideFailure; status?: string };

export interface ApplyPriceOverrideInput {
  quoteId: string;
  lineItemId: string;
  overrideValue: string;
  reason: string;
  actorId: string;
  /** Statuses on which overriding is allowed (OVERRIDABLE_QUOTE_STATUSES). */
  overridableStatuses: ReadonlySet<string>;
}

/**
 * Apply a manual selling-price override to one line item.
 *
 * Preserves the original locking order exactly: preflight quote read, status
 * check, line-item preflight, then the transaction locks the quote row first
 * (so a concurrent approval — which also locks the quote — cannot win), re-reads
 * the status inside the lock, re-reads the line item, inserts the override,
 * updates the line item, and bumps the quote's updatedAt. The override audit is
 * written post-commit using the preflight selling price as previousValue and is
 * fire-and-forget.
 */
export async function applyPriceOverride(
  db: QuoteDb,
  auditWriter: QuoteAuditWriter,
  input: ApplyPriceOverrideInput,
): Promise<ApplyPriceOverrideResult> {
  const { quoteId, lineItemId, overrideValue, reason, actorId, overridableStatuses } = input;

  const quote = await findPricingQuote(db, quoteId);
  if (!quote) return { ok: false, reason: "quote_not_found" };
  // Price-lock invariant: once approved (or sent/viewed/accepted), prices are
  // frozen — overriding requires sending the quote back to draft and through a
  // fresh approval cycle.
  if (!overridableStatuses.has(quote.status))
    return { ok: false, reason: "quote_not_overridable", status: quote.status };

  const [li] = await db.select().from(pricingQuoteLineItems)
    .where(eq(pricingQuoteLineItems.id, lineItemId));
  if (!li || li.quoteId !== quote.id)
    return { ok: false, reason: "line_item_not_found" };

  const outcome = await db.transaction(async (tx) => {
    // Lock the quote row first so the status cannot be changed to "approved"
    // concurrently (the approval UPDATE also locks the row). After getting the
    // lock we re-read the status to confirm the quote is still overridable — it
    // may have been approved while we were outside this transaction.
    const lockedRows = await tx.execute<{ status: string }>(
      sql`SELECT status FROM pricing_quotes WHERE id = ${quote.id} FOR UPDATE`,
    );
    const lockedStatus = lockedRows.rows[0]?.status;
    if (!lockedStatus || !overridableStatuses.has(lockedStatus))
      return { ok: false as const, reason: "quote_not_overridable" as const, status: lockedStatus };

    // Re-read the current line item price inside the lock in case another
    // override committed after our outer SELECT but before this transaction.
    const [freshLi] = await tx.select().from(pricingQuoteLineItems)
      .where(eq(pricingQuoteLineItems.id, li.id));
    if (!freshLi || freshLi.quoteId !== quote.id)
      return { ok: false as const, reason: "line_item_not_found" as const };

    const [ov] = await tx.insert(pricingQuoteOverrides).values({
      quoteId: quote.id, lineItemId: freshLi.id, fieldName: "selling_price",
      originalValue: freshLi.sellingPrice, overrideValue,
      reason: reason.trim(), createdBy: actorId, approvedBy: actorId,
    }).returning();
    await tx.update(pricingQuoteLineItems)
      .set({ sellingPrice: overrideValue })
      .where(eq(pricingQuoteLineItems.id, freshLi.id));
    await tx.update(pricingQuotes).set({ updatedAt: new Date() })
      .where(eq(pricingQuotes.id, quote.id));
    return { ok: true as const, override: ov };
  });

  if (!outcome.ok) return outcome;

  await auditWriter.createAuditLog({
    entityType: "pricing_quote", entityId: quote.id, action: "price_overridden",
    changedBy: actorId, previousValue: li.sellingPrice, newValue: overrideValue,
    note: `${li.hotelChoice}/${li.occupancy}: ${reason.trim()}`,
  }).catch(() => {});
  return { ok: true, override: outcome.override };
}

/**
 * CAS sent→viewed on the first customer look. The audit record is written only
 * when this request won the transition; concurrent readers keep the quote they
 * loaded. Shared by the authenticated customer view and the anonymous
 * share-link view (which differ only in the audit payload).
 */
export async function markQuoteViewed(
  db: QuoteDb,
  auditWriter: QuoteAuditWriter,
  quote: PricingQuote,
  auditContext: { changedBy?: string; note?: string },
): Promise<PricingQuote> {
  const [updated] = await db.update(pricingQuotes)
    .set({ status: VIEWED_TRANSITION_TO, updatedAt: new Date() })
    .where(and(eq(pricingQuotes.id, quote.id), eq(pricingQuotes.status, VIEWED_TRANSITION_FROM)))
    .returning();
  if (!updated) return quote;
  await auditWriter.createAuditLog(buildViewedAudit({
    quoteId: updated.id,
    changedBy: auditContext.changedBy,
    note: auditContext.note,
  })).catch(() => {});
  return updated;
}
