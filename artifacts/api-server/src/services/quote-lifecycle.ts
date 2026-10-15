/**
 * Quote lifecycle — status machine and approval-snapshot construction.
 *
 * Pure, DB-free leaf module: no database, Express, storage or request objects.
 * The route handlers keep their DB reads/writes, CAS (compare-and-swap)
 * transactions, role gating and audit logging; this module owns only the
 * decision logic so it can be unit-tested without a database.
 *
 * Domain rules preserved verbatim from the route layer:
 * - "final" is the legacy value and is treated exactly like "approved".
 * - approve/reject require an admin role and someone other than the creator.
 * - approval freezes an immutable pricing snapshot (version-monotonic per quote).
 * - a sent/accepted quote whose validity has lapsed must be re-approved first.
 */

/** Every status a quote may hold (legacy "final" included). */
export const QUOTE_STATUSES = [
  "draft", "final", "archived", "pending_approval", "approved",
  "rejected", "sent", "viewed", "accepted", "expired", "cancelled",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/**
 * Allowed transitions (from → to). Approve/reject require an admin role;
 * everything else needs PRICING_INTERNAL_ROLES (enforced in the handler).
 */
export const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_approval", "cancelled", "archived"],
  pending_approval: ["approved", "rejected", "draft", "cancelled"],
  rejected: ["draft", "cancelled", "archived"],
  approved: ["sent", "draft", "cancelled", "archived"],
  sent: ["viewed", "accepted", "expired", "cancelled"],
  viewed: ["accepted", "expired", "cancelled"],
  accepted: ["archived"],
  expired: ["draft", "archived"],
  cancelled: ["archived"],
  archived: [],
};

/** Transitions that require an admin role (and a non-creator actor). */
export const QUOTE_APPROVAL_ACTIONS = new Set(["approved", "rejected"]);

/** Legacy pre-workflow value: treat stored/requested "final" as approved. */
export function normalizeQuoteStatus(s: string): string {
  return s === "final" ? "approved" : s;
}

/**
 * Statuses a customer may see (assigned or via share token). "approved" is
 * NOT visible — publication happens only via the explicit "sent" handoff.
 * Legacy "final" quotes stay visible: their share links pre-date the workflow
 * and were published under the old final-only rule.
 */
export const CUSTOMER_VISIBLE_QUOTE_STATUSES = new Set(["final", "sent", "viewed", "accepted"]);

/** Selling prices may only be overridden before approval is granted. */
export const OVERRIDABLE_QUOTE_STATUSES = new Set(["draft", "pending_approval", "rejected"]);

/** Whole days a quote stays valid after approval. */
export const APPROVAL_VALIDITY_DAYS = 30;

export interface QuoteTransitionInput {
  /** Current status, already normalised via {@link normalizeQuoteStatus}. */
  from: string;
  /** Requested status, already normalised — or undefined when not changing it. */
  to: string | undefined;
  userId: string | null;
  createdBy: string | null | undefined;
}

export type QuoteTransitionResult =
  | {
      ok: true;
      isTransition: boolean;
      /** Status patch (only `status`) to merge into the quote update. */
      patch: Record<string, unknown>;
      requiresAdmin: boolean;
      creatorConflict: boolean;
    }
  | { ok: false; statusCode: number; message: string };

/**
 * Validate a requested status transition and report whether it needs an admin
 * gate. Does NOT perform the role check, sample the clock, or do any I/O.
 *
 * Timing fields (approvedBy/approvedAt/validUntil) and the expired send/accept
 * guard are deliberately NOT handled here: the route handler samples the clock
 * AFTER the role gate, so the caller must pass time via
 * {@link buildTransitionTimingPatch} once `requiresAdmin` has been enforced.
 */
export function computeQuoteTransition(input: QuoteTransitionInput): QuoteTransitionResult {
  const { from, to, userId, createdBy } = input;
  const patch: Record<string, unknown> = {};
  const isTransition = to !== undefined && to !== from;
  if (to !== undefined) patch.status = to;
  if (!isTransition) {
    return { ok: true, isTransition, patch, requiresAdmin: false, creatorConflict: false };
  }

  const allowed = QUOTE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to!)) {
    return { ok: false, statusCode: 409, message: `Cannot move a ${from} quote to ${to}` };
  }

  const requiresAdmin = QUOTE_APPROVAL_ACTIONS.has(to!);
  const creatorConflict = requiresAdmin && !!createdBy && createdBy === userId;
  return { ok: true, isTransition, patch, requiresAdmin, creatorConflict };
}

