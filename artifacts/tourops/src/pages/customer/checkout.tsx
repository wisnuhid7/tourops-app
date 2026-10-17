import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage, localizeScheduleLabel } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CreditCard, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { StripeCheckoutForm } from "@/components/StripeCheckoutForm";
import { LanguageSwitcher } from "@/components/language-switcher";

interface PaymentScheduleItem {
  id: string;
  installmentNumber: number;
  label: string;
  percentage: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
}

interface CheckoutData {
  booking: { id: string; bookingCode: string | null; status: string | null; tourId: string };
  summary: { subtotal: number; taxes: number; fees: number; discount: number; total: number; currency: string; taxRate: number };
  schedules?: PaymentScheduleItem[];
  alreadyPaid: number;
  fullyPaid: boolean;
  openPayment: { id: string; status: string; amount: number; currency: string } | null;
}

interface CheckoutConfig {
  provider: string;
  publishableKey: string;
}

const fmt = (amt: number, currency: string) =>
  `$${Number(amt).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

let cachedStripePromise: Promise<Stripe | null> | null = null;
let cachedKey = "";

function getStripePromise(key: string) {
  if (!key) return null;
  if (!cachedStripePromise || cachedKey !== key) {
    cachedKey = key;
    cachedStripePromise = loadStripe(key);
  }
  return cachedStripePromise;
}

export default function Checkout() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { t, language } = useLanguage();
  const qc = useQueryClient();

  const [card, setCard] = useState("4242 4242 4242 4242");
  const [expiry, setExpiry] = useState("12/28");
  const [cvc, setCvc] = useState("123");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [isInitializingIntent, setIsInitializingIntent] = useState(false);
  const queryParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const urlInstallmentId = queryParams?.get("installmentId") || null;

  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string | null>(urlInstallmentId);
  const [phase, setPhase] = useState<"form" | "processing" | "success" | "failed">("form");
  const [failureReason, setFailureReason] = useState<string | null>(null);

  const { data: config } = useQuery<CheckoutConfig>({
    queryKey: ["/api/checkout/config"],
    queryFn: async () => (await apiRequest("GET", "/api/checkout/config")).json(),
  });

  const { data, isLoading, error } = useQuery<CheckoutData>({
    queryKey: ["/api/checkout", bookingId],
    queryFn: async () => (await apiRequest("GET", `/api/checkout/${bookingId}`)).json(),
    enabled: !!bookingId,
  });

  // Automatically select target installment if booking has installment schedules
  useEffect(() => {
    if (!data?.schedules || data.schedules.length === 0) return;

    if (urlInstallmentId) {
      const match = data.schedules.find((s) => s.id === urlInstallmentId);
      if (match && match.status !== "paid") {
        setSelectedInstallmentId(urlInstallmentId);
        return;
      }
    }

    if (!selectedInstallmentId) {
      const firstUnpaid = data.schedules.find(
        (s) => s.status !== "paid" && (s.amount - s.paidAmount) > 0
      );
      if (firstUnpaid) {
        setSelectedInstallmentId(firstUnpaid.id);
      }
    }
  }, [data?.schedules, urlInstallmentId, selectedInstallmentId]);

  const selectedSched = useMemo(() => {
    if (!data?.schedules || !selectedInstallmentId) return null;
    return data.schedules.find((s) => s.id === selectedInstallmentId) || null;
  }, [data?.schedules, selectedInstallmentId]);

  const currentPayableAmount = useMemo(() => {
    if (!data) return 0;
    if (selectedSched) {
      return Math.max(0, selectedSched.amount - selectedSched.paidAmount);
    }
    return Math.max(0, data.summary.total - data.alreadyPaid);
  }, [data, selectedSched]);

  const isStripe = config?.provider === "stripe" && !!config.publishableKey;
  const stripePromise = useMemo(() => {
    return isStripe && config?.publishableKey ? getStripePromise(config.publishableKey) : null;
  }, [isStripe, config?.publishableKey]);

  // For Stripe: automatically prepare PaymentIntent on mount or when installment selection changes
  useEffect(() => {
    if (!isStripe || !data || data.fullyPaid || !bookingId) return;

    setIsInitializingIntent(true);
    setStripeClientSecret(null);
    apiRequest("POST", `/api/checkout/${bookingId}/intent`, {
      installmentId: selectedInstallmentId || undefined,
    })
      .then((res) => res.json())
      .then((intent) => {
        if (intent.paymentId) setPaymentId(intent.paymentId);
        if (intent.clientSecret) setStripeClientSecret(intent.clientSecret);
      })
      .catch((err) => {
        console.error("Failed to initialize Stripe PaymentIntent:", err);
      })
      .finally(() => {
        setIsInitializingIntent(false);
      });
  }, [isStripe, data, bookingId, selectedInstallmentId]);

  // Session recovery: if an online payment is already processing, resume it.
  useEffect(() => {
    if (data?.openPayment && data.openPayment.status === "processing") {
      setPaymentId(data.openPayment.id);
      setPhase("processing");
    }
  }, [data?.openPayment]);

  // Poll while the provider settles asynchronously.
  const { data: polled } = useQuery<{ status: string; failureReason: string | null }>({
    queryKey: ["/api/checkout", bookingId, "payment", paymentId],
    queryFn: async () => (await apiRequest("GET", `/api/checkout/${bookingId}/payment/${paymentId}`)).json(),
    enabled: phase === "processing" && !!paymentId,
    refetchInterval: 2000,
  });
  useEffect(() => {
    if (!polled) return;
    if (polled.status === "paid") setPhase("success");
    else if (["failed", "canceled"].includes(polled.status)) {
      setFailureReason(polled.failureReason);
      setPhase("failed");
    }
  }, [polled]);

  const payMutation = useMutation({
    mutationFn: async () => {
      const intentRes = await apiRequest("POST", `/api/checkout/${bookingId}/intent`, {
        installmentId: selectedInstallmentId || undefined,
      });
      const intent = await intentRes.json();
      setPaymentId(intent.paymentId);
      const confirmRes = await apiRequest("POST", `/api/checkout/${bookingId}/confirm`, {
        paymentId: intent.paymentId,
        instrument: card,
      });
      return confirmRes.json() as Promise<{ status: string; failureReason: string | null }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/checkout", bookingId] });
      qc.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "payments"] });
      if (result.status === "paid") setPhase("success");
      else if (result.status === "processing") setPhase("processing");
      else {
        setFailureReason(result.failureReason);
        setPhase("failed");
      }
    },
    onError: (e: Error) => {
      setFailureReason(e.message);
      setPhase("failed");
    },
  });

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !data) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <p className="text-muted-foreground">{(error as Error)?.message || t("checkout_unavailable")}</p>
        <Link href="/my-bookings"><Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" />{t("back_to_bookings")}</Button></Link>
      </div>
    );
  }

  const { summary, booking } = data;

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/my-bookings/${booking.id}`}>
            <Button variant="ghost" size="icon" data-testid="button-back"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{t("secure_checkout")}</h1>
            <p className="text-sm text-muted-foreground">{t("tour_booking_prefix")} {booking.bookingCode}</p>
          </div>
        </div>
        <LanguageSwitcher />
      </div>

      {/* Detail Order Summary yang sesuai dengan apa yang dibayar */}
      {selectedSched ? (
        <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("order_summary")}</CardTitle>
              <Badge variant="secondary" className="text-xs font-semibold">
                {t("schedule_installment")} #{selectedSched.installmentNumber}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="p-3.5 bg-primary/5 rounded-lg border border-primary/15 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-sm text-primary">
                  {localizeScheduleLabel(selectedSched.label, selectedSched.installmentNumber, selectedSched.percentage, language)}
                </span>
                <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                  {selectedSched.percentage}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("schedule_due_date")}: {new Date(selectedSched.dueDate).toLocaleDateString()}
              </p>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("checkout_total_tour_package")}</span>
                <span>{fmt(summary.total, summary.currency)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>{t("checkout_already_paid_previously")}</span>
                <span className="text-emerald-600 font-medium">
                  {fmt(data.alreadyPaid, summary.currency)}
                </span>
              </div>
            </div>

            <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-3 font-bold text-base">
              <span>{t("checkout_amount_paying_now")}</span>
              <span className="text-primary text-lg" data-testid="text-total">
                {fmt(currentPayableAmount, summary.currency)}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("order_summary")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("subtotal")}</span><span data-testid="text-subtotal">{fmt(summary.subtotal, summary.currency)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("taxes")}{summary.taxRate ? ` (${summary.taxRate}%)` : ""}</span><span data-testid="text-taxes">{fmt(summary.taxes, summary.currency)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("service_fees")}</span><span data-testid="text-fees">{fmt(summary.fees, summary.currency)}</span></div>
            {summary.discount > 0 && (
              <div className="flex justify-between text-green-600"><span>{t("discount")}</span><span>-{fmt(summary.discount, summary.currency)}</span></div>
            )}
            <div className="flex justify-between border-t pt-2 font-bold text-base"><span>{t("total_label")}</span><span data-testid="text-total">{fmt(summary.total, summary.currency)}</span></div>
          </CardContent>
        </Card>
      )}

      {/* Tampilkan hanya cicilan nya saja ketika dibayar */}
      {data.schedules && data.schedules.length > 1 && !data.fullyPaid && phase !== "success" && (
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("checkout_installment_options")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("checkout_installment_select_hint")}</p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.schedules.map((sched) => {
              const remaining = Math.max(0, sched.amount - sched.paidAmount);
              const isPaid = sched.status === "paid" || remaining === 0;
              const isSelected = selectedInstallmentId === sched.id;
              return (
                <div
                  key={sched.id}
                  className={`p-3.5 rounded-lg border transition-all ${
                    isPaid
                      ? "opacity-50 bg-muted/30 cursor-not-allowed border-slate-200 dark:border-slate-800"
                      : isSelected
                      ? "border-primary bg-primary/5 cursor-pointer shadow-sm ring-1 ring-primary/20"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-muted/30 cursor-pointer"
                  }`}
                  onClick={() => {
                    if (!isPaid) setSelectedInstallmentId(sched.id);
                  }}
                >
                  <div className="flex justify-between items-center gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">
                          {t("schedule_installment")} #{sched.installmentNumber}: {localizeScheduleLabel(sched.label, sched.installmentNumber, sched.percentage, language)}
                        </p>
                        {isPaid ? (
                          <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                            {t("schedule_status_paid")}
                          </Badge>
                        ) : isSelected ? (
                          <Badge className="bg-primary text-xs">
                            {t("checkout_selected_badge")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {sched.percentage}%
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("schedule_due_date")}: {new Date(sched.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="font-bold text-sm shrink-0">
                      {fmt(remaining, summary.currency)}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {phase === "success" || data.fullyPaid ? (
        <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
            <h2 className="text-xl font-bold" data-testid="text-payment-success">{t("payment_successful_title")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("checkout_payment_processed_prefix")} <strong className="text-foreground">{fmt(currentPayableAmount, summary.currency)}</strong> {t("checkout_payment_processed_suffix")}
            </p>
            <div className="p-3 bg-white/70 dark:bg-slate-900/60 rounded-lg border border-emerald-200 dark:border-emerald-900 text-xs text-muted-foreground max-w-md mx-auto">
              {t("checkout_receipt_download_hint_prefix")} <strong>{t("checkout_receipt_download_hint_strong")}</strong> {t("checkout_receipt_download_hint_suffix")}
            </div>
            <div>
              <Link href={`/my-bookings/${booking.id}`}>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" data-testid="button-view-booking">
                  {t("checkout_view_booking_and_payments")}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : phase === "processing" ? (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="p-8 text-center space-y-3">
            <Clock className="h-14 w-14 text-amber-600 mx-auto animate-pulse" />
            <h2 className="text-xl font-bold" data-testid="text-payment-processing">{t("payment_processing_title")}</h2>
            <p className="text-sm text-muted-foreground">{t("payment_processing_desc")}</p>
          </CardContent>
        </Card>
      ) : isStripe ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {t("pay_with_card")} (Stripe)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {phase === "failed" && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-payment-failed">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{t("payment_failed")}{failureReason ? `: ${failureReason}` : ""}. {t("try_again_or_other_card")}</span>
              </div>
            )}
            {isInitializingIntent || !stripeClientSecret ? (
              <div className="py-8 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <p className="text-sm text-muted-foreground">{t("checkout_preparing_intent")}</p>
              </div>
            ) : (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: stripeClientSecret,
                  appearance: {
                    theme: "stripe",
                  },
                }}
              >
                <StripeCheckoutForm
                  bookingId={booking.id}
                  paymentId={paymentId || ""}
                  totalCents={currentPayableAmount}
                  currency={summary.currency}
                  onSuccess={() => {
                    qc.invalidateQueries({ queryKey: ["/api/checkout", bookingId] });
                    qc.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "payments"] });
                    setPhase("success");
                  }}
                  onProcessing={() => {
                    setPhase("processing");
                  }}
                  onFailed={(reason) => {
                    setFailureReason(reason);
                    setPhase("failed");
                  }}
                />
              </Elements>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />{t("pay_with_card")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {phase === "failed" && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-payment-failed">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{t("payment_failed")}{failureReason ? `: ${failureReason}` : ""}. {t("try_again_or_other_card")}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("card_number")}</Label>
              <Input value={card} onChange={(e) => setCard(e.target.value)} inputMode="numeric" autoComplete="cc-number" data-testid="input-card-number" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("expiry_label")}</Label><Input value={expiry} onChange={(e) => setExpiry(e.target.value)} data-testid="input-expiry" /></div>
              <div className="space-y-2"><Label>{t("cvc_label")}</Label><Input value={cvc} onChange={(e) => setCvc(e.target.value)} data-testid="input-cvc" /></div>
            </div>
            <Button
              className="w-full h-12 text-lg font-bold bg-indigo-600 hover:bg-indigo-700"
              onClick={() => payMutation.mutate()}
              disabled={payMutation.isPending || card.replace(/\D/g, "").length < 12}
              data-testid="button-confirm-payment"
            >
              {payMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : `${t("complete_payment")} · ${fmt(currentPayableAmount, summary.currency)}`}
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">{t("card_data_not_stored")}</p>
            <Badge variant="outline" className="w-full justify-center text-[10px] font-normal">{t("test_cards_hint")}</Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
