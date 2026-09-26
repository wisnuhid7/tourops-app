import Stripe from "stripe";
import { logger } from "../logger";
import type {
  ConfirmInput,
  ConfirmResult,
  CreateIntentInput,
  PaymentIntentResult,
  PaymentProvider,
  PaymentWebhookEvent,
  RefundInput,
  RefundResult,
  IntentStatus,
} from "./provider";

const PROVIDER_NAME = "stripe";

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not configured");
  }
  return new Stripe(key);
}

function mapStripeStatus(status: Stripe.PaymentIntent.Status): IntentStatus {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "processing":
      return "processing";
    case "canceled":
      return "canceled";
    case "requires_action":
    case "requires_capture":
    case "requires_confirmation":
    case "requires_payment_method":
    default:
      return "requires_confirmation";
  }
}

export const stripeProvider: PaymentProvider = {
  name: PROVIDER_NAME,

  async createIntent(input: CreateIntentInput): Promise<PaymentIntentResult> {
    const stripe = getStripeClient();
    try {
      const pi = await stripe.paymentIntents.create({
        amount: input.amount,
        currency: input.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          bookingId: input.bookingId,
          customerId: input.customerId,
          ...(input.metadata ?? {}),
        },
      });

      return {
        intentId: pi.id,
        clientSecret: pi.client_secret || "",
        status: mapStripeStatus(pi.status),
      };
    } catch (err: any) {
      logger.error({ err, input }, "stripe createIntent failed");
      throw err;
    }
  },

  async confirmIntent(input: ConfirmInput): Promise<ConfirmResult> {
    const stripe = getStripeClient();
    try {
      let pi = await stripe.paymentIntents.retrieve(input.intentId);

      // If client provided a payment method ID or test instrument server-side
      if (input.instrument && (pi.status === "requires_confirmation" || pi.status === "requires_payment_method")) {
        pi = await stripe.paymentIntents.confirm(input.intentId, {
          payment_method: input.instrument,
        });
      }

      const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
      return {
        status: mapStripeStatus(pi.status),
        transactionId: chargeId || pi.id,
        failureReason: pi.last_payment_error?.message,
      };
    } catch (err: any) {
      logger.error({ err, input }, "stripe confirmIntent failed");
      return {
        status: "failed",
        failureReason: err.message,
      };
    }
  },

  async createRefund(input: RefundInput): Promise<RefundResult> {
    const stripe = getStripeClient();
    try {
      const refundParams: Stripe.RefundCreateParams = {
        amount: input.amount,
        metadata: {
          refundId: input.refundId,
        },
      };

      if (input.transactionId.startsWith("pi_")) {
        refundParams.payment_intent = input.transactionId;
      } else if (input.transactionId.startsWith("ch_") || input.transactionId.startsWith("py_")) {
        refundParams.charge = input.transactionId;
      } else {
        refundParams.payment_intent = input.transactionId;
      }

      const validReasons = ["duplicate", "fraudulent", "requested_by_customer"];
      if (validReasons.includes(input.reason)) {
        refundParams.reason = input.reason as Stripe.RefundCreateParams.Reason;
      }

      const refund = await stripe.refunds.create(refundParams);
      return {
        status: refund.status === "succeeded" ? "succeeded" : refund.status === "failed" ? "failed" : "pending",
        providerRefundId: refund.id,
        failureReason: refund.failure_reason,
      };
    } catch (err: any) {
      logger.error({ err, input }, "stripe createRefund failed");
      return {
        status: "failed",
        providerRefundId: "",
        failureReason: err.message,
      };
    }
  },

  verifyWebhook(rawBody: Buffer, signature: string): PaymentWebhookEvent {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("STRIPE_WEBHOOK_SECRET must be set for Stripe webhook verification");
    }
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

    let intentId: string | undefined;
    let transactionId: string | undefined;
    let providerRefundId: string | undefined;
    let refundId: string | undefined;
    let amount: number | undefined;
    let failureReason: string | undefined;

    const obj = event.data.object as any;

    if (event.type.startsWith("payment_intent.")) {
      intentId = obj.id;
      transactionId = typeof obj.latest_charge === "string" ? obj.latest_charge : obj.latest_charge?.id;
      amount = obj.amount;
      failureReason = obj.last_payment_error?.message;
    } else if (event.type.startsWith("charge.refunded")) {
      transactionId = obj.id;
      intentId = obj.payment_intent;
      amount = obj.amount_refunded;
    } else if (event.type.startsWith("refund.")) {
      providerRefundId = obj.id;
      transactionId = obj.charge;
      intentId = obj.payment_intent;
      refundId = obj.metadata?.refundId;
      amount = obj.amount;
      failureReason = obj.failure_reason;
    }

    return {
      id: event.id,
      type: event.type as any,
      intentId,
      transactionId,
      providerRefundId,
      refundId,
      amount,
      failureReason,
      data: obj,
    };
  },
};