export interface TransitionTimingInput {
  /**
   * Whether the request actually changes status (`to !== from`). When false the
   * update is a no-op and MUST NOT touch approval fields or the expiry guard —
   * mirroring the original handler, which wrapped all of this in `if (isTransition)`.
   */
  isTransition: boolean;
  to: string | undefined;
  userId: string | null;
  validUntil: Date | null | undefined;
  /**
   * Reference instant. Must be sampled AFTER the role gate — the original
   * handler stamped approval time only once authorization had passed.
   */
  now: Date;
}

export type TransitionTimingResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; statusCode: number; message: string };

/**
 * Build the approval timestamp fields (approvedBy/approvedAt/validUntil) or the
 * draft-reset fields, and enforce the expired send/accept guard — all from a
 * clock sampled after the role gate, matching the original handler ordering.
 * Returns an empty patch for a no-op update so a re-submitted status can never
 * re-stamp approval or trip the expiry guard.
 */
export function buildTransitionTimingPatch(input: TransitionTimingInput): TransitionTimingResult {
  const { isTransition, to, userId, validUntil, now } = input;
  const patch: Record<string, unknown> = {};
  if (!isTransition) return { ok: true, patch };
  if (to === "approved") {
    patch.approvedBy = userId;
    patch.approvedAt = now;
    // Set APPROVAL_VALIDITY_DAYS-day expiry from approval time.
    const expiry = new Date(now.getTime());
    expiry.setDate(expiry.getDate() + APPROVAL_VALIDITY_DAYS);
    patch.validUntil = expiry;
  }
  if (to === "draft") {
    patch.approvedBy = null;
    patch.approvedAt = null;
    patch.validUntil = null;
  }
  // Block sending/accepting an expired quote — must be re-approved first.
  if ((to === "sent" || to === "accepted") && validUntil && validUntil < now) {
    return { ok: false, statusCode: 409, message: "Quote has expired; move it back to draft and re-approve before sending" };
  }
  return { ok: true, patch };
}

/** The customer "first look" transition: a published quote becomes viewed. */
export const VIEWED_TRANSITION_FROM = "sent";
export const VIEWED_TRANSITION_TO = "viewed";

export interface ViewedAuditInput {
  quoteId: string;
  /** Set for authenticated customer views; omitted for anonymous share links. */
  changedBy?: string | null;
  /** Set for share-link views; omitted for authenticated customer views. */
  note?: string | null;
}

export interface ViewedAudit {
  entityType: "pricing_quote";
  entityId: string;
  action: "status_changed";
  previousValue: "sent";
  newValue: "viewed";
  changedBy?: string;
  note?: string;
}

/**
 * Audit payload for the sent→viewed transition. Pure: the caller performs the
 * CAS update and writes the log. `changedBy`/`note` are only included when
 * provided, so authenticated and share-link views keep their distinct records.
 */
export function buildViewedAudit(input: ViewedAuditInput): ViewedAudit {
  const audit: ViewedAudit = {
    entityType: "pricing_quote",
    entityId: input.quoteId,
    action: "status_changed",
    previousValue: VIEWED_TRANSITION_FROM,
    newValue: VIEWED_TRANSITION_TO,
  };
  if (input.changedBy) audit.changedBy = input.changedBy;
  if (input.note) audit.note = input.note;
  return audit;
}

export interface CustomerQuoteInput {
  id: string;
  tourId: string | null;
  departureId: string | null;
  paxCount: number | null;
  nights: number | null;
  currency: string | null;
  status: string;
}

export interface CustomerQuoteLineItem {
  hotelChoice: number;
  hotelName: string | null;
  occupancy: string;
  sellingPrice: string;
}

export interface CustomerHotelChoice {
  hotelChoice: number;
  hotelName: string | null;
  prices: Record<string, string>;
}

export interface CustomerQuoteView {
  id: string;
  tourId: string | null;
  departureId: string | null;
  paxCount: number | null;
  nights: number | null;
  currency: string | null;
  status: string;
  hotelChoices: CustomerHotelChoice[];
}

