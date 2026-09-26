import { describe, it, expect, vi, beforeEach } from "vitest";
import { stripeProvider } from "../stripeProvider";

describe("stripe provider unit tests", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "rk_test_dummy_key_for_testing";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  });

  it("has the name 'stripe'", () => {
    expect(stripeProvider.name).toBe("stripe");
  });

  it("throws if STRIPE_SECRET_KEY is missing when creating intent", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    await expect(
      stripeProvider.createIntent({
        amount: 1000,
        currency: "USD",
        bookingId: "bk_123",
        customerId: "usr_456",
      })
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });

  it("throws if STRIPE_WEBHOOK_SECRET is missing during verifyWebhook", () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() =>
      stripeProvider.verifyWebhook(Buffer.from("{}"), "t=123,v1=abc")
    ).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});
