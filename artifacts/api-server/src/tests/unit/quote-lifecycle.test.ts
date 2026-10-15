import { describe, it, expect } from "vitest";
import {
  QUOTE_TRANSITIONS,
  normalizeQuoteStatus,
  computeQuoteTransition,
  buildTransitionTimingPatch,
  nextSnapshotVersionFrom,
  buildApprovalSnapshot,
  buildViewedAudit,
  buildCustomerQuoteView,
  VIEWED_TRANSITION_FROM,
  VIEWED_TRANSITION_TO,
  APPROVAL_VALIDITY_DAYS,
} from "../../services/quote-lifecycle";

describe("normalizeQuoteStatus", () => {
  it("maps the legacy 'final' value to 'approved'", () => {
    expect(normalizeQuoteStatus("final")).toBe("approved");
  });

  it("passes every other status through unchanged", () => {
    for (const s of ["draft", "pending_approval", "approved", "sent", "viewed", "accepted", "expired", "cancelled", "archived"]) {
      expect(normalizeQuoteStatus(s)).toBe(s);
    }
  });
});

describe("computeQuoteTransition — validation and admin flags", () => {
  it("treats an omitted target status as a non-transition", () => {
    const r = computeQuoteTransition({ from: "draft", to: undefined, userId: "u1", createdBy: "u2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.isTransition).toBe(false);
    expect(r.requiresAdmin).toBe(false);
    expect(r.patch).not.toHaveProperty("status");
  });

  it("treats a same-status request as a non-transition but still sets the status", () => {
    const r = computeQuoteTransition({ from: "draft", to: "draft", userId: "u1", createdBy: "u2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.isTransition).toBe(false);
    expect(r.patch.status).toBe("draft");
  });

  it("normalises a legacy 'final' request against an already-approved quote as a no-op", () => {
    // The handler normalises the requested status before calling the helper.
    const to = normalizeQuoteStatus("final");
    const r = computeQuoteTransition({ from: "approved", to, userId: "u1", createdBy: "u2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.isTransition).toBe(false);
    expect(r.patch.status).toBe("approved");
  });

  it("rejects a transition not present in the map with 409", () => {
    const r = computeQuoteTransition({ from: "draft", to: "accepted", userId: "u1", createdBy: "u2" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.statusCode).toBe(409);
    expect(r.message).toContain("draft");
  });

  it("treats terminal 'archived' as having no outgoing transitions", () => {
    expect(QUOTE_TRANSITIONS.archived).toEqual([]);
  });

  it("marks approve/reject as admin-required", () => {
    for (const to of ["approved", "rejected"]) {
      const r = computeQuoteTransition({ from: "pending_approval", to, userId: "admin", createdBy: "other" });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.isTransition).toBe(true);
      expect(r.requiresAdmin).toBe(true);
    }
  });

  it("does not require admin for ordinary transitions", () => {
    const r = computeQuoteTransition({ from: "draft", to: "pending_approval", userId: "u1", createdBy: "u1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.requiresAdmin).toBe(false);
    expect(r.creatorConflict).toBe(false);
  });

  it("flags creator conflict when the actor is the quote author", () => {
    const r = computeQuoteTransition({ from: "pending_approval", to: "approved", userId: "author", createdBy: "author" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.requiresAdmin).toBe(true);
    expect(r.creatorConflict).toBe(true);
  });

  it("does not flag creator conflict for a different approver", () => {
    const r = computeQuoteTransition({ from: "pending_approval", to: "approved", userId: "admin", createdBy: "author" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.creatorConflict).toBe(false);
  });

  it("carries only the status field in the decision patch (timing is separate)", () => {
    const r = computeQuoteTransition({ from: "draft", to: "pending_approval", userId: "u1", createdBy: "u2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.patch)).toEqual(["status"]);
  });
});

describe("buildTransitionTimingPatch", () => {
  const now = new Date("2026-02-01T00:00:00Z");

  it("stamps approver, approval time and a +30-day expiry on approval", () => {
    const r = buildTransitionTimingPatch({ isTransition: true, to: "approved", userId: "admin", validUntil: null, now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch.approvedBy).toBe("admin");
    expect(r.patch.approvedAt).toBe(now);
    const expected = new Date(now.getTime());
    expected.setDate(expected.getDate() + APPROVAL_VALIDITY_DAYS);
    expect(r.patch.validUntil).toEqual(expected);
  });

  it("clears approval fields when sending back to draft", () => {
    const r = buildTransitionTimingPatch({ isTransition: true, to: "draft", userId: "u1", validUntil: new Date("2030-01-01T00:00:00Z"), now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch.approvedBy).toBeNull();
    expect(r.patch.approvedAt).toBeNull();
    expect(r.patch.validUntil).toBeNull();
  });

  it("returns an empty patch for statuses that need no timing fields", () => {
    const r = buildTransitionTimingPatch({ isTransition: true, to: "viewed", userId: "u1", validUntil: null, now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch).toEqual({});
  });

  it("blocks sending a lapsed quote with 409", () => {
    const r = buildTransitionTimingPatch({ isTransition: true, to: "sent", userId: "u1", validUntil: new Date("2026-01-01T00:00:00Z"), now });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.statusCode).toBe(409);
    expect(r.message.toLowerCase()).toContain("expired");
  });

  it("blocks accepting a lapsed quote with 409", () => {
    const r = buildTransitionTimingPatch({ isTransition: true, to: "accepted", userId: "u1", validUntil: new Date("2026-01-01T00:00:00Z"), now });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.statusCode).toBe(409);
  });

  it("allows sending a still-valid quote", () => {
    const r = buildTransitionTimingPatch({ isTransition: true, to: "sent", userId: "u1", validUntil: new Date("2026-03-01T00:00:00Z"), now });
    expect(r.ok).toBe(true);
  });

  it("allows sending when no expiry was ever recorded", () => {
    const r = buildTransitionTimingPatch({ isTransition: true, to: "sent", userId: "u1", validUntil: null, now });
    expect(r.ok).toBe(true);
  });

  it("treats the expiry boundary as inclusive (validUntil === now is allowed)", () => {
    const r = buildTransitionTimingPatch({ isTransition: true, to: "sent", userId: "u1", validUntil: new Date(now.getTime()), now });
    expect(r.ok).toBe(true);
  });

  it("blocks one millisecond past expiry", () => {
    const r = buildTransitionTimingPatch({ isTransition: true, to: "accepted", userId: "u1", validUntil: new Date(now.getTime() - 1), now });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.statusCode).toBe(409);
  });

  // Regression: a no-op update (to === from) must not touch lifecycle fields,
  // matching the original `if (isTransition)` guard around all timing logic.
  it("does nothing for a no-op approved update", () => {
    const r = buildTransitionTimingPatch({ isTransition: false, to: "approved", userId: "admin", validUntil: null, now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch).toEqual({});
  });

  it("does nothing for a no-op draft update (no approval clear)", () => {
    const r = buildTransitionTimingPatch({ isTransition: false, to: "draft", userId: "u1", validUntil: new Date("2030-01-01T00:00:00Z"), now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch).toEqual({});
  });

  it("does not trip the expiry guard on a no-op sent update", () => {
    const r = buildTransitionTimingPatch({ isTransition: false, to: "sent", userId: "u1", validUntil: new Date("2026-01-01T00:00:00Z"), now });
    expect(r.ok).toBe(true);
  });
});

describe("nextSnapshotVersionFrom", () => {
  it("starts at 1 when no snapshot exists", () => {
    expect(nextSnapshotVersionFrom(null)).toBe(1);
    expect(nextSnapshotVersionFrom(undefined)).toBe(1);
    expect(nextSnapshotVersionFrom("0")).toBe(1);
  });

  it("increments the current maximum", () => {
    expect(nextSnapshotVersionFrom("1")).toBe(2);
    expect(nextSnapshotVersionFrom("3")).toBe(4);
    expect(nextSnapshotVersionFrom(7)).toBe(8);
  });

  it("falls back to 1 on an unparsable maximum", () => {
    expect(nextSnapshotVersionFrom("abc")).toBe(1);
  });
});

describe("buildViewedAudit", () => {
  it("exposes the sent→viewed transition constants", () => {
    expect(VIEWED_TRANSITION_FROM).toBe("sent");
    expect(VIEWED_TRANSITION_TO).toBe("viewed");
  });

  it("builds the shared base record", () => {
    const audit = buildViewedAudit({ quoteId: "q1" });
    expect(audit).toEqual({
      entityType: "pricing_quote",
      entityId: "q1",
      action: "status_changed",
      previousValue: "sent",
      newValue: "viewed",
    });
  });

  it("includes changedBy (and no note) for an authenticated customer view", () => {
    const audit = buildViewedAudit({ quoteId: "q1", changedBy: "user-1" });
    expect(audit.changedBy).toBe("user-1");
    expect(audit).not.toHaveProperty("note");
  });

  it("includes the note (and no changedBy) for an anonymous share link", () => {
    const audit = buildViewedAudit({ quoteId: "q1", note: "Viewed via share link" });
    expect(audit.note).toBe("Viewed via share link");
    expect(audit).not.toHaveProperty("changedBy");
  });

  it("omits falsy optional context", () => {
    const audit = buildViewedAudit({ quoteId: "q1", changedBy: null, note: null });
    expect(audit).not.toHaveProperty("changedBy");
    expect(audit).not.toHaveProperty("note");
  });
});

describe("buildCustomerQuoteView", () => {
  // Full rows carrying internal fields; the projection must be an allow-list.
  const quoteRow = {
    id: "q1", tourId: "t1", departureId: "d1", paxCount: 4, nights: 3,
    currency: "IDR", status: "sent",
    baseCost: "123456", marginAmount: "7000", marginType: "percent", marginValue: "12",
    totalCost: "999", createdBy: "u1", shareToken: "secret-token", organizationId: "org1",
  };
  const liRows = [
    {
      id: "li2", quoteId: "q1", hotelChoice: 2, hotelName: "B", occupancy: "triple",
      sellingPrice: "3000", baseCost: "2000", marginAmount: "1000",
      hotelNightlyRate: "120", freeAdjustmentAmount: "5",
    },
    {
      id: "li1", quoteId: "q1", hotelChoice: 1, hotelName: "A", occupancy: "single",
      sellingPrice: "1000", baseCost: "700", marginAmount: "300",
    },
    {
      id: "li3", quoteId: "q1", hotelChoice: 1, hotelName: "A", occupancy: "double",
      sellingPrice: "1800", baseCost: "1200", marginAmount: "600",
    },
  ];

  it("projects exactly the allow-listed top-level fields", () => {
    const view = buildCustomerQuoteView(quoteRow, liRows);
    expect(Object.keys(view).sort()).toEqual(
      ["currency", "departureId", "hotelChoices", "id", "nights", "paxCount", "status", "tourId"],
    );
    expect(view.id).toBe("q1");
    expect(view.status).toBe("sent");
  });

  it("never serializes internal cost/margin/token fields", () => {
    const serialized = JSON.stringify(buildCustomerQuoteView(quoteRow, liRows));
    for (const leak of [
      "baseCost", "marginAmount", "marginType", "marginValue", "totalCost",
      "createdBy", "shareToken", "organizationId", "hotelNightlyRate",
      "freeAdjustmentAmount",
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("groups occupancies per hotel choice, sorted ascending by hotelChoice", () => {
    const view = buildCustomerQuoteView(quoteRow, liRows);
    expect(view.hotelChoices).toEqual([
      { hotelChoice: 1, hotelName: "A", prices: { single: "1000", double: "1800" } },
      { hotelChoice: 2, hotelName: "B", prices: { triple: "3000" } },
    ]);
  });

  it("exposes only sellingPrice under each occupancy", () => {
    const view = buildCustomerQuoteView(quoteRow, liRows);
    for (const hc of view.hotelChoices) {
      for (const price of Object.values(hc.prices)) expect(typeof price).toBe("string");
    }
    expect(view.hotelChoices[0].prices).toEqual({ single: "1000", double: "1800" });
  });

  it("handles a quote with no line items", () => {
    const view = buildCustomerQuoteView({ ...quoteRow, departureId: null }, []);
    expect(view.hotelChoices).toEqual([]);
    expect(view.departureId).toBeNull();
  });
});

describe("buildApprovalSnapshot", () => {
  const quote = {
    id: "q1",
    paxCount: 4,
    nights: 3,
    currency: "IDR",
    transportationShare: "100",
    guideDriverShare: "50",
    sightseeingShare: "25",
    airfarePerPerson: "0",
    baseCostPerPerson: "1000",
    totalGroupCost: "4000",
    freeAdjustmentFactor: "1.1",
    marginType: "percent",
    marginValue: "15",
  };
  const lineItems = [
    {
      id: "li1", hotelChoice: 1, hotelId: "h1", hotelName: "Grand", occupancy: "triple",
      hotelNightlyRate: "300", hotelCostTotal: "900", baseCost: "1200", marginAmount: "180",
      freeAdjustmentAmount: "0", adjustmentItems: [], sellingPrice: "1380", sellingPriceExact: "1380.00",
    },
  ];

  it("labels the first snapshot as 'approved' and re-approvals as 're_approved'", () => {
    const first = buildApprovalSnapshot({ quote, lineItems, computeInputs: null, version: 1, createdBy: "admin" });
    expect(first.reason).toBe("approved");
    const second = buildApprovalSnapshot({ quote, lineItems, computeInputs: null, version: 2, createdBy: "admin" });
    expect(second.reason).toBe("re_approved");
  });

  it("records the quote id, version and creator", () => {
    const snap = buildApprovalSnapshot({ quote, lineItems, computeInputs: null, version: 4, createdBy: "admin" });
    expect(snap.quoteId).toBe("q1");
    expect(snap.version).toBe(4);
    expect(snap.createdBy).toBe("admin");
  });

  it("maps the committed line items into calculationOutput", () => {
    const snap = buildApprovalSnapshot({ quote, lineItems, computeInputs: null, version: 1, createdBy: "admin" });
    const output = snap.calculationOutput as any;
    expect(output.totalGroupCost).toBe("4000");
    expect(output.lineItems).toHaveLength(1);
    expect(output.lineItems[0]).toMatchObject({ id: "li1", occupancy: "triple", sellingPrice: "1380", sellingPriceExact: "1380.00" });
  });

  it("carries every expected line-item field", () => {
    const snap = buildApprovalSnapshot({ quote, lineItems, computeInputs: null, version: 1, createdBy: "admin" });
    const li = (snap.calculationOutput as any).lineItems[0];
    expect(Object.keys(li).sort()).toEqual([
      "adjustmentItems", "baseCost", "freeAdjustmentAmount", "hotelChoice", "hotelCostTotal",
      "hotelId", "hotelName", "hotelNightlyRate", "id", "marginAmount", "occupancy",
      "sellingPrice", "sellingPriceExact",
    ]);
  });

  it("falls back to quote-header inputs when _computeInputs is unavailable", () => {
    const snap = buildApprovalSnapshot({ quote, lineItems, computeInputs: null, version: 1, createdBy: "admin" });
    const input = snap.calculationInput as any;
    expect(input.note).toBe("legacy_quote_inputs_unavailable");
    expect(input.paxCount).toBe(4);
    expect(input.components.transportationShare).toBe("100");
    expect((snap.rulesUsed as any).note).toBe("legacy_quote_rules_unavailable");
  });

  it("freezes the exact compute inputs and rules when available", () => {
    const computeInputs = { rule: { id: "r1" }, adjustmentRules: [{ id: "a1" }], paxCount: 4 };
    const snap = buildApprovalSnapshot({ quote, lineItems, computeInputs, version: 1, createdBy: "admin" });
    expect(snap.calculationInput).toBe(computeInputs);
    expect(snap.rulesUsed).toEqual({ pricingRule: { id: "r1" }, adjustmentRules: [{ id: "a1" }] });
  });

  it("defaults missing rules to null/empty when compute inputs lack them", () => {
    const snap = buildApprovalSnapshot({ quote, lineItems, computeInputs: {}, version: 1, createdBy: "admin" });
    expect(snap.rulesUsed).toEqual({ pricingRule: null, adjustmentRules: [] });
  });
});
