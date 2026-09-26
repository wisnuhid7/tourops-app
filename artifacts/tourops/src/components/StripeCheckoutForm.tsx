import { useState } from "react";
import { useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest } from "@/lib/queryClient";

interface StripeCheckoutFormProps {
  bookingId: string;
  paymentId: string;
  totalCents: number;
  currency: string;
  onSuccess: () => void;
  onProcessing: () => void;
  onFailed: (reason: string) => void;
}

const fmt = (cents: number, currency: string) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export function StripeCheckoutForm({
  bookingId,
  paymentId,
  totalCents,
  currency,
  onSuccess,
  onProcessing,
  onFailed,
}: StripeCheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useLanguage();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (error) {
        const msg = error.message || t("payment_failed");
        setErrorMessage(msg);
        onFailed(msg);
        setIsSubmitting(false);
        return;
      }

      if (paymentIntent) {
        if (paymentIntent.status === "succeeded") {
          // Notify backend confirmation endpoint
          try {
            await apiRequest("POST", `/api/checkout/${bookingId}/confirm`, {
              paymentId,
              instrument: paymentIntent.id,
            });
          } catch (err) {
            // Webhook is the ultimate authority, so ignore confirm endpoint network blips
            console.warn("Server confirmation notice completed with:", err);
          }
          onSuccess();
        } else if (paymentIntent.status === "processing") {
          onProcessing();
        } else {
          const msg = t("payment_failed");
          setErrorMessage(msg);
          onFailed(msg);
        }
      }
    } catch (err: any) {
      const msg = err.message || t("payment_failed");
      setErrorMessage(msg);
      onFailed(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMessage && (
        <div
          className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          data-testid="text-stripe-error"
        >
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      <Button
        type="submit"
        className="w-full h-12 text-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
        disabled={!stripe || !elements || isSubmitting}
        data-testid="button-confirm-stripe-payment"
      >
        {isSubmitting ? (
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
        ) : (
          <ShieldCheck className="h-5 w-5 mr-2" />
        )}
        {isSubmitting
          ? t("payment_processing_title")
          : `${t("complete_payment")} · ${fmt(totalCents, currency)}`}
      </Button>

      <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
        <span>256-bit SSL encrypted • Powered by Stripe</span>
      </div>
    </form>
  );
}
