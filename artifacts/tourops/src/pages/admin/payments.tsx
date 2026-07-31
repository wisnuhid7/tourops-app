import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Search, CreditCard, CheckCircle, ArrowRight, DollarSign, ChevronLeft, ChevronRight, RotateCcw, Loader2, ArrowUpDown } from "lucide-react";
import type { Payment, Booking, Refund } from "@workspace/db";
import { useLanguage } from "@/hooks/use-language";

interface PaymentRow {
  payment: Payment;
  bookingCode: string | null;
  bookingStatus: string | null;
  customerName: string | null;
  customerEmail: string | null;
}
interface PaymentList { rows: PaymentRow[]; total: number; page: number; pageSize: number }
interface PaymentDetail {
  payment: Payment;
  booking: Booking | null;
  customer: { id: string; username: string; email: string | null; firstName: string | null; lastName: string | null } | null;
  refunds: Refund[];
  events: { id: string; type: string; eventId: string; createdAt: string }[];
  audit: { id: string; action: string; previousValue: string | null; newValue: string | null; note: string | null; createdAt: string }[];
}

const fmt = (cents: number | null | undefined, currency?: string | null) =>
  `$${(((cents ?? 0)) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}`;

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default", pending: "secondary", processing: "secondary", failed: "destructive", canceled: "outline", refunded: "outline", partially_refunded: "outline",
};

