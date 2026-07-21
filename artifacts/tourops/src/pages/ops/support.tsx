import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Headset, Search, MessageSquare, Send } from "lucide-react";

/**
 * Customer Support dashboard — booking-scoped assistance only. Support agents
 * can search bookings, review a booking's conversation and payment status, and
 * reply to customers. No finance mutations, operations, master data, or user
 * administration.
 */
export default function SupportDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: bookings, isLoading } = useQuery<any[]>({ queryKey: ["/api/bookings"] });
  const [search, setSearch] = useState("");
  const [openBooking, setOpenBooking] = useState<any | null>(null);
  const [reply, setReply] = useState("");

  const { data: messages } = useQuery<any[]>({
    queryKey: ["/api/bookings", openBooking?.id, "messages"],
    enabled: !!openBooking,
  });
  const { data: payments } = useQuery<any[]>({
    queryKey: ["/api/bookings", openBooking?.id, "payments"],
    enabled: !!openBooking,
  });

  const sendReply = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bookings/${openBooking.id}/messages`, {
      messageText: reply,
      visibility: "customer_visible",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", openBooking?.id, "messages"] });
      setReply("");
      toast({ title: t("message_sent") });
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="p-8 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }

  const q = search.trim().toLowerCase();
  const filtered = (bookings || []).filter(b =>
    !q ||
    (b.bookingCode || "").toLowerCase().includes(q) ||
    (b.customerName || "").toLowerCase().includes(q) ||
    (b.status || "").toLowerCase().includes(q)
  );
  const paidTotal = (payments || []).filter(p => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0);
  const balance = openBooking ? Math.max((openBooking.totalPrice || 0) - paidTotal, 0) : 0;

  return (
    <div className="p-8 space-y-6" data-testid="support-dashboard">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Headset className="h-6 w-6" /> {t("support_dashboard")}</h1>
        <p className="text-muted-foreground">{t("support_dashboard_subtitle")}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder={t("search_bookings_placeholder")} value={search} onChange={e => setSearch(e.target.value)} data-testid="input-support-search" />
      </div>

      <Card>
        <CardHeader><CardTitle>{t("bookings")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("booking")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("total")}</TableHead><TableHead>{t("actions")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map(b => (
                <TableRow key={b.id} data-testid={`support-booking-${b.id}`}>
                  <TableCell className="font-medium">{b.bookingCode}</TableCell>
                  <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                  <TableCell>{(b.totalPrice || 0).toLocaleString()} {b.currency}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setOpenBooking(b)} data-testid={`button-assist-${b.id}`}>
                      <MessageSquare className="h-4 w-4 mr-1" /> {t("assist")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t("no_bookings_found")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!openBooking} onOpenChange={(o) => { if (!o) { setOpenBooking(null); setReply(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("support_case")} — {openBooking?.bookingCode}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-muted-foreground">{t("total")}</div><div className="font-medium" data-testid="case-total">{(openBooking?.totalPrice || 0).toLocaleString()} {openBooking?.currency}</div></div>
              <div><div className="text-muted-foreground">{t("paid_amount")}</div><div className="font-medium" data-testid="case-paid">{paidTotal.toLocaleString()} {openBooking?.currency}</div></div>
              <div><div className="text-muted-foreground">{t("balance_due")}</div><div className="font-medium" data-testid="case-balance">{balance.toLocaleString()} {openBooking?.currency}</div></div>
            </div>
            <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-2" data-testid="case-messages">
              {(messages || []).map(m => (
                <div key={m.id} className="text-sm">
                  <span className="font-medium">{m.senderName || t("customer")}: </span>
                  <span>{m.messageText}</span>
                  {m.visibility === "internal_only" && <Badge variant="secondary" className="ml-2 text-xs">{t("internal_note")}</Badge>}
                </div>
              ))}
              {(!messages || messages.length === 0) && (
                <div className="text-sm text-muted-foreground">{t("no_messages_yet")}</div>
              )}
            </div>
            <div className="flex gap-2">
              <Input value={reply} onChange={e => setReply(e.target.value)} placeholder={t("reply_to_customer")} data-testid="input-reply" />
              <Button onClick={() => sendReply.mutate()} disabled={!reply.trim() || sendReply.isPending} data-testid="button-send-reply">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenBooking(null)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
