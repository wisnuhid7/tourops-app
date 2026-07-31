import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Users, FileText, Workflow, MessageSquare, Plus, Send,
  CheckCircle, Clock, Link2, CreditCard, Upload, Copy, AlertTriangle,
  Plane, Hotel, Bus, UserCheck, Ticket, Eye, XCircle, ExternalLink, Download,
  Printer, Globe, X, Loader2
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { DocumentPreview } from "@/components/DocumentPreview";
import type { Booking, Traveler, BookingWorkflow, Message, Document, Payment } from "@workspace/db";
import { useLanguage } from "@/hooks/use-language";

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const SERVICE_ICONS: Record<string, any> = {
  airline: Plane, hotel: Hotel, transport: Bus, guide: UserCheck, sights: Ticket,
};

const DOC_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  uploaded: "outline", approved: "default", rejected: "destructive",
};

export default function CustomerBookingDetail() {
  const { t } = useLanguage();
  const [, params] = useRoute("/my-bookings/:id");
  const { toast } = useToast();
  const bookingId = params?.id;

  const { data: booking, isLoading } = useQuery<Booking>({ queryKey: ["/api/my-bookings", bookingId] });
  const { data: travelers } = useQuery<Traveler[]>({ queryKey: ["/api/my-bookings", bookingId, "travelers"] });
  const { data: workflows } = useQuery<BookingWorkflow[]>({ queryKey: ["/api/my-bookings", bookingId, "workflows"] });
  const { data: messages } = useQuery<Message[]>({ queryKey: ["/api/my-bookings", bookingId, "messages"] });
  const { data: docs } = useQuery<Document[]>({ queryKey: ["/api/my-bookings", bookingId, "documents"] });
  const { data: pmts } = useQuery<Payment[]>({ queryKey: ["/api/my-bookings", bookingId, "payments"] });
  const { data: participants } = useQuery<Booking[]>({
    queryKey: ["/api/my-bookings", bookingId, "participants"],
    enabled: booking?.bookingType === "leader_group",
  });



  const [showAddTraveler, setShowAddTraveler] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [nationality, setNationality] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");
  const [gender, setGender] = useState("");
  const [specialNeeds, setSpecialNeeds] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [docTravelerId, setDocTravelerId] = useState("");
  const [docType, setDocType] = useState("passport");
  const [docFileName, setDocFileName] = useState("");
  const [docFileUrl, setDocFileUrl] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [addTravelerForBookingId, setAddTravelerForBookingId] = useState<string | null>(null);
  const [ptFirstName, setPtFirstName] = useState("");
  const [ptLastName, setPtLastName] = useState("");
  const [ptDob, setPtDob] = useState("");
  const [ptNationality, setPtNationality] = useState("");
  const [ptPassportNumber, setPtPassportNumber] = useState("");
  const [ptPassportExpiry, setPtPassportExpiry] = useState("");
  const [ptGender, setPtGender] = useState("");
  const [activePayment, setActivePayment] = useState<Payment | null>(null);
  const [receiptUrl, setReceiptUrl] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setReceiptUrl(data.url);
      toast({ title: t("receipt_uploaded_success") });
    } catch (error) {
      toast({ title: t("receipt_upload_failed"), variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const addTraveler = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/bookings/${bookingId}/travelers`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "travelers"] });
      setShowAddTraveler(false);
      setFirstName(""); setLastName(""); setDob(""); setNationality("");
      setPassportNumber(""); setPassportExpiry(""); setGender(""); setSpecialNeeds("");
      toast({ title: t("traveler_added") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const bulkUploadTravelers = useMutation({
    mutationFn: (data: { bookingId: string; travelers: any[] }) =>
      apiRequest("POST", `/api/bookings/${data.bookingId}/travelers/bulk`, { travelers: data.travelers }),
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "participants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "travelers"] });
      setAddTravelerForBookingId(null);
      toast({ title: `${variables.travelers.length} ${t("import_success_suffix")}` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, targetBookingId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const travelers = data.map((row: any) => ({
          firstName: row['First Name'] || row.firstName || "",
          lastName: row['Last Name'] || row.lastName || "",
          passportNumber: row['Passport Number'] || row.passportNumber || "",
          nationality: row['Nationality'] || row.nationality || "",
          gender: row['Gender'] || row.gender || "male",
          dateOfBirth: row['DOB'] || row['Date of Birth'] || row.dateOfBirth || null,
        })).filter((t: any) => t.firstName && t.lastName);

        if (travelers.length === 0) {
          toast({ title: t("no_valid_travelers_found"), variant: "destructive"});
          return;
        }

        bulkUploadTravelers.mutate({ bookingId: targetBookingId, travelers });
      } catch (err: any) {
        toast({ title: t("failed_to_parse_file"), variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const addTravelerToParticipant = useMutation({
    mutationFn: (data: { bookingId: string; body: any }) =>
      apiRequest("POST", `/api/bookings/${data.bookingId}/travelers`, data.body),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "participants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "travelers"] });
      setAddTravelerForBookingId(null);
      setPtFirstName(""); setPtLastName(""); setPtDob(""); setPtNationality("");
      setPtPassportNumber(""); setPtPassportExpiry(""); setPtGender("");
      toast({ title: variables.bookingId === bookingId ? t("passenger_added_your_booking") : t("passenger_added_participant_booking") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/bookings/${bookingId}/messages`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "messages"] });
      setNewMessage("");
    },
  });

  const uploadDoc = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/my-bookings/${bookingId}/documents`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "documents"] });
      setShowUploadDoc(false);
      setDocTravelerId(""); setDocType("passport"); setDocFileName(""); setDocFileUrl("");
      toast({ title: t("document_uploaded") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const cancelParticipant = useMutation({
    mutationFn: (participantBookingId: string) =>
      apiRequest("POST", `/api/my-bookings/${bookingId}/participants/${participantBookingId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "participants"] });
      setConfirmCancelId(null);
      toast({ title: t("participant_removed") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const uploadReceipt = useMutation({
    mutationFn: async ({ paymentId, data }: { paymentId: string, data: any }) => {
      const res = await apiRequest("PATCH", `/api/my-bookings/${bookingId}/payments/${paymentId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "payments"] });
      toast({ title: t("receipt_uploaded_title"), description: t("receipt_uploaded_desc") });
      setActivePayment(null);
      setReceiptUrl("");
      setPaymentNotes("");
    }
  });

  const cancelBooking = useMutation({
    mutationFn: (reason: string) => apiRequest("POST", `/api/my-bookings/${bookingId}/cancel`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      toast({ title: t("booking_cancelled_success") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const [cancelReason, setCancelReason] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!booking) {
    return <div className="p-8">{t("booking_not_found")}</div>;
  }

  const isLeaderGroup = booking?.bookingType === "leader_group";
  const isPrivateFamily = booking?.bookingType === "private_family";

  const copyJoinCode = () => {
    if (booking?.joinCode) {
      navigator.clipboard.writeText(booking.joinCode);
      toast({ title: t("join_code_copied") });
    }
  };

  const downloadInvoice = () => {
    if (!booking) return;
    const doc = new jsPDF();

    // Header
    doc.setFillColor(17, 107, 176); // Theme blue
    doc.rect(0, 0, 210, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("TOUROPS", 15, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("OFFICIAL INVOICE & CONFIRMATION", 15, 28);

    doc.setTextColor(255, 255, 255);
    doc.text(`Booking Ref: ${booking.bookingCode}`, 195, 20, { align: 'right' });
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 195, 28, { align: 'right' });

    // Booking Details
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text("Booking Summary", 15, 55);

    autoTable(doc, {
      startY: 60,
      head: [['Field', 'Details']],
      body: [
        ['Booking Code', booking.bookingCode],
        ['Tour ID', booking.tourId || "N/A"],
        ['Departure ID', booking.departureId || "N/A"],
        ['Status', booking.status?.toUpperCase() || "SUBMITTED"],
        ['Party Size', booking.partySizeExpected !== undefined && booking.partySizeExpected !== null ? String(booking.partySizeExpected) : "1"],
        ['Total Price', `${booking.totalPrice?.toLocaleString() || "0"} ${booking.currency || "USD"}`],
      ],
      theme: 'striped',
      headStyles: { fillColor: [240, 240, 240], textColor: [100, 100, 100], fontSize: 10 },
      styles: { fontSize: 10 }
    });

    // Travelers
    if (travelers && travelers.length > 0) {
      doc.setFontSize(14);
      doc.text("Travelers", 15, (doc as any).lastAutoTable.finalY + 15);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['#', 'First Name', 'Last Name', 'Nationality', 'Passport']],
        body: travelers.map((t, i) => [
          (i + 1).toString(),
          t.firstName,
          t.lastName,
          t.nationality || "-",
          t.passportNumber || "-"
        ]),
        headStyles: { fillColor: [17, 107, 176] }
      });
    }

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Thank you for choosing TourOps. This is a computer generated document.", 105, 285, { align: 'center' });
    }

    doc.save(`Invoice_${booking.bookingCode}.pdf`);
    toast({ title: t("pdf_generated_title"), description: t("pdf_generated_desc") });
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  if (!booking) return <div className="p-6"><p className="text-muted-foreground">{t("booking_not_found")}</p></div>;

  const travelerDocs = Array.isArray(docs) ? docs.filter((d) => ["passport", "id_doc", "visa"].includes(d.docType)) : [];
  const fulfillmentDocs = Array.isArray(docs) ? docs.filter((d) => !["passport", "id_doc", "visa"].includes(d.docType)) : [];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Printable Header */}
      <div className="hidden print:block border-b-2 border-[#116bb0] pb-4 mb-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Globe className="h-10 w-10 text-[#116bb0]" />
            <div>
              <h1 className="text-3xl font-bold font-serif text-[#116bb0]">{t("booking_confirmation")}</h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-sans">{t("official_customer_copy")}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-2xl">{booking.bookingCode}</p>
            <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between no-print">
        <Link href="/my-bookings">
          <Button variant="ghost" size="sm" data-testid="button-back-bookings">
            <ArrowLeft className="h-4 w-4 mr-1" />{t("back")}
          </Button>
        </Link>
        <Button variant="outline" size="sm" onClick={downloadInvoice} className="h-8">
          <Printer className="h-4 w-4 mr-2" />
          {t("print_save_pdf")}
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold font-serif" data-testid="text-customer-booking-code">{booking.bookingCode}</h1>
            <Badge variant="outline">{t(`booking_type_${booking.bookingType}` as any)}</Badge>
          </div>
          {booking.groupName && <p className="text-muted-foreground">{booking.groupName}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={booking.status === "confirmed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"}>
            {t(`booking_status_${booking.status || "submitted"}` as any)}
          </Badge>
          {booking.status !== "cancelled" && booking.status !== "completed" && (
            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                  <XCircle className="h-3 w-3 mr-1" />{t("cancel_booking")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("cancel_your_booking")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    {t("cancel_booking_confirm_text")}
                  </p>
                  <div className="space-y-2">
                    <Label>{t("cancellation_reason_label")}</Label>
                    <Textarea
                      placeholder={t("cancellation_reason_placeholder")}
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => cancelBooking.mutate(cancelReason)}
                    disabled={cancelBooking.isPending}
                  >
                    {cancelBooking.isPending ? t("cancelling") : t("confirm_cancellation")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Badge variant={booking.fulfillmentStatus === "completed" ? "default" : "outline"}>
            {t(`fulfillment_status_${booking.fulfillmentStatus || "pending"}` as any)}
          </Badge>
        </div>
      </div>

      {booking.joinCode && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="text-sm">{t("share_code_with_group")}</span>
            <code className="font-mono font-bold text-primary bg-primary/10 px-3 py-1 rounded-md" data-testid="text-join-code">{booking.joinCode}</code>
            <Button size="sm" variant="outline" onClick={copyJoinCode} data-testid="button-copy-join-code">
              <Copy className="h-3 w-3 mr-1" />{t("copy")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview"><Eye className="h-3.5 w-3.5 mr-1" />{t("tab_overview")}</TabsTrigger>
          {isLeaderGroup && (
            <TabsTrigger value="group" data-testid="tab-group"><Users className="h-3.5 w-3.5 mr-1" />{t("tab_group")}</TabsTrigger>
          )}
          <TabsTrigger value="travelers" data-testid="tab-customer-travelers"><Users className="h-3.5 w-3.5 mr-1" />{t("tab_travelers")}</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents"><FileText className="h-3.5 w-3.5 mr-1" />{t("tab_documents")}</TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-customer-messages"><MessageSquare className="h-3.5 w-3.5 mr-1" />{t("tab_messages")}</TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments"><CreditCard className="h-3.5 w-3.5 mr-1" />{t("tab_payments")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-semibold text-sm">{t("trip_summary")}</h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("booking_code")}</span>
                    <span className="font-medium">{booking.bookingCode}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("type_label")}</span>
                    <span>{t(`booking_type_${booking.bookingType}` as any)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t("party_size")}</span>
                    <span>{booking.partySizeExpected}</span>
                  </div>
                  {booking.roomType && (
                    <div className="flex justify-between gap-2" data-testid="row-room-type">
                      <span className="text-muted-foreground">{t("room_type")}</span>
                      <span>{t((booking.roomType === "matrimonial" ? "room_matrimonial" : booking.roomType === "doble" ? "room_double" : "room_triple") as any)}</span>
                    </div>
                  )}
                  {booking.accommodationCost != null && (
                    <div className="flex justify-between gap-2" data-testid="row-accommodation-cost">
                      <span className="text-muted-foreground">{t("accommodation_cost_label")}</span>
                      <span>${booking.accommodationCost}</span>
                    </div>
                  )}
                  {booking.totalPrice != null && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("total_price")}</span>
                      <span className="font-medium">${booking.totalPrice}</span>
                    </div>
                  )}
                  {booking.notes && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("notes")}</span>
                      <span className="text-right max-w-[200px]">{booking.notes}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm">{t("alerts")}</h3>
                {travelers && travelers.length < (booking.partySizeExpected || 1) && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <span>{(booking.partySizeExpected || 1) - travelers.length} {t("travelers_still_needed")}</span>
                  </div>
                )}
                {Array.isArray(travelers) && travelers.some((t) => !t.passportNumber) && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <span>{t("missing_passport_details")}</span>
                  </div>
                )}
                {Array.isArray(pmts) && pmts.some((p) => p.status === "pending") && (
                  <div className="flex items-center gap-2 text-sm">
                    <CreditCard className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    <span>{t("payment_pending")}</span>
                  </div>
                )}
                {(!Array.isArray(travelers) || travelers.length >= (booking.partySizeExpected || 1)) &&
                  (!Array.isArray(pmts) || !pmts.some((p) => p.status === "pending")) &&
                  (!Array.isArray(travelers) || !travelers.some((t) => !t.passportNumber)) && (
                  <p className="text-sm text-muted-foreground">{t("no_alerts")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {workflows && workflows.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3">{t("service_status")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {workflows.map((wf) => {
                  const Icon = SERVICE_ICONS[wf.serviceType] || Workflow;
                  return (
                    <Card key={wf.id}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <Icon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t(`service_type_${wf.serviceType}` as any)}</p>
                          {wf.currentStep && <p className="text-xs text-muted-foreground truncate">{wf.currentStep}</p>}
                        </div>
                        <Badge variant={wf.status === "completed" ? "default" : "outline"} className="flex-shrink-0">
                          {wf.status === "completed" ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                          {wf.status === "completed" ? t("done") : t(`workflow_status_${wf.status || "not_assigned"}` as any)}
                        </Badge>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {isLeaderGroup && (
          <TabsContent value="group" className="mt-4 space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <Link2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{t("join_code_label")}</span>
                  <code className="font-mono font-bold text-primary bg-primary/10 px-3 py-1 rounded-md" data-testid="text-group-join-code">{booking.joinCode}</code>
                  <Button size="sm" variant="outline" onClick={copyJoinCode} data-testid="button-copy-group-code">
                    <Copy className="h-3 w-3 mr-1" />{t("copy")}
                  </Button>
                </div>
                {booking.groupName && <p className="text-sm text-muted-foreground">{t("group_label")} {booking.groupName}</p>}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-sm">{t("participants_label")} ({(participants?.length || 0) + 1} {t("total_suffix")})</h3>
              <Button
                size="sm"
                onClick={() => {
                  setAddTravelerForBookingId(booking.id);
                  setPtFirstName(""); setPtLastName(""); setPtDob(""); setPtNationality("");
                  setPtPassportNumber(""); setPtPassportExpiry(""); setPtGender("");
                }}
                data-testid="button-add-passenger-leader"
              >
                <Plus className="h-3 w-3 mr-1" />{t("add_passenger")}
              </Button>
            </div>

            <Card>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{t("you_leader")}</p>
                  <p className="text-xs text-muted-foreground">{booking.bookingCode}</p>
                </div>
                <Badge variant="default">{t("leader_badge")}</Badge>
              </CardContent>
            </Card>

            {participants && participants.length > 0 ? (
              participants.map((p) => (
                <Card key={p.id} data-testid={`card-participant-${p.id}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm">{p.bookingCode}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.partySizeExpected} {t("travelers_count_suffix")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={p.status === "cancelled" ? "destructive" : p.status === "confirmed" ? "default" : "secondary"}>
                          {t(`booking_status_${p.status || "submitted"}` as any)}
                        </Badge>
                        {p.status !== "cancelled" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAddTravelerForBookingId(p.id);
                                setPtFirstName(""); setPtLastName(""); setPtDob(""); setPtNationality("");
                                setPtPassportNumber(""); setPtPassportExpiry(""); setPtGender("");
                              }}
                              data-testid={`button-add-passenger-${p.id}`}
                            >
                              <Plus className="h-3 w-3 mr-1" />{t("add_passenger")}
                            </Button>
                            <label className="cursor-pointer">
                              <Input
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                className="hidden"
                                onChange={(e) => handleFileUpload(e, p.id)}
                                disabled={bulkUploadTravelers.isPending}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="pointer-events-none"
                                data-testid={`button-import-${p.id}`}
                              >
                                <Upload className="h-3 w-3 mr-1" />
                                {bulkUploadTravelers.isPending && addTravelerForBookingId === p.id ? t("importing") : t("bulk_import")}
                              </Button>
                            </label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmCancelId(p.id)}
                              data-testid={`button-remove-participant-${p.id}`}
                            >
                              <XCircle className="h-3 w-3 mr-1" />{t("remove")}
                            </Button>
                            <Dialog open={confirmCancelId === p.id} onOpenChange={(v) => !v && setConfirmCancelId(null)}>
                              <DialogContent>
                                <DialogHeader><DialogTitle>{t("remove_participant_title")}</DialogTitle></DialogHeader>
                                <p className="text-sm text-muted-foreground">
                                  {t("remove_participant_confirm_prefix")} {p.bookingCode}. {t("remove_participant_confirm_suffix")}
                                </p>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setConfirmCancelId(null)}>{t("cancel")}</Button>
                                  <Button variant="destructive" onClick={() => cancelParticipant.mutate(p.id)} disabled={cancelParticipant.isPending}>
                                    {cancelParticipant.isPending ? t("removing") : t("remove")}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("no_participants_yet")}</p>
                </CardContent>
              </Card>
            )}

            <Dialog open={!!addTravelerForBookingId} onOpenChange={(v) => !v && setAddTravelerForBookingId(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>{addTravelerForBookingId === booking.id ? t("add_passenger_to_your_booking") : t("add_passenger_to_participant")}</DialogTitle></DialogHeader>
                <div className="bg-muted/30 border rounded p-3 mb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t("have_large_group")}</p>
                      <p className="text-xs text-muted-foreground">{t("upload_spreadsheet_instead")}</p>
                    </div>
                    <label className="cursor-pointer">
                      <Input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, addTravelerForBookingId || booking.id)}
                      />
                      <Button size="sm" variant="outline" className="pointer-events-none">
                        <Upload className="h-3 w-3 mr-1" /> {t("excel_import")}
                      </Button>
                    </label>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">{t("required_columns_note")}</p>
                </div>
                <div className="space-y-3 border-t pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("first_name")} *</Label><Input value={ptFirstName} onChange={(e) => setPtFirstName(e.target.value)} data-testid="input-pt-first-name" /></div>
                    <div><Label>{t("last_name")} *</Label><Input value={ptLastName} onChange={(e) => setPtLastName(e.target.value)} data-testid="input-pt-last-name" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("date_of_birth")}</Label><Input type="date" value={ptDob} onChange={(e) => setPtDob(e.target.value)} data-testid="input-pt-dob" /></div>
                    <div><Label>{t("gender_label")}</Label>
                      <Select value={ptGender} onValueChange={setPtGender}>
                        <SelectTrigger data-testid="select-pt-gender"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                        <SelectContent><SelectItem value="male">{t("male")}</SelectItem><SelectItem value="female">{t("female")}</SelectItem><SelectItem value="other">{t("other")}</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("nationality_label")}</Label><Input value={ptNationality} onChange={(e) => setPtNationality(e.target.value)} data-testid="input-pt-nationality" /></div>
                    <div><Label>{t("passport_number_label")}</Label><Input value={ptPassportNumber} onChange={(e) => setPtPassportNumber(e.target.value)} data-testid="input-pt-passport" /></div>
                  </div>
                  <div><Label>{t("passport_expiry_label")}</Label><Input type="date" value={ptPassportExpiry} onChange={(e) => setPtPassportExpiry(e.target.value)} data-testid="input-pt-passport-expiry" /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddTravelerForBookingId(null)}>{t("cancel")}</Button>
                  <Button
                    onClick={() => addTravelerForBookingId && addTravelerToParticipant.mutate({
                      bookingId: addTravelerForBookingId,
                      body: { firstName: ptFirstName, lastName: ptLastName, dateOfBirth: ptDob || null, nationality: ptNationality || null, passportNumber: ptPassportNumber || null, passportExpiry: ptPassportExpiry || null, gender: ptGender || null }
                    })}
                    disabled={addTravelerToParticipant.isPending || !ptFirstName || !ptLastName}
                    data-testid="button-submit-participant-traveler"
                  >
                    {addTravelerToParticipant.isPending ? t("adding") : t("add_passenger")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        )}

        <TabsContent value="travelers" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{travelers?.length || 0} {t("of_label")} {booking.partySizeExpected} {t("travelers_added_suffix")}</p>
            <div className="flex items-center gap-2">
            <Link href="/manage-passengers">
              <Button size="sm" variant="outline" data-testid="button-manage-travelers">
                <Users className="h-4 w-4 mr-1" />{t("manage_passengers")}
              </Button>
            </Link>
            <Dialog open={showAddTraveler} onOpenChange={setShowAddTraveler}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-traveler"><Plus className="h-4 w-4 mr-1" />{t("add_traveler")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("add_traveler")}</DialogTitle></DialogHeader>
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("first_name")} *</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-traveler-first" /></div>
                    <div><Label>{t("last_name")} *</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-traveler-last" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("date_of_birth")}</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} data-testid="input-traveler-dob" /></div>
                    <div><Label>{t("nationality_label")}</Label><Input value={nationality} onChange={(e) => setNationality(e.target.value)} data-testid="input-traveler-nationality" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("passport_number_label")}</Label><Input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} data-testid="input-traveler-passport" /></div>
                    <div><Label>{t("passport_expiry_label")}</Label><Input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} data-testid="input-traveler-passport-expiry" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("gender_label")}</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger data-testid="select-traveler-gender"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">{t("male")}</SelectItem>
                          <SelectItem value="female">{t("female")}</SelectItem>
                          <SelectItem value="other">{t("other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>{t("special_needs_label")}</Label><Input value={specialNeeds} onChange={(e) => setSpecialNeeds(e.target.value)} placeholder={t("special_needs_placeholder")} data-testid="input-traveler-special-needs" /></div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => addTraveler.mutate({
                      firstName, lastName, dob: dob || undefined, nationality: nationality || undefined,
                      passportNumber: passportNumber || undefined, passportExpiry: passportExpiry || undefined,
                      gender: gender || undefined, specialNeeds: specialNeeds || undefined,
                    })}
                    disabled={!firstName || !lastName || addTraveler.isPending}
                    data-testid="button-save-traveler"
                  >
                    {addTraveler.isPending ? t("adding") : t("add_traveler")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {travelers && travelers.length > 0 ? (
            <div className="space-y-2">
              {travelers.map((t2) => (
                <Card key={t2.id} data-testid={`card-traveler-${t2.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{t2.firstName} {t2.lastName}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                          {t2.dob && <span>{t("dob_prefix")} {t2.dob}</span>}
                          {t2.nationality && <span>{t2.nationality}</span>}
                          {t2.gender && <span>{t2.gender}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {t2.passportNumber ? (
                          <Badge variant="outline" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />{t("passport_prefix")} {t2.passportNumber}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />{t("no_passport")}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {t2.specialNeeds && (
                      <p className="text-xs text-muted-foreground mt-2">{t("special_needs_prefix")} {t2.specialNeeds}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t("add_travelers_prompt")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="font-semibold text-sm">{t("traveler_documents")}</h3>
            <Dialog open={showUploadDoc} onOpenChange={setShowUploadDoc}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-upload-doc"><Upload className="h-4 w-4 mr-1" />{t("upload_document")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("upload_document")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>{t("traveler_label")}</Label>
                    <Select value={docTravelerId} onValueChange={setDocTravelerId}>
                      <SelectTrigger data-testid="select-doc-traveler"><SelectValue placeholder={t("select_traveler_placeholder")} /></SelectTrigger>
                      <SelectContent>
                        {travelers?.map((t3) => (
                          <SelectItem key={t3.id} value={t3.id}>{t3.firstName} {t3.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("document_type")}</Label>
                    <Select value={docType} onValueChange={setDocType}>
                      <SelectTrigger data-testid="select-doc-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passport">{t("passport_doc_type")}</SelectItem>
                        <SelectItem value="id_doc">{t("id_document")}</SelectItem>
                        <SelectItem value="visa">{t("visa_doc_type")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("file_name_reference")}</Label>
                    <Input value={docFileName} onChange={(e) => setDocFileName(e.target.value)} placeholder="passport_john.pdf" data-testid="input-doc-filename" />
                  </div>
                  <div>
                    <Label>{t("file_url_path")}</Label>
                    <Input value={docFileUrl} onChange={(e) => setDocFileUrl(e.target.value)} placeholder="https://example.com/doc.pdf" data-testid="input-doc-fileurl" />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => uploadDoc.mutate({
                      bookingId,
                      travelerId: docTravelerId || undefined,
                      docType,
                      fileName: docFileName,
                      fileUrl: docFileUrl || undefined,
                    })}
                    disabled={!docFileName || uploadDoc.isPending}
                    data-testid="button-submit-doc"
                  >
                    {uploadDoc.isPending ? t("uploading") : t("upload_label")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {travelerDocs.length > 0 ? (
            <div className="space-y-2">
              {travelerDocs.map((doc) => {
                const traveler = Array.isArray(travelers) ? travelers.find((t) => t.id === doc.travelerId) : undefined;
                return (
                  <Card key={doc.id} data-testid={`card-doc-${doc.id}`}>
                    <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {traveler ? `${traveler.firstName} ${traveler.lastName}` : t("general_label")} - {doc.docType}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={doc.status === "rejected" ? "destructive" : "outline"}>
                          {doc.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
                          {doc.status || t("uploaded_status")}
                        </Badge>
                        {doc.fileUrl && (
                          <div className="flex items-center gap-1">
                            <DocumentPreview fileUrl={doc.fileUrl} fileName={doc.fileName} />
                            <Button size="sm" variant="ghost" asChild title={t("download_document")}>
                              <a href={doc.fileUrl} download={doc.fileName}>
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </div>
                        )}
                        {doc.reviewNotes && <span className="text-xs text-muted-foreground">{doc.reviewNotes}</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-8">
                <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">{t("no_traveler_documents")}</p>
              </CardContent>
            </Card>
          )}

          {fulfillmentDocs.length > 0 && (
            <>
              <h3 className="font-semibold text-sm pt-2">{t("fulfillment_documents")}</h3>
              <div className="space-y-2">
                {fulfillmentDocs.map((doc) => (
                  <Card key={doc.id} data-testid={`card-fulfillment-doc-${doc.id}`}>
                    <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{doc.fileName}</p>
                          <p className="text-xs text-muted-foreground">{(doc.docType || "").replace(/_/g, " ")}</p>
                        </div>
                      </div>
                      <Badge variant="default">
                        <CheckCircle className="h-3 w-3 mr-1" />{t("available_label")}
                      </Badge>
                      {doc.fileUrl && (
                        <div className="flex items-center gap-1">
                          <DocumentPreview fileUrl={doc.fileUrl} fileName={doc.fileName} />
                          <Button size="sm" variant="ghost" className="text-white" asChild title={t("download_document")}>
                            <a href={doc.fileUrl} download={doc.fileName}>
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="messages" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={t("send_message_placeholder")}
                className="flex-1"
                data-testid="input-customer-message"
                onKeyDown={(e) => { if (e.key === "Enter" && newMessage.trim()) sendMessage.mutate({ messageText: newMessage, visibility: "customer_visible" }); }}
              />
              <Button
                size="icon"
                onClick={() => { if (newMessage.trim()) sendMessage.mutate({ messageText: newMessage, visibility: "customer_visible" }); }}
                disabled={!newMessage.trim()}
                data-testid="button-customer-send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {Array.isArray(messages) && messages.filter((m) => m.visibility === "customer_visible").length > 0 ? (
            <div className="space-y-2">
              {messages.filter((m) => m.visibility === "customer_visible").map((msg) => (
                <Card key={msg.id} data-testid={`card-message-${msg.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-sm">{msg.senderName || t("support_label")}</span>
                      <span className="text-xs text-muted-foreground">{msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}</span>
                    </div>
                    <p className="text-sm">{msg.messageText}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t("no_messages")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payments" className="mt-4 space-y-4">
          {booking.totalPrice != null && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("total_amount")}</p>
                    <p className="text-2xl font-bold">${booking.totalPrice.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t("payment_status")}</p>
                    {Array.isArray(pmts) && pmts.length > 0 ? (
                      <Badge variant={pmts.every((p) => p.status === "paid") ? "default" : "secondary"}>
                        {pmts.every((p) => p.status === "paid") ? t("paid_label") : t("partially_paid")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t("unpaid")}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <CreditCard className="h-5 w-5" />
                    <span className="font-bold">{t("online_payment")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t("pay_securely_desc")}</p>
                  <Link href={`/checkout/${booking.id}`}>
                    <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold" data-testid="button-pay-online">
                      {t("pay_with_card")}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          )}

          {pmts && pmts.length > 0 ? (
            <div className="space-y-2">
              {pmts.map((pmt) => (
                <Card key={pmt.id} data-testid={`card-payment-${pmt.id}`}>
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">${(pmt.amount / 100).toFixed(2)} {pmt.currency}</p>
                      <p className="text-xs text-muted-foreground">
                        {pmt.method?.replace(/_/g, " ")} - {pmt.createdAt ? new Date(pmt.createdAt).toLocaleDateString() : ""}
                      </p>
                      {pmt.notes && <p className="text-xs text-muted-foreground mt-1">{pmt.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={pmt.status === "paid" ? "default" : "secondary"}>
                        {pmt.status === "paid" && <CheckCircle className="h-3 w-3 mr-1" />}
                        {pmt.status || t("pending_label")}
                      </Badge>
                      {pmt.receiptUrl ? (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(pmt.receiptUrl!, "_blank")} title={t("view_receipt")}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" asChild title={t("download_receipt")}>
                            <a href={pmt.receiptUrl} download={`receipt-${pmt.id}`}>
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </div>
                      ) : pmt.status === "pending" && (
                        <Dialog open={activePayment?.id === pmt.id} onOpenChange={(open) => !open && setActivePayment(null)}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => setActivePayment(pmt)}>
                              <Upload className="h-3.5 w-3.5 mr-1" />
                              {t("upload_proof")}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>{t("upload_payment_proof")}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>{t("receipt_image_attachment")}</Label>
                                <div className="flex gap-2 items-center">
                                  <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    disabled={isUploading}
                                    className="cursor-pointer"
                                  />
                                  {isUploading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                                </div>
                                {receiptUrl && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="outline" className="text-xs max-w-[200px] truncate">{receiptUrl}</Badge>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => setReceiptUrl("")}>
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                                {receiptUrl && (
                                  <div className="mt-3 p-2 bg-muted/20 border rounded-md">
                                    <p className="text-[10px] text-muted-foreground mb-1 text-center font-medium">{t("image_preview")}</p>
                                    <img src={receiptUrl} alt={t("receipt_preview")} className="mx-auto rounded max-h-32 object-contain" />
                                  </div>
                                )}
                                <p className="text-[10px] text-muted-foreground mt-1 text-center border-t pt-2">{t("attach_transfer_proof_note")}</p>
                              </div>
                              <div className="space-y-2">
                                <Label>{t("notes_optional")}</Label>
                                <Textarea
                                  placeholder={t("additional_info_placeholder")}
                                  value={paymentNotes}
                                  onChange={(e) => setPaymentNotes(e.target.value)}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setActivePayment(null)}>{t("cancel")}</Button>
                              <Button
                                onClick={() => uploadReceipt.mutate({
                                  paymentId: pmt.id,
                                  data: { receiptUrl, notes: paymentNotes }
                                })}
                                disabled={!receiptUrl || uploadReceipt.isPending}
                              >
                                {uploadReceipt.isPending ? t("submitting") : t("submit_proof")}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <CreditCard className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t("no_payment_records")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