/**
 * Shape a quote for customer eyes: ONLY final selling prices per hotel choice &
 * occupancy. Costs, margins, multiplication factors and internal line-item
 * fields MUST never appear here — this projection is an allow-list, so adding a
 * DB column cannot leak it to customers. Pure; the caller supplies line items.
 */
export function buildCustomerQuoteView(
  quote: CustomerQuoteInput,
  lineItems: CustomerQuoteLineItem[],
): CustomerQuoteView {
  const hotelChoices: Record<number, CustomerHotelChoice> = {};
  for (const li of lineItems) {
    hotelChoices[li.hotelChoice] ??= { hotelChoice: li.hotelChoice, hotelName: li.hotelName, prices: {} };
    hotelChoices[li.hotelChoice].prices[li.occupancy] = li.sellingPrice;
  }
  return {
    id: quote.id,
    tourId: quote.tourId,
    departureId: quote.departureId,
    paxCount: quote.paxCount,
    nights: quote.nights,
    currency: quote.currency,
    status: quote.status,
    hotelChoices: Object.values(hotelChoices).sort((a, b) => a.hotelChoice - b.hotelChoice),
  };
}

/** Next version for a quote, given the current maximum stored version. */
export function nextSnapshotVersionFrom(maxVersion: string | number | null | undefined): number {
  const n = parseInt(String(maxVersion ?? "0"), 10);
  return (Number.isFinite(n) ? n : 0) + 1;
}

export interface BuildApprovalSnapshotParams {
  quote: Record<string, any>;
  lineItems: Record<string, any>[];
  /** `calculationMeta._computeInputs` captured at compute time, or null. */
  computeInputs?: Record<string, any> | null;
  version: number;
  createdBy: string | null;
}

export interface ApprovalSnapshotValues {
  quoteId: string;
  version: number;
  calculationInput: unknown;
  calculationOutput: unknown;
  rulesUsed: unknown;
  reason: string;
  createdBy: string | null;
}

/**
 * Build the immutable approval snapshot row values. Pure — the caller inserts
 * the result inside the approval transaction.
 */
export function buildApprovalSnapshot(params: BuildApprovalSnapshotParams): ApprovalSnapshotValues {
  const { quote: q, lineItems, computeInputs, version, createdBy } = params;
  return {
    quoteId: q.id,
    version,
    // calculationInput: exact inputs used in computeQuote at creation time,
    // plus quote-header values as a fallback for legacy quotes created before
    // _computeInputs was recorded.
    calculationInput: computeInputs ?? {
      paxCount: q.paxCount,
      nights: q.nights,
      currency: q.currency,
      components: {
        transportationShare: q.transportationShare,
        guideDriverShare: q.guideDriverShare,
        sightseeingShare: q.sightseeingShare,
        airfarePerPerson: q.airfarePerPerson,
      },
      note: "legacy_quote_inputs_unavailable",
    },
    // calculationOutput: the committed line items at approval time, including
    // any price overrides applied during the review cycle.
    calculationOutput: {
      baseCostPerPerson: q.baseCostPerPerson,
      totalGroupCost: q.totalGroupCost,
      freeAdjustmentFactor: q.freeAdjustmentFactor,
      marginType: q.marginType,
      marginValue: q.marginValue,
      lineItems: lineItems.map((li) => ({
        id: li.id,
        hotelChoice: li.hotelChoice,
        hotelId: li.hotelId,
        hotelName: li.hotelName,
        occupancy: li.occupancy,
        hotelNightlyRate: li.hotelNightlyRate,
        hotelCostTotal: li.hotelCostTotal,
        baseCost: li.baseCost,
        marginAmount: li.marginAmount,
        freeAdjustmentAmount: li.freeAdjustmentAmount,
        adjustmentItems: li.adjustmentItems,
        sellingPrice: li.sellingPrice,
        sellingPriceExact: li.sellingPriceExact,
      })),
    },
    // rulesUsed: the rule and adjustment rules frozen at creation time (from
    // _computeInputs) so reproduction is possible even if rules are later
    // edited or deleted.
    rulesUsed: computeInputs
      ? { pricingRule: computeInputs.rule ?? null, adjustmentRules: computeInputs.adjustmentRules ?? [] }
      : { note: "legacy_quote_rules_unavailable" },
    reason: version > 1 ? "re_approved" : "approved",
    createdBy,
  };
}
