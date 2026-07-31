import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/hooks/use-language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CreditCard, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";

interface CheckoutData {
  booking: { id: string; bookingCode: string | null; status: string | null; tourId: string };
  summary: { subtotal: number; taxes: number; fees: number; discount: number; total: number; currency: string; taxRate: number };
  alreadyPaid: number;
  fullyPaid: boolean;
  openPayment: { id: string; status: string; amount: number; currency: string } | null;
}

const fmt = (cents: number, currency: string) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export default function Checkout() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { t } = useLanguage();
  const qc = useQueryClient();

  const [card, setCard] = useState("4242 4242 4242 4242");
  const [expiry, setExpiry] = useState("12/28");
  const [cvc, setCvc] = useState("123");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "processing" | "success" | "failed">("form");
  const [failureReason, setFailureReason] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<CheckoutData>({
    queryKey: ["/api/checkout", bookingId],
    queryFn: async () => (await apiRequest("GET", `/api/checkout/${bookingId}`)).json(),
    enabled: !!bookingId,
  });

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
      const intentRes = await apiRequest("POST", `/api/checkout/${bookingId}/intent`);
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
      <div className="flex items-center gap-3">
        <Link href={`/my-bookings/${booking.id}`}>
          <Button variant="ghost" size="icon" data-testid="button-back"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t("secure_checkout")}</h1>
          <p className="text-sm text-muted-foreground">{t("tour_booking_prefix")} {booking.bookingCode}</p>
        </div>
      </div>

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

      {phase === "success" || data.fullyPaid ? (
        <Card className="border-green-300 bg-green-50 dark:bg-green-950/30">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
            <h2 className="text-xl font-bold" data-testid="text-payment-success">{t("payment_successful_title")}</h2>
            <p className="text-sm text-muted-foreground">{t("payment_successful_desc")}</p>
            <Link href={`/my-bookings/${booking.id}`}><Button data-testid="button-view-booking">{t("view_booking")}</Button></Link>
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
              {payMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : `${t("complete_payment")} · ${fmt(summary.total, summary.currency)}`}
            </Button>
            <p className="text-[10px] text-center text-muted-foreground">{t("card_data_not_stored")}</p>
            <Badge variant="outline" className="w-full justify-center text-[10px] font-normal">{t("test_cards_hint")}</Badge>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
