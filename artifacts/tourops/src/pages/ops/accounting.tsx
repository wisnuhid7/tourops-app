import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, CheckCircle2, Clock, Receipt, Plus } from "lucide-react";

/**
 * Accounting / Finance dashboard — read access to bookings plus the ability to
 * record manual payments and confirm pending ones. No operational authority:
 * tours, assignments, master data and user management stay out of this role.
 */
export default function AccountingDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: bookings, isLoading: bookingsLoading } = useQuery<any[]>({ queryKey: ["/api/bookings"] });
  const { data: payments, isLoading: paymentsLoading } = useQuery<any[]>({ queryKey: ["/api/payments"] });

  const [recordFor, setRecordFor] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [notes, setNotes] = useState("");

  const recordPayment = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bookings/${recordFor.id}/payments`, {
      amount: parseInt(amount, 10),
      currency: recordFor.currency || "USD",
      method,
      status: "pending",
      notes: notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: t("payment_recorded") });
      setRecordFor(null); setAmount(""); setNotes("");
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const confirmPayment = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/payments/${id}`, { status: "paid" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: t("payment_confirmed") });
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  if (bookingsLoading || paymentsLoading) {
    return <div className="p-8 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }

  const bookingById = new Map((bookings || []).map(b => [b.id, b]));
  const paidTotal = (payments || []).filter(p => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0);
  const pending = (payments || []).filter(p => p.status === "pending");
  const bookedTotal = (bookings || []).reduce((s, b) => s + (b.totalPrice || 0), 0);

  const statusBadge = (st: string) => {
    const variant = st === "paid" ? "default" : st === "pending" ? "secondary" : "destructive";
    return <Badge variant={variant as any}>{st}</Badge>;
  };

  return (
    <div className="p-8 space-y-6" data-testid="accounting-dashboard">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><DollarSign className="h-6 w-6" /> {t("finance_dashboard")}</h1>
        <p className="text-muted-foreground">{t("finance_dashboard_subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Receipt className="h-4 w-4" /> {t("total_booked_value")}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="stat-booked">{bookedTotal.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {t("collected_payments")}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="stat-paid">{paidTotal.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> {t("pending_payments")}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="stat-pending">{pending.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("payments")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("booking")}</TableHead><TableHead>{t("amount")}</TableHead><TableHead>{t("method")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(payments || []).map(p => (
                <TableRow key={p.id} data-testid={`payment-row-${p.id}`}>
                  <TableCell className="font-medium">{bookingById.get(p.bookingId)?.bookingCode || p.bookingId}</TableCell>
                  <TableCell>{p.amount?.toLocaleString()} {p.currency}</TableCell>
                  <TableCell>{p.method}</TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell>
                    {p.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => confirmPayment.mutate(p.id)} disabled={confirmPayment.isPending} data-testid={`button-confirm-${p.id}`}>
                        {t("confirm_paid")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(!payments || payments.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">{t("no_payments_yet")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("receivables_bookings")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("booking")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("total")}</TableHead><TableHead>{t("actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(bookings || []).map(b => (
                <TableRow key={b.id} data-testid={`booking-row-${b.id}`}>
                  <TableCell className="font-medium">{b.bookingCode}</TableCell>
                  <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                  <TableCell>{(b.totalPrice || 0).toLocaleString()} {b.currency}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setRecordFor(b)} data-testid={`button-record-${b.id}`}>
                      <Plus className="h-4 w-4 mr-1" /> {t("record_payment")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!bookings || bookings.length === 0) && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("no_bookings_found")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!recordFor} onOpenChange={(o) => !o && setRecordFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("record_payment")} — {recordFor?.bookingCode}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="pay-amount">{t("amount")} ({recordFor?.currency || "USD"})</Label>
              <Input id="pay-amount" type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} data-testid="input-amount" />
            </div>
            <div>
              <Label>{t("method")}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger data-testid="select-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">{t("bank_transfer")}</SelectItem>
                  <SelectItem value="card">{t("card")}</SelectItem>
                  <SelectItem value="cash">{t("cash")}</SelectItem>
                  <SelectItem value="other">{t("other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pay-notes">{t("notes")}</Label>
              <Input id="pay-notes" value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordFor(null)}>{t("cancel")}</Button>
            <Button onClick={() => recordPayment.mutate()} disabled={!amount || recordPayment.isPending} data-testid="button-save-payment">{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
