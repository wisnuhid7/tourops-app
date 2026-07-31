import { describe, it, expect, beforeAll } from "vitest";
import { offlineProvider, signWebhookPayload } from "../offlineProvider";

beforeAll(() => {
  process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || process.env.SESSION_SECRET || "test-secret";
  delete process.env.PORT; // prevent the provider from delivering real webhooks in tests
});

describe("offline provider webhook signatures", () => {
  const event = { id: "oevt_test", type: "payment_intent.succeeded" as const, intentId: "oti_x" };
  const body = JSON.stringify(event);

  it("accepts a correctly signed payload", () => {
    const sig = signWebhookPayload(body, Math.floor(Date.now() / 1000));
    const parsed = offlineProvider.verifyWebhook(Buffer.from(body), sig);
    expect(parsed.id).toBe("oevt_test");
    expect(parsed.type).toBe("payment_intent.succeeded");
  });

  it("rejects a tampered body", () => {
    const sig = signWebhookPayload(body, Math.floor(Date.now() / 1000));
    const tampered = Buffer.from(JSON.stringify({ ...event, intentId: "oti_evil" }));
    expect(() => offlineProvider.verifyWebhook(tampered, sig)).toThrow(/Invalid webhook signature/);
  });

  it("rejects a stale timestamp (replay protection)", () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const sig = signWebhookPayload(body, old);
    expect(() => offlineProvider.verifyWebhook(Buffer.from(body), sig)).toThrow(/timestamp/);
  });

  it("rejects malformed signatures", () => {
    expect(() => offlineProvider.verifyWebhook(Buffer.from(body), "garbage")).toThrow();
  });
});

describe("offline provider intents", () => {
  it("fails with test card ...0002", async () => {
    const intent = await offlineProvider.createIntent({ amount: 1000, currency: "USD", bookingId: "b1", customerId: "c1" });
    const res = await offlineProvider.confirmIntent({ intentId: intent.intentId, instrument: "4000000000000002" });
    expect(res.status).toBe("failed");
    expect(res.failureReason).toBe("card_declined");
  });

  it("succeeds with a normal test card", async () => {
    const intent = await offlineProvider.createIntent({ amount: 1000, currency: "USD", bookingId: "b1", customerId: "c1" });
    const res = await offlineProvider.confirmIntent({ intentId: intent.intentId, instrument: "4242424242424242" });
    expect(res.status).toBe("succeeded");
    expect(res.transactionId).toMatch(/^otx_/);
  });

  it("returns processing for test card ...0003", async () => {
    const intent = await offlineProvider.createIntent({ amount: 1000, currency: "USD", bookingId: "b1", customerId: "c1" });
    const res = await offlineProvider.confirmIntent({ intentId: intent.intentId, instrument: "4000000000000003" });
    expect(res.status).toBe("processing");
  });
});
