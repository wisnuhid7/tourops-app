import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Search, CreditCard, CheckCircle, ArrowRight, DollarSign } from "lucide-react";
import type { Payment, Booking } from "@shared/schema";
import { useState } from "react";
import { useLanguage } from "@/hooks/use-language";

export default function AdminPayments() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const PAYMENT_METHODS: Record<string, string> = {
    bank_transfer: t("payment_method_bank_transfer"), card: t("payment_method_card"), cash: t("payment_method_cash"), other: t("payment_method_other"),
  };

  const PAYMENT_STATUSES: Record<string, string> = {
    pending: t("payment_status_pending"), paid: t("payment_status_paid"), failed: t("payment_status_failed"), refunded: t("payment_status_refunded"),
  };

  const { data: payments, isLoading } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });
  const { data: bookings } = useQuery<Booking[]>({ queryKey: ["/api/bookings"] });

  const updatePayment = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/payments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: t("payment_updated") });
    },
  });

  const filtered = (payments || []).filter((p) => {
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const booking = bookings?.find(b => b.id === p.bookingId);
    const matchSearch = !search || 
      (booking?.bookingCode || "").toLowerCase().includes(search.toLowerCase()) || 
      (p.notes || "").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalPending = (payments || []).filter(p => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);
  const totalPaid = (payments || []).filter(p => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);

  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-48 mb-4" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 mb-2" />)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-payments-title">{t("payments")}</h1>
        <p className="text-muted-foreground text-sm">{t("payments_subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("total_payments")}</p><p className="text-xl font-bold" data-testid="stat-total-payments">{payments?.length || 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("pending_amount")}</p><p className="text-xl font-bold text-amber-600" data-testid="stat-pending-amount">${(totalPending / 100).toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("collected")}</p><p className="text-xl font-bold text-green-600" data-testid="stat-collected-amount">${(totalPaid / 100).toFixed(2)}</p></CardContent></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("search_payments_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-payments" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-payment-status-filter"><SelectValue placeholder={t("status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_status")}</SelectItem>
            {Object.entries(PAYMENT_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-16"><CreditCard className="h-12 w-12 text-muted-foreground/40 mb-4" /><h3 className="font-semibold mb-1">{t("no_payments_found")}</h3><p className="text-sm text-muted-foreground">{t("payments_recorded_from_booking")}</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((payment) => {
            const booking = bookings?.find(b => b.id === payment.bookingId);
            return (
              <Card key={payment.id} data-testid={`card-payment-${payment.id}`}>
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <DollarSign className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">${(payment.amount / 100).toFixed(2)} {payment.currency || "USD"}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{PAYMENT_METHODS[payment.method || "bank_transfer"]}</span>
                        <Link href={`/admin/bookings/${payment.bookingId}`}>
                          <span className="underline cursor-pointer">{booking?.bookingCode || t("view_booking")}</span>
                        </Link>
                        {payment.createdAt && <span>{new Date(payment.createdAt).toLocaleDateString()}</span>}
                      </div>
                      {payment.notes && <p className="text-xs text-muted-foreground mt-1">{payment.notes}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={payment.status === "paid" ? "default" : payment.status === "failed" ? "destructive" : payment.status === "refunded" ? "secondary" : "outline"}>
                      {PAYMENT_STATUSES[payment.status || "pending"]}
                    </Badge>
                    {payment.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => updatePayment.mutate({ id: payment.id, status: "paid" })} data-testid={`button-mark-paid-${payment.id}`}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" />{t("mark_paid")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
