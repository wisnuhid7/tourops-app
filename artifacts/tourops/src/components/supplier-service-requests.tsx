import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { ClipboardList, CheckCircle2, XCircle, MessageSquare } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

interface ServiceRequest {
  id: string;
  bookingId: string;
  serviceType: string;
  serviceDate: string | null;
  location: string | null;
  quantity: number | null;
  paxCount: number | null;
  agreedRate: string | null;
  currency: string | null;
  status: string;
  notesForSupplier: string | null;
  supplierResponse: string | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  sent: "secondary", confirmed: "default", rejected: "destructive", changes_requested: "outline",
};

export function SupplierServiceRequests() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [responding, setResponding] = useState<{ req: ServiceRequest; action: "confirmed" | "rejected" | "changes_requested" } | null>(null);
  const [note, setNote] = useState("");

  const { data: requests, isLoading } = useQuery<ServiceRequest[]>({ queryKey: ["/api/supplier/service-requests"] });

  const respond = useMutation({
    mutationFn: ({ id, status, response }: { id: string; status: string; response?: string }) =>
      apiRequest("PATCH", `/api/supplier/service-requests/${id}/respond`, { status, response }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/service-requests"] });
      setResponding(null); setNote("");
      toast({ title: t("sr_response_recorded") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const submitResponse = () => {
    if (!responding) return;
    respond.mutate({ id: responding.req.id, status: responding.action, response: note || undefined });
  };

  return (
    <Card data-testid="supplier-service-requests">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> {t("sr_title")}</CardTitle>
        <CardDescription>{t("sr_subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : !requests?.length ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("sr_none")}</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("sr_service")}</TableHead>
              <TableHead>{t("sr_date")}</TableHead>
              <TableHead>{t("sr_location")}</TableHead>
              <TableHead>{t("sr_pax")}</TableHead>
              <TableHead>{t("sr_rate")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("sr_notes")}</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {requests.map(r => (
                <TableRow key={r.id} data-testid={`sr-row-${r.id}`}>
                  <TableCell className="font-medium capitalize">{r.serviceType}</TableCell>
                  <TableCell>{r.serviceDate ? format(new Date(r.serviceDate), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>{r.location ?? "—"}</TableCell>
                  <TableCell>{r.paxCount ?? "—"}</TableCell>
                  <TableCell>{r.agreedRate ? `${r.agreedRate} ${r.currency ?? "USD"}` : "—"}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="max-w-[220px] text-xs text-muted-foreground truncate">{r.notesForSupplier}</TableCell>
                  <TableCell>
                    {(r.status === "sent" || r.status === "changes_requested") && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="default" onClick={() => { setResponding({ req: r, action: "confirmed" }); setNote(""); }} data-testid={`sr-confirm-${r.id}`}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> {t("sr_confirm")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setResponding({ req: r, action: "changes_requested" }); setNote(""); }}>
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => { setResponding({ req: r, action: "rejected" }); setNote(""); }}>
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!responding} onOpenChange={(o) => !o && setResponding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {responding?.action === "confirmed" ? t("sr_confirm_title") : responding?.action === "rejected" ? t("sr_reject_title") : t("sr_changes_title")}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={responding?.action === "confirmed" ? t("sr_note_optional") : t("sr_note_required")}
            data-testid="sr-response-note"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResponding(null)}>{t("cancel")}</Button>
            <Button onClick={submitResponse} disabled={respond.isPending || (responding?.action !== "confirmed" && !note.trim())} data-testid="sr-submit-response">
              {t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
