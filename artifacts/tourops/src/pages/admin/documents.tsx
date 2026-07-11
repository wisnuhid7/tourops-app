import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";
import { Search, FileText, CheckCircle, XCircle, Clock, ArrowRight, ExternalLink, Download } from "lucide-react";
import type { Document, Booking } from "@workspace/db";
import { useState } from "react";
import { DocumentPreview } from "@/components/DocumentPreview";

export default function AdminDocuments() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const DOC_TYPES: Record<string, string> = {
    passport: t("doc_type_passport"), id_doc: t("doc_type_id"), visa: t("doc_type_visa"),
    eticket: t("doc_type_eticket"), pnr: t("doc_type_pnr"), hotel_confirm: t("doc_type_hotel_confirm"),
    voucher: t("doc_type_voucher"), transport_confirm: t("doc_type_transport_confirm"),
    guide_confirm: t("doc_type_guide_confirm"), sight_ticket: t("doc_type_sight_ticket"),
    quote: t("doc_type_quote"), receipt: t("doc_type_receipt"), other: t("doc_type_other"),
  };

  const { data: documents, isLoading } = useQuery<Document[]>({ queryKey: ["/api/documents"] });
  const { data: bookings } = useQuery<Booking[]>({ queryKey: ["/api/bookings"] });

  const updateDoc = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/documents/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: t("document_updated") });
    },
  });

  const filtered = (documents || []).filter((d) => {
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    const matchType = typeFilter === "all" || d.docType === typeFilter;
    const booking = bookings?.find(b => b.id === d.bookingId);
    const matchSearch = !search || 
      (d.fileName || "").toLowerCase().includes(search.toLowerCase()) || 
      (booking?.bookingCode || "").toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchType && matchSearch;
  });

  const pendingDocs = documents ? documents.filter(d => d.status === "uploaded").length : 0;

  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-48 mb-4" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 mb-2" />)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-documents-title">{t("documents_title")}</h1>
        <p className="text-muted-foreground text-sm">{t("review_manage_docs_desc")}</p>
      </div>

      {pendingDocs > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{pendingDocs} {t("documents_pending_review_suffix")}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("search_docs_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-documents" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-doc-status-filter"><SelectValue placeholder={t("status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_status")}</SelectItem>
            <SelectItem value="uploaded">{t("uploaded_status")}</SelectItem>
            <SelectItem value="approved">{t("approved_status")}</SelectItem>
            <SelectItem value="rejected">{t("rejected_status")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-doc-type-filter"><SelectValue placeholder={t("type_label")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_types")}</SelectItem>
            {Object.entries(DOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-16"><FileText className="h-12 w-12 text-muted-foreground/40 mb-4" /><h3 className="font-semibold mb-1">{t("no_documents_found")}</h3><p className="text-sm text-muted-foreground">{t("documents_will_appear_desc")}</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const booking = bookings?.find(b => b.id === doc.bookingId);
            return (
              <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{doc.fileName}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{DOC_TYPES[doc.docType] || doc.docType}</span>
                        <Link href={`/admin/bookings/${doc.bookingId}`}>
                          <span className="underline cursor-pointer">{booking?.bookingCode || t("view_booking_label")}</span>
                        </Link>
                        {doc.createdAt && <span>{new Date(doc.createdAt).toLocaleDateString()}</span>}
                      </div>
                      {doc.reviewNotes && <p className="text-xs text-muted-foreground mt-1">{t("review_label")} {doc.reviewNotes}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "secondary"}>
                      {doc.status === "approved" ? t("approved_status") : doc.status === "rejected" ? t("rejected_status") : t("pending_status")}
                    </Badge>
                    {doc.fileUrl && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => window.open(doc.fileUrl!, "_blank")} title={t("view_document_title")}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" asChild title={t("download_document_title")}>
                          <a href={doc.fileUrl} download={doc.fileName}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </>
                    )}
                    {doc.status === "uploaded" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => updateDoc.mutate({ id: doc.id, status: "approved" })} data-testid={`button-approve-doc-${doc.id}`}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />{t("approve_label")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateDoc.mutate({ id: doc.id, status: "rejected" })} data-testid={`button-reject-doc-${doc.id}`}>
                          <XCircle className="h-3.5 w-3.5 mr-1" />{t("reject_label")}
                        </Button>
                      </>
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