export default function AdminPayments() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [refundFilter, setRefundFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"createdAt" | "amount">("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");

  const PAYMENT_STATUSES: Record<string, string> = {
    pending: t("payment_status_pending"), processing: t("payment_status_processing"), paid: t("payment_status_paid"),
    failed: t("payment_status_failed"), canceled: t("payment_status_canceled"), refunded: t("payment_status_refunded"),
    partially_refunded: t("payment_status_partially_refunded"),
  };
  const PAYMENT_METHODS: Record<string, string> = {
    bank_transfer: t("payment_method_bank_transfer"), card: t("payment_method_card"), cash: t("payment_method_cash"), other: t("payment_method_other"),
  };

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, dir });
  if (search) params.set("search", search);
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (refundFilter !== "all") params.set("refundStatus", refundFilter);
  const listUrl = `/api/admin/payments?${params.toString()}`;

  const { data, isLoading } = useQuery<PaymentList>({
    queryKey: [listUrl],
  });

  const { data: detail, isLoading: detailLoading } = useQuery<PaymentDetail>({
    queryKey: [`/api/admin/payments/${detailId}`],
    enabled: !!detailId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/admin/payments") });
    queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
  };

  const markPaid = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/payments/${id}`, { status: "paid" }),
    onSuccess: () => { invalidate(); toast({ title: t("payment_updated") }); },
    onError: (e: Error) => toast({ title: t("update_failed"), description: e.message, variant: "destructive" }),
  });

  const refundMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { reason: refundReason.trim(), notes: refundNotes.trim() || undefined };
      if (refundAmount.trim()) body.amount = Math.round(Number(refundAmount) * 100);
      return (await apiRequest("POST", `/api/payments/${detailId}/refunds`, body)).json();
    },
    onSuccess: (res: { refund: Refund }) => {
      invalidate();
      setRefundAmount(""); setRefundReason(""); setRefundNotes("");
      toast({ title: res.refund?.status === "failed" ? t("refund_failed") : t("refund_processed"), variant: res.refund?.status === "failed" ? "destructive" : undefined });
    },
    onError: (e: Error) => toast({ title: t("refund_failed"), description: e.message, variant: "destructive" }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const p = detail?.payment;
  const remaining = p ? p.amount - (p.refundedAmount || 0) : 0;
  const refundable = p ? ["paid", "partially_refunded"].includes(p.status || "") && remaining > 0 : false;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-payments-title">{t("payments")}</h1>
        <p className="text-muted-foreground text-sm">{t("payments_subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t("search_payments_placeholder")} value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} data-testid="input-search-payments" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_statuses")}</SelectItem>
            {Object.entries(PAYMENT_STATUSES).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={refundFilter} onValueChange={(v) => { setRefundFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[170px]" data-testid="select-refund-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_refund_statuses")}</SelectItem>
            <SelectItem value="none">{t("refund_status_none")}</SelectItem>
            <SelectItem value="partial">{t("refund_status_partial")}</SelectItem>
            <SelectItem value="full">{t("refund_status_full")}</SelectItem>
            <SelectItem value="failed">{t("refund_status_failed")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => { setSort(sort === "createdAt" ? "amount" : "createdAt"); setPage(1); }} data-testid="button-sort-field">
          <ArrowUpDown className="h-4 w-4 mr-1" />{sort === "createdAt" ? t("sort_by_date") : t("sort_by_amount")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDir(dir === "desc" ? "asc" : "desc")} data-testid="button-sort-dir">
          {dir === "desc" ? "↓" : "↑"}
        </Button>
      </div>

      {isLoading ? (
        <div>{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 mb-2" />)}</div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("no_payments_found")}</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map(({ payment, bookingCode, customerName, customerEmail }) => (
            <Card key={payment.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setDetailId(payment.id)} data-testid={`card-payment-${payment.id}`}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><CreditCard className="h-4 w-4 text-primary" /></div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{fmt(payment.amount, payment.currency)}
                      {(payment.refundedAmount || 0) > 0 && <span className="text-muted-foreground font-normal"> · −{fmt(payment.refundedAmount)}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {bookingCode || payment.bookingId.slice(0, 8)} · {customerName || customerEmail || "—"} · {PAYMENT_METHODS[payment.method || "other"]} · {payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {payment.refundStatus && payment.refundStatus !== "none" && (
                    <Badge variant="outline" className="text-xs">{t(("refund_status_" + payment.refundStatus) as any)}</Badge>
                  )}
                  <Badge variant={statusVariant[payment.status || "pending"] || "secondary"} data-testid={`badge-status-${payment.id}`}>
                    {PAYMENT_STATUSES[payment.status || "pending"] || payment.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span data-testid="text-pagination-info">{t("total_label")}: {total}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-prev-page"><ChevronLeft className="h-4 w-4" /></Button>
          <span>{page} / {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(page + 1)} data-testid="button-next-page"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Dialog open={!!detailId} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("payment_details")}</DialogTitle></DialogHeader>
          {detailLoading || !detail ? (
            <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">{t("amount")}</p><p className="font-bold text-lg" data-testid="text-detail-amount">{fmt(detail.payment.amount, detail.payment.currency)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("status")}</p><Badge variant={statusVariant[detail.payment.status || "pending"]}>{PAYMENT_STATUSES[detail.payment.status || "pending"]}</Badge></div>
                <div><p className="text-xs text-muted-foreground">{t("subtotal")}</p><p>{fmt(detail.payment.subtotal ?? detail.payment.amount)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("taxes")} + {t("service_fees")}</p><p>{fmt((detail.payment.taxes || 0) + (detail.payment.fees || 0))}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("refunded_amount")}</p><p>{fmt(detail.payment.refundedAmount)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("provider")}</p><p>{detail.payment.provider || "manual"}</p></div>
                <div className="col-span-2"><p className="text-xs text-muted-foreground">{t("transaction_reference")}</p><p className="font-mono text-xs break-all">{detail.payment.transactionId || detail.payment.paymentIntentId || "—"}</p></div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("booking")}</p>
                  {detail.booking ? (
                    <Link href={`/admin/bookings/${detail.booking.id}`} className="text-primary inline-flex items-center gap-1" data-testid="link-detail-booking">
                      {detail.booking.bookingCode}<ArrowRight className="h-3 w-3" />
                    </Link>
                  ) : "—"}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("customer")}</p>
                  <p>{detail.customer ? `${detail.customer.firstName || detail.customer.username}${detail.customer.email ? ` (${detail.customer.email})` : ""}` : "—"}</p>
                </div>
              </div>

              {detail.payment.status === "pending" && (
                <Button size="sm" variant="outline" onClick={() => markPaid.mutate(detail.payment.id)} disabled={markPaid.isPending} data-testid="button-mark-paid">
                  <CheckCircle className="h-4 w-4 mr-1" />{t("mark_as_paid")}
                </Button>
              )}

              {refundable && (
                <div className="border rounded-md p-3 space-y-3">
                  <p className="font-semibold flex items-center gap-2"><RotateCcw className="h-4 w-4" />{t("issue_refund")}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{t("refund_amount_optional")} ({t("max_label")} {fmt(remaining, detail.payment.currency)})</Label>
                      <Input type="number" step="0.01" min="0.01" max={(remaining / 100).toFixed(2)} placeholder={(remaining / 100).toFixed(2)} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} data-testid="input-refund-amount" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{t("refund_reason")}</Label>
                      <Select value={refundReason} onValueChange={setRefundReason}>
                        <SelectTrigger data-testid="select-refund-reason"><SelectValue placeholder={t("refund_reason")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="requested_by_customer">{t("refund_reason_requested")}</SelectItem>
                          <SelectItem value="duplicate">{t("refund_reason_duplicate")}</SelectItem>
                          <SelectItem value="booking_cancelled">{t("refund_reason_cancelled")}</SelectItem>
                          <SelectItem value="other">{t("payment_method_other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Textarea rows={2} placeholder={t("notes")} value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} data-testid="input-refund-notes" />
                  <Button size="sm" onClick={() => refundMutation.mutate()} disabled={!refundReason || refundMutation.isPending} data-testid="button-submit-refund">
                    {refundMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><DollarSign className="h-4 w-4 mr-1" />{t("issue_refund")}</>}
                  </Button>
                </div>
              )}

              {detail.refunds.length > 0 && (
                <div className="space-y-2">
                  <p className="font-semibold">{t("refund_history")}</p>
                  {detail.refunds.map((r) => (
                    <div key={r.id} className="flex items-center justify-between border rounded-md px-3 py-2" data-testid={`row-refund-${r.id}`}>
                      <div>
                        <p className="font-medium">{fmt(r.amount, r.currency)}</p>
                        <p className="text-xs text-muted-foreground">{r.reason}{r.notes ? ` · ${r.notes}` : ""} · {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}</p>
                      </div>
                      <Badge variant={r.status === "succeeded" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              )}

              {detail.audit.length > 0 && (
                <div className="space-y-1">
                  <p className="font-semibold">{t("payment_history")}</p>
                  {detail.audit.map((a) => (
                    <p key={a.id} className="text-xs text-muted-foreground">
                      {a.createdAt ? new Date(a.createdAt).toLocaleString() : ""} — {a.action}{a.previousValue ? ` (${a.previousValue} → ${a.newValue})` : a.newValue ? `: ${a.newValue}` : ""}{a.note ? ` · ${a.note}` : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
