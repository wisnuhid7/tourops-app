import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
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
  Printer, Globe, X, Loader2, Building2, Bed, MapPin, Phone, Mail, Building
} from "lucide-react";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { DocumentPreview } from "@/components/DocumentPreview";
import type { Booking, Traveler, BookingWorkflow, Message, Document, Payment, BookingPaymentSchedule, Tour, TourDeparture } from "@workspace/db";
import { useLanguage, localizeScheduleLabel } from "@/hooks/use-language";
import { LanguageSwitcher } from "@/components/language-switcher";
import { format } from "date-fns";

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
  const { t, lt, language } = useLanguage();
  const [, params] = useRoute("/my-bookings/:id");
  const { toast } = useToast();
  const bookingId = params?.id;

  const { data: booking, isLoading } = useQuery<Booking>({ queryKey: ["/api/my-bookings", bookingId] });
  const { data: tour } = useQuery<Tour>({
    queryKey: ["/api/tours", booking?.tourId],
    enabled: !!booking?.tourId,
  });
  const { data: departures } = useQuery<TourDeparture[]>({
    queryKey: ["/api/tours", booking?.tourId, "departures"],
    enabled: !!booking?.tourId,
  });
  const { data: tourHotels } = useQuery<any[]>({
    queryKey: ["/api/tours", booking?.tourId, "hotels"],
    enabled: !!booking?.tourId,
  });
  const { data: travelers } = useQuery<Traveler[]>({ queryKey: ["/api/my-bookings", bookingId, "travelers"] });
  const { data: workflows } = useQuery<BookingWorkflow[]>({ queryKey: ["/api/my-bookings", bookingId, "workflows"] });
  const { data: messages } = useQuery<Message[]>({ queryKey: ["/api/my-bookings", bookingId, "messages"] });
  const { data: docs } = useQuery<Document[]>({ queryKey: ["/api/my-bookings", bookingId, "documents"] });
  const { data: pmts } = useQuery<Payment[]>({ queryKey: ["/api/my-bookings", bookingId, "payments"] });
  const { data: schedule } = useQuery<BookingPaymentSchedule[]>({
    queryKey: ["/api/bookings", bookingId, "payment-schedule"],
    enabled: !!bookingId,
  });
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
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
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
  const [activeTab, setActiveTab] = useState("overview");

  const [showManualTransferDialog, setShowManualTransferDialog] = useState(false);
  const [manualAmount, setManualAmount] = useState("");
  const [manualReceiptUrl, setManualReceiptUrl] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [isUploadingManualReceipt, setIsUploadingManualReceipt] = useState(false);
  const [showPlanDialog, setShowPlanDialog] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} - ${t("copied_button")}` });
  };

  const handleManualReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingManualReceipt(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setManualReceiptUrl(data.url);
      toast({ title: t("toast_receipt_upload_success") });
    } catch {
      toast({ title: t("toast_image_upload_failed"), variant: "destructive" });
    } finally {
      setIsUploadingManualReceipt(false);
    }
  };

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

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload-document", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setDocFileUrl(data.url);
      if (!docFileName) setDocFileName(file.name);
      toast({ title: t("receipt_uploaded_success") });
    } catch {
      toast({ title: t("receipt_upload_failed"), variant: "destructive" });
    } finally {
      setIsUploadingDoc(false);
      e.target.value = "";
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
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "workflows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      toast({ title: t("booking_cancelled_success") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const selectPaymentPlan = useMutation({
    mutationFn: (plan: "full" | "two_stage" | "three_stage") =>
      apiRequest("POST", `/api/my-bookings/${bookingId}/payment-schedule/select-plan`, { plan }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "payment-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkout", bookingId] });
      setShowPlanDialog(false);
      toast({ title: t("toast_plan_update_success") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createManualPayment = useMutation({
    mutationFn: (data: { amount: number; receiptUrl: string; notes?: string }) =>
      apiRequest("POST", `/api/my-bookings/${bookingId}/payments`, {
        ...data,
        method: "bank_transfer",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings", bookingId, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "payment-schedule"] });
      setShowManualTransferDialog(false);
      setManualAmount("");
      setManualReceiptUrl("");
      setManualNotes("");
      toast({ title: t("toast_manual_payment_sent") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const [cancelReason, setCancelReason] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showPaidCancelWarning, setShowPaidCancelWarning] = useState(false);

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
  const departure = departures?.find((item) => item.id === booking.departureId);
  const tourTitle = tour ? (lt(tour, "title") || tour.title) : undefined;
  const destination = tour?.countries?.filter(Boolean).join(", ");
  const roomsNeeded = booking.roomAllocations && Array.isArray(booking.roomAllocations) && booking.roomAllocations.length > 0
    ? (booking.roomAllocations as any[]).reduce((sum, a) => sum + (Number(a.count) || 1), 0)
    : (booking.roomType === "triple" ? Math.max(1, Math.ceil((booking.partySizeExpected || 1) / 3)) : Math.max(1, Math.ceil((booking.partySizeExpected || 1) / 2)));
  const hasMissingTravelers = Array.isArray(travelers) && travelers.length < (booking.partySizeExpected || 1);
  const hasMissingPassportDetails = Array.isArray(travelers) && travelers.some((traveler) => !traveler.passportNumber);
  const hasPendingPayment = Array.isArray(pmts) && pmts.some((payment) => payment.status === "pending");

  const pricingSummary = (booking as any)?.pricingSummary;
  const totalPrice = Math.round(Number(pricingSummary?.total ?? booking?.totalPrice ?? 0));
  const totalPaid = Array.isArray(pmts)
    ? pmts.filter((p) => p.status === "paid").reduce((sum, p) => sum + (Number(p.amount) - Number(p.refundedAmount || 0)), 0)
    : 0;
  const remainingBalance = Math.max(0, totalPrice - totalPaid);
  const isFullyPaid = totalPaid >= totalPrice && totalPrice > 0;
  const progressPercent = totalPrice > 0 ? Math.min(100, Math.round((totalPaid / totalPrice) * 100)) : 0;
  const nextUnpaidSchedule = Array.isArray(schedule)
    ? schedule.find((s) => s.status !== "paid" && (parseFloat(s.amount) - parseFloat(s.paidAmount || "0")) > 0)
    : null;

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

    const invoiceBody: any[] = [
      ['Booking Code', booking.bookingCode],
      ['Tour ID', booking.tourId || "N/A"],
      ['Departure ID', booking.departureId || "N/A"],
      ['Departure City', booking.departureCity || "N/A"],
      ['Status', booking.status?.toUpperCase() || "SUBMITTED"],
      ['Party Size', booking.partySizeExpected !== undefined && booking.partySizeExpected !== null ? String(booking.partySizeExpected) : "1"],
    ];

    if (pricingSummary) {
      invoiceBody.push(['Subtotal', `$${Number(pricingSummary.subtotal).toLocaleString()} ${booking.currency || "USD"}`]);
      invoiceBody.push([`Taxes${pricingSummary.taxRate ? ` (${pricingSummary.taxRate}%)` : ""}`, `$${Number(pricingSummary.taxes).toLocaleString()} ${booking.currency || "USD"}`]);
      invoiceBody.push(['Service Fee', `$${Number(pricingSummary.fees).toLocaleString()} ${booking.currency || "USD"}`]);
    }
    invoiceBody.push(['Total Price', `$${totalPrice.toLocaleString()} ${booking.currency || "USD"}`]);

    autoTable(doc, {
      startY: 60,
      head: [['Field', 'Details']],
      body: invoiceBody,
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

  const downloadPaymentReceipt = (pmt: Payment) => {
    if (!booking) return;
    const doc = new jsPDF();

    // Header Blue Bar
    doc.setFillColor(17, 107, 176);
    doc.rect(0, 0, 210, 40, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("TOUROPS", 15, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("OFFICIAL PAYMENT RECEIPT & INVOICE", 15, 28);

    doc.setTextColor(255, 255, 255);
    doc.text(`Receipt #: REC-${pmt.id.slice(0, 8).toUpperCase()}`, 195, 20, { align: "right" });
    doc.text(`Date: ${pmt.createdAt ? new Date(pmt.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}`, 195, 28, { align: "right" });

    // Payment Summary Section
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(t("pdf_payment_details"), 15, 55);

    const pdfTableHead = language === "en" ? ["Item", "Details"] : language === "es" ? ["Ítem", "Detalles"] : ["Informasi", "Keterangan"];
    const pdfBookingCodeLabel = language === "en" ? "Booking Code" : language === "es" ? "Código de Reserva" : "Kode Booking";
    const pdfTourLabel = language === "en" ? "Tour Package" : language === "es" ? "Paquete Turístico" : "Paket Tur";
    const pdfCustomerLabel = language === "en" ? "Customer / Group" : language === "es" ? "Cliente / Grupo" : "Nama Pemesan";
    const pdfMethodLabel = language === "en" ? "Payment Method" : language === "es" ? "Método de Pago" : "Metode Pembayaran";
    const pdfDateLabel = language === "en" ? "Transaction Date" : language === "es" ? "Fecha de Transacción" : "Waktu Transaksi";
    const pdfStatusLabel = language === "en" ? "Payment Status" : language === "es" ? "Estado del Pago" : "Status Pembayaran";
    const pdfAmountLabel = language === "en" ? "Payment Amount" : language === "es" ? "Monto Pagado" : "Nominal Pembayaran";
    const pdfNotesLabel = language === "en" ? "Notes / Reference" : language === "es" ? "Notas / Referencia" : "Catatan / Keterangan";

    autoTable(doc, {
      startY: 60,
      head: [pdfTableHead],
      body: [
        [t("pdf_receipt_no"), `REC-${pmt.id.slice(0, 8).toUpperCase()}`],
        [pdfBookingCodeLabel, booking.bookingCode || "N/A"],
        [pdfTourLabel, tourTitle || "Tour Package"],
        [pdfCustomerLabel, booking.groupName || "Customer"],
        [pdfMethodLabel, (pmt.method || "online").replace(/_/g, " ").toUpperCase()],
        [pdfDateLabel, pmt.createdAt ? new Date(pmt.createdAt).toLocaleString() : "-"],
        [pdfStatusLabel, (pmt.status || "PAID").toUpperCase()],
        [pdfAmountLabel, `$${Number(pmt.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${pmt.currency || "USD"}`],
        [pdfNotesLabel, pmt.notes || (pmt.paymentIntentId ? `Ref: ${pmt.paymentIntentId}` : "-")],
      ],
      theme: "striped",
      headStyles: { fillColor: [240, 240, 240], textColor: [80, 80, 80], fontSize: 10 },
      styles: { fontSize: 10 },
    });

    // Booking Totals Context
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(t("pdf_booking_account_summary"), 15, (doc as any).lastAutoTable.finalY + 15);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [[t("pdf_total_tour_cost"), t("pdf_total_paid"), t("pdf_remaining_balance")]],
      body: [
        [
          `$${totalPrice.toLocaleString()} ${booking.currency || "USD"}`,
          `$${totalPaid.toLocaleString()} ${booking.currency || "USD"}`,
          `$${remainingBalance.toLocaleString()} ${booking.currency || "USD"}`,
        ],
      ],
      headStyles: { fillColor: [17, 107, 176], textColor: [255, 255, 255] },
      styles: { fontSize: 10, halign: "center" },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setTextColor(16, 185, 129); // Emerald
    doc.setFont("helvetica", "bold");
    doc.text(t("pdf_verified_stamp"), 15, finalY);

    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.setFont("helvetica", "normal");
      doc.text(t("pdf_thank_you_footer"), 105, 285, { align: "center" });
    }

    doc.save(`Invoice_Receipt_${booking.bookingCode}_${pmt.id.slice(0, 8)}.pdf`);
    toast({ title: t("toast_receipt_downloaded"), description: `Receipt #${pmt.id.slice(0, 8).toUpperCase()}` });
  };

  if (isLoading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  if (!booking) return <div className="p-6"><p className="text-muted-foreground">{t("booking_not_found")}</p></div>;

  const hasPaidPayment =
    (Array.isArray(pmts) && pmts.some((p) => p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded")) ||
    (Array.isArray(schedule) && schedule.some((s) => s.status === "paid" || Number(s.paidAmount || 0) > 0));

  const travelerDocs = Array.isArray(docs) ? docs.filter((d) => ["passport", "id_doc", "visa"].includes(d.docType)) : [];
  const fulfillmentDocs = Array.isArray(docs) ? docs.filter((d) => !["passport", "id_doc", "visa"].includes(d.docType)) : [];
  const getServiceStatusPresentation = (status?: string | null) => {
    switch (status) {
      case "completed":
        return {
          label: t("service_status_ready") || "Selesai",
          icon: CheckCircle,
          badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 font-medium",
        };
      case "in_progress":
      case "blocked":
        return {
          label: t("service_status_in_progress") || "Diproses",
          icon: Clock,
          badgeClass: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 font-medium",
        };
      case "cancelled":
        return {
          label: t("service_status_cancelled") || "Dibatalkan",
          icon: XCircle,
          badgeClass: "border-border bg-muted text-muted-foreground",
        };
      case "assigned":
      case "not_assigned":
      default:
        return {
          label: t("service_status_pending") || "Menunggu",
          icon: Clock,
          badgeClass: "border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 font-medium",
        };
    }
  };

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
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="outline" size="sm" onClick={downloadInvoice} className="h-8">
            <Printer className="h-4 w-4 mr-2" />
            {t("print_save_pdf")}
          </Button>
        </div>
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
          {booking.status !== "cancelled" && booking.status !== "completed" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (hasPaidPayment) {
                    setShowPaidCancelWarning(true);
                  } else {
                    setShowCancelDialog(true);
                  }
                }}
              >
                <XCircle className="h-3 w-3 mr-1" />{t("cancel_booking")}
              </Button>

              <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
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

              <Dialog open={showPaidCancelWarning} onOpenChange={setShowPaidCancelWarning}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 font-semibold text-lg">
                      <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                      <span>{t("cancel_booking")}</span>
                    </div>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t("paid_booking_cannot_cancel_desc")}
                    </p>
                  </div>
                  <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setShowPaidCancelWarning(false)}
                    >
                      {t("close")}
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setShowPaidCancelWarning(false);
                        setActiveTab("messages");
                      }}
                    >
                      <MessageSquare className="h-4 w-4 mr-1.5" />
                      {t("contact_support")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <Card className="border-primary/20" data-testid="card-booking-summary">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("trip_summary")}</p>
              <h2 className="text-xl font-semibold mt-1">{tourTitle || booking.groupName || t("trip_summary")}</h2>
              {destination && <p className="text-sm text-muted-foreground mt-1">{destination}</p>}
            </div>
            <Badge variant={booking.status === "confirmed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"}>
              {t(`booking_status_${booking.status || "submitted"}` as any)}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("booking_code")}</p>
              <p className="font-medium mt-0.5">{booking.bookingCode}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("type_label")}</p>
              <p className="font-medium mt-0.5">{t(`booking_type_${booking.bookingType}` as any)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("party_size")}</p>
              <p className="font-medium mt-0.5">{booking.partySizeExpected || 1}</p>
            </div>
            {booking.departureCity && (
              <div>
                <p className="text-xs text-muted-foreground">{t("departure_city") || "Departure City"}</p>
                <p className="font-medium mt-0.5">{booking.departureCity}</p>
              </div>
            )}
            {departure?.startDate && (
              <div>
                <p className="text-xs text-muted-foreground">{t("departure_date")}</p>
                <p className="font-medium mt-0.5">{new Date(departure.startDate).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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

      <Card data-testid="card-next-steps">
        <CardContent className="p-4 space-y-3">
          <h2 className="font-semibold text-sm">{t("next_steps")}</h2>
          {hasMissingTravelers ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {(booking.partySizeExpected || 1) - (travelers?.length || 0)} {t("travelers_still_needed")}
              </p>
              <Button size="sm" onClick={() => setActiveTab("travelers")}>{t("add_traveler")}</Button>
            </div>
          ) : hasMissingPassportDetails ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t("missing_passport_details")}</p>
              <Button size="sm" onClick={() => setActiveTab("documents")}>{t("upload_document")}</Button>
            </div>
          ) : hasPendingPayment ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{t("payment_pending")}</p>
              <Button size="sm" onClick={() => setActiveTab("payments")}>{t("payments")}</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("no_next_steps")}</p>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview"><Eye className="h-3.5 w-3.5 mr-1" />{t("tab_overview")}</TabsTrigger>
          {isLeaderGroup && (
            <TabsTrigger value="group" data-testid="tab-group"><Users className="h-3.5 w-3.5 mr-1" />{t("tab_group")}</TabsTrigger>
          )}
          <TabsTrigger value="travelers" data-testid="tab-customer-travelers"><Users className="h-3.5 w-3.5 mr-1" />{t("tab_travelers")}</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents"><FileText className="h-3.5 w-3.5 mr-1" />{t("tab_documents")}</TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-customer-messages"><MessageSquare className="h-3.5 w-3.5 mr-1" />{t("tab_messages")}</TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments"><CreditCard className="h-3.5 w-3.5 mr-1" />{t("tab_payments")}</TabsTrigger>
          <TabsTrigger value="changes" data-testid="tab-changes"><AlertTriangle className="h-3.5 w-3.5 mr-1" />{t("lc_tab_change_requests")}</TabsTrigger>
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
                  {tourTitle && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("trip_summary")}</span>
                      <span className="text-right max-w-[200px]">{tourTitle}</span>
                    </div>
                  )}
                  {destination && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("destination")}</span>
                      <span className="text-right max-w-[200px]">{destination}</span>
                    </div>
                  )}
                  {booking.departureCity && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("departure_city") || "Departure"}</span>
                      <span className="text-right font-medium max-w-[200px]">{booking.departureCity}</span>
                    </div>
                  )}
                  {departure?.startDate && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{t("departure_date")}</span>
                      <span>{new Date(departure.startDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 items-center">
                    <span className="text-muted-foreground">{t("status")}</span>
                    <Badge variant={booking.status === "confirmed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"}>
                      {t(`booking_status_${booking.status || "submitted"}` as any)}
                    </Badge>
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
                    <>
                      {pricingSummary ? (
                        <>
                          <div className="flex justify-between gap-2 text-xs text-muted-foreground pt-1 border-t">
                            <span>{t("subtotal")}</span>
                            <span>${Number(pricingSummary.subtotal).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                            <span>{t("taxes")}{pricingSummary.taxRate ? ` (${pricingSummary.taxRate}%)` : ""}</span>
                            <span>${Number(pricingSummary.taxes).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                            <span>{t("service_fees")}</span>
                            <span>${Number(pricingSummary.fees).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between gap-2 pt-1 border-t font-semibold">
                            <span>{t("total_price")}</span>
                            <span className="font-bold text-primary">${totalPrice.toLocaleString()}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{t("total_price")}</span>
                          <span className="font-medium">${totalPrice.toLocaleString()}</span>
                        </div>
                      )}
                    </>
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

            {/* Accommodation & Hotel Details */}
            {((tourHotels && tourHotels.length > 0) || booking.roomType) && (
              <Card className="md:col-span-2 border-primary/20 bg-muted/10" data-testid="card-booking-accommodation-info">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                    <h3 className="font-semibold text-sm flex items-center gap-1.5">
                      <Hotel className="h-4 w-4 text-primary" />
                      {t("accommodation_details")}
                    </h3>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="gap-1">
                        <Bed className="h-3 w-3" />
                        {roomsNeeded} {t("rooms_summary")} ({booking.roomType ? t((booking.roomType === "matrimonial" ? "room_matrimonial" : booking.roomType === "doble" ? "room_double" : "room_triple") as any) : "Standard"})
                      </Badge>
                      {departure?.startDate && (
                        <span className="text-muted-foreground">
                          {format(new Date(departure.startDate), "dd MMM")} - {departure.endDate ? format(new Date(departure.endDate), "dd MMM yyyy") : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {tourHotels && tourHotels.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {tourHotels.map((h: any) => (
                        <div key={h.id} className="p-3 rounded-lg border bg-background/80 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-sm text-foreground">{h.name}</span>
                            {h.starRating && (
                              <span className="text-amber-500 font-medium">{"★".repeat(h.starRating)}</span>
                            )}
                          </div>
                          {h.address && (
                            <p className="text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3 shrink-0" /> {h.address}
                            </p>
                          )}
                          {(h.contactPhone || h.contactEmail) && (
                            <div className="flex flex-wrap items-center gap-3 pt-1 text-muted-foreground border-t">
                              {h.contactPhone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {h.contactPhone}</span>}
                              {h.contactEmail && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {h.contactEmail}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">{t("no_hotels_assigned_tour")}</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {workflows && workflows.length > 0 && (() => {
            const isLandOnly = Boolean(booking?.departureCity && booking.departureCity.toLowerCase().includes("land only"));
            const displayedWorkflows = workflows.filter((wf) => !(isLandOnly && wf.serviceType === "airline"));
            if (displayedWorkflows.length === 0) return null;
            const completedServiceCount = displayedWorkflows.filter((wf) => wf.status === "completed").length;
            const destination = tour?.countries?.filter(Boolean).join(", ");

            return (
              <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.04] via-background to-background shadow-sm" data-testid="section-service-status">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-semibold text-base">{t("service_status")}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{t("service_status_summary")}</p>
                    </div>
                    <div className="rounded-full border bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
                      <span className="font-semibold text-foreground">{completedServiceCount}/{displayedWorkflows.length}</span>{" "}
                      <span>{t("services_completed")}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    {displayedWorkflows.map((wf) => {
                      const presentation = getServiceStatusPresentation(wf.status);
                      const ServiceIcon = SERVICE_ICONS[wf.serviceType] || Workflow;
                      const StatusIcon = presentation.icon;

                      return (
                        <Card key={wf.id} className="border-border/70 bg-card hover:bg-accent/5 transition-colors shadow-xs" data-testid={`card-service-status-${wf.id}`}>
                          <CardContent className="p-3.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                  <ServiceIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">{t(`service_type_${wf.serviceType}` as any)}</p>
                                  {wf.updatedAt && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                      {t("updated_label")} {new Date(wf.updatedAt).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Badge variant="outline" className={`shrink-0 gap-1.5 py-0.5 px-2.5 text-xs ${presentation.badgeClass}`}>
                                <StatusIcon className="h-3.5 w-3.5" />
                                {presentation.label}
                              </Badge>
                            </div>

                            {wf.serviceType === "airline" && (
                              <div className="mt-3 p-3 bg-sky-500/10 rounded-md border border-sky-500/20 text-xs space-y-1.5" data-testid="airline-workflow-service-info">
                                <div className="flex items-center gap-2 font-medium text-sky-800 dark:text-sky-300">
                                  <Plane className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                  <span>
                                    {booking.departureCity || "Jakarta (CGK)"} &rarr; {destination || (tour ? lt(tour, "title") : "Destinasi Tour")}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                                  {departure?.startDate && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {format(new Date(departure.startDate), "dd MMM")} - {departure.endDate ? format(new Date(departure.endDate), "dd MMM yyyy") : ""}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Ticket className="h-3 w-3" />
                                    {booking.partySizeExpected || 1} Tiket (Pax)
                                  </span>
                                </div>
                              </div>
                            )}

                            {wf.serviceType === "hotel" && (
                              <div className="mt-3 p-3 bg-muted/30 rounded-md border text-xs space-y-1.5" data-testid="hotel-workflow-service-info">
                                <div className="flex items-center gap-2 font-medium text-foreground">
                                  <Hotel className="h-3.5 w-3.5 text-primary" />
                                  <span>{tourHotels && tourHotels.length > 0 ? tourHotels.map((h: any) => h.name).join(", ") : t("hotel_information")}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Bed className="h-3 w-3" />
                                    {roomsNeeded} {t("rooms_summary")} ({booking.roomType ? t((booking.roomType === "matrimonial" ? "room_matrimonial" : booking.roomType === "doble" ? "room_double" : "room_triple") as any) : "Standard"})
                                  </span>
                                  {departure?.startDate && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {format(new Date(departure.startDate), "dd MMM")} - {departure.endDate ? format(new Date(departure.endDate), "dd MMM yyyy") : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
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
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">{travelers?.length || 0} {t("of_label")} {booking.partySizeExpected} {t("travelers_added_suffix")}</p>
              {(travelers?.length || 0) >= (booking.partySizeExpected || 1) && (
                <Badge variant="secondary" className="text-xs">Kuota Penuh</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
            <Link href="/manage-passengers">
              <Button size="sm" variant="outline" data-testid="button-manage-travelers">
                <Users className="h-4 w-4 mr-1" />{t("manage_passengers")}
              </Button>
            </Link>
            {(travelers?.length || 0) >= (booking.partySizeExpected || 1) ? (
              <Button size="sm" disabled data-testid="button-add-traveler-disabled">
                <Plus className="h-4 w-4 mr-1" />{t("add_traveler")}
              </Button>
            ) : (
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
            )}
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
                    <Label>{t("file_upload_optional_label")}</Label>
                    <Input
                      type="file"
                      accept=".pdf,image/*"
                      disabled={isUploadingDoc}
                      onChange={handleDocumentUpload}
                      data-testid="input-doc-file-upload"
                    />
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
                    disabled={!docFileName || !docFileUrl || uploadDoc.isPending || isUploadingDoc}
                    data-testid="button-submit-doc"
                  >
                    {uploadDoc.isPending || isUploadingDoc ? t("uploading") : t("upload_label")}
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

        <TabsContent value="payments" className="mt-4 space-y-5">
          {/* 1. Ringkasan Pembayaran & Progress */}
          {booking.totalPrice != null && (
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-base">{t("payment_status")}</h3>
                    <p className="text-xs text-muted-foreground">{t("billing_status_summary")}</p>
                  </div>
                  <div>
                    {isFullyPaid ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-medium flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {t("bill_fully_paid_badge")}
                      </Badge>
                    ) : totalPaid > 0 ? (
                      <Badge className="bg-amber-500 hover:bg-amber-500 text-white font-medium">
                        {t("partially_paid")} ({progressPercent}%)
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="font-medium">
                        {t("unpaid")}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div className="p-3.5 rounded-lg bg-muted/40 border border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-muted-foreground font-medium mb-1">{t("total_amount")}</p>
                    <p className="text-xl sm:text-2xl font-bold">${totalPrice.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium mb-1">{t("paid_amount_label")}</p>
                    <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">${totalPaid.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-muted-foreground font-medium mb-1">{t("remaining_balance_label")}</p>
                    <p className={`text-xl sm:text-2xl font-bold ${remainingBalance > 0 ? "text-primary" : "text-muted-foreground"}`}>
                      ${remainingBalance.toLocaleString()}
                    </p>
                  </div>
                </div>

                {pricingSummary && (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground bg-muted/30 px-3.5 py-2 rounded-md border border-slate-100 dark:border-slate-800">
                    <span className="font-medium text-foreground">{t("order_summary")}:</span>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <span>{t("subtotal")}: <strong className="text-foreground">${Number(pricingSummary.subtotal).toLocaleString()}</strong></span>
                      <span>{t("taxes")}{pricingSummary.taxRate ? ` (${pricingSummary.taxRate}%)` : ""}: <strong className="text-foreground">${Number(pricingSummary.taxes).toLocaleString()}</strong></span>
                      <span>{t("service_fees")}: <strong className="text-foreground">${Number(pricingSummary.fees).toLocaleString()}</strong></span>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs text-muted-foreground font-medium">
                    <span>{t("payment_progress_label")}</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <Progress value={progressPercent} className="h-2.5" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* 2. Action Card: Lunas vs Bayar Online */}
          {isFullyPaid ? (
            <Card className="border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-sm">
              <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
                <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-emerald-600 dark:text-emerald-300 shrink-0">
                  <CheckCircle className="h-8 w-8" />
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="font-bold text-lg text-emerald-950 dark:text-emerald-100">{t("bill_fully_paid_title")}</h4>
                  <p className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-300">
                    {t("bill_fully_paid_desc")}
                  </p>
                </div>
                <div className="shrink-0 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-emerald-300 hover:bg-emerald-100 text-emerald-900 dark:text-emerald-100 font-semibold"
                    onClick={downloadInvoice}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t("download_e_invoice_btn")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-primary/20 bg-primary/5 shadow-sm">
              <CardContent className="p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2 text-primary font-bold">
                    <CreditCard className="h-5 w-5" />
                    <span>{t("instant_online_payment_title")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    {t("checkout_online_desc")}
                  </p>
                </div>
                <div className="w-full md:w-auto shrink-0">
                  <Link href={nextUnpaidSchedule ? `/checkout/${booking.id}?installmentId=${nextUnpaidSchedule.id}` : `/checkout/${booking.id}`}>
                    <Button
                      size="lg"
                      className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-md px-6"
                      data-testid="button-pay-online"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      {nextUnpaidSchedule
                        ? `${t("pay_installment")} #${nextUnpaidSchedule.installmentNumber} ($${Math.max(0, parseFloat(nextUnpaidSchedule.amount) - parseFloat(nextUnpaidSchedule.paidAmount || "0")).toLocaleString()})`
                        : `${t("pay_online_now")} ($${remainingBalance.toLocaleString()})`}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. Self-Service Installment Plan Selection (Jika belum ada pembayaran) */}
          {totalPaid === 0 && booking.status !== "cancelled" && (
            <Card className="border-slate-200 dark:border-slate-800 bg-muted/20">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-primary" />
                    {t("payment_scheme_title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Array.isArray(schedule) && schedule.length > 1
                      ? `${t("payment_scheme_current_installments_prefix")} ${schedule.length} ${t("payment_scheme_current_installments_suffix")}`
                      : t("payment_scheme_current_full")}
                  </p>
                </div>
                <div>
                  <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        {t("choose_change_scheme_btn")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>{t("choose_payment_scheme_modal_title")}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          {t("choose_payment_scheme_modal_desc")}
                        </p>

                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => selectPaymentPlan.mutate("full")}
                            disabled={selectPaymentPlan.isPending}
                            className="w-full text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-primary hover:bg-primary/5 transition-colors space-y-1"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-sm">{t("plan_full_title")}</span>
                              <Badge variant="outline" className="text-xs">{t("plan_full_badge")}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("plan_full_desc")}
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => selectPaymentPlan.mutate("two_stage")}
                            disabled={selectPaymentPlan.isPending}
                            className="w-full text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-primary hover:bg-primary/5 transition-colors space-y-1"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-sm">{t("plan_2_stage_title")}</span>
                              <Badge variant="secondary" className="text-xs">{t("plan_2_stage_badge")}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("plan_2_stage_desc")}
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => selectPaymentPlan.mutate("three_stage")}
                            disabled={selectPaymentPlan.isPending}
                            className="w-full text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-primary hover:bg-primary/5 transition-colors space-y-1"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-sm">{t("plan_3_stage_title")}</span>
                              <Badge variant="secondary" className="text-xs">{t("plan_3_stage_badge")}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t("plan_3_stage_desc")}
                            </p>
                          </button>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowPlanDialog(false)}>{t("close_dialog")}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 4. Rekening Bank Transfer Manual & Konfirmasi */}
          {!isFullyPaid && (
            <Card className="border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <div>
                      <h4 className="font-semibold text-sm">{t("manual_bank_transfer_title")}</h4>
                      <p className="text-xs text-muted-foreground">{t("manual_bank_transfer_desc")}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    onClick={() => {
                      if (!manualAmount) setManualAmount(remainingBalance.toString());
                      setShowManualTransferDialog(true);
                    }}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    + {t("confirm_manual_transfer_btn")}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Bank BCA</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => copyToClipboard("8830192888", "Nomor Rekening BCA")}
                      >
                        <Copy className="h-3 w-3 mr-1" /> {t("copy_button")}
                      </Button>
                    </div>
                    <p className="font-mono font-bold text-sm">8830-192-888</p>
                    <p className="text-[11px] text-muted-foreground">a/n PT TourOps Indonesia</p>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Bank Mandiri</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => copyToClipboard("1370019882999", "Nomor Rekening Mandiri")}
                      >
                        <Copy className="h-3 w-3 mr-1" /> {t("copy_button")}
                      </Button>
                    </div>
                    <p className="font-mono font-bold text-sm">137-00-1988-2999</p>
                    <p className="text-[11px] text-muted-foreground">a/n PT TourOps Indonesia</p>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-blue-100 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t("transfer_notes_title")}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => copyToClipboard(booking.bookingCode, "Kode Booking")}
                      >
                        <Copy className="h-3 w-3 mr-1" /> {t("copy_button")}
                      </Button>
                    </div>
                    <p className="font-mono font-bold text-sm">{booking.bookingCode}</p>
                    <p className="text-[11px] text-muted-foreground">{t("transfer_notes_required_msg")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dialog Konfirmasi Pembayaran Transfer Manual */}
          <Dialog open={showManualTransferDialog} onOpenChange={setShowManualTransferDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("manual_transfer_dialog_title")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>{t("transfer_amount_usd")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="500"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t("current_remaining_balance")} ${remainingBalance.toLocaleString()}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("upload_receipt_screenshot")}</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleManualReceiptUpload}
                      disabled={isUploadingManualReceipt}
                      className="cursor-pointer text-xs"
                    />
                    {isUploadingManualReceipt && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
                  </div>
                  {manualReceiptUrl && (
                    <div className="mt-2 p-2 bg-muted/30 border rounded-md">
                      <p className="text-[10px] text-muted-foreground mb-1 text-center font-medium">{t("receipt_preview_label")}</p>
                      <img src={manualReceiptUrl} alt="Receipt Preview" className="mx-auto rounded max-h-36 object-contain" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>{t("notes_ref_optional")}</Label>
                  <Textarea
                    placeholder={t("notes_ref_placeholder")}
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowManualTransferDialog(false)}>{t("cancel")}</Button>
                <Button
                  onClick={() => {
                    const amt = parseFloat(manualAmount);
                    if (!amt || amt <= 0) {
                      toast({ title: t("enter_valid_transfer_amount"), variant: "destructive" });
                      return;
                    }
                    if (!manualReceiptUrl) {
                      toast({ title: t("please_upload_receipt"), variant: "destructive" });
                      return;
                    }
                    createManualPayment.mutate({
                      amount: amt,
                      receiptUrl: manualReceiptUrl,
                      notes: manualNotes,
                    });
                  }}
                  disabled={createManualPayment.isPending || isUploadingManualReceipt || !manualReceiptUrl}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  {createManualPayment.isPending ? t("sending_confirmation") : t("send_confirmation")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 5. Jadwal Pembayaran (Installments Schedule) */}
          {Array.isArray(schedule) && schedule.length > 0 && (
            <div className="space-y-2 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("payment_schedule_title")}</h3>
                <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                  {t("includes_tax_and_fees")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">{t("installment_tax_fee_note")}</p>
              {schedule.map((inst) => {
                const now = new Date();
                const due = new Date(inst.dueDate);
                const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86400000);
                const isOverdue = inst.status === "late" || (inst.status !== "paid" && inst.status !== "cancelled" && due < now);
                const isDueSoon = !isOverdue && inst.status !== "paid" && inst.status !== "cancelled" && daysUntil <= 7 && daysUntil >= 0;
                const remaining = Math.max(0, parseFloat(inst.amount) - parseFloat(inst.paidAmount));
                return (
                  <Card
                    key={inst.id}
                    className={isOverdue ? "border-destructive/60 bg-destructive/5" : isDueSoon ? "border-amber-400/60 bg-amber-50/50 dark:bg-amber-900/10" : ""}
                    data-testid={`card-schedule-${inst.id}`}
                  >
                    <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {isOverdue ? (
                          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                        ) : isDueSoon ? (
                          <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        ) : (
                          <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-sm">
                            {t("schedule_installment")} #{inst.installmentNumber}: {localizeScheduleLabel(inst.label, inst.installmentNumber, inst.percentage, language)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("schedule_due_date")}: {due.toLocaleDateString()}
                            {isOverdue && daysUntil < 0 && <span className="ml-2 text-destructive font-semibold">({Math.abs(daysUntil)} {t("schedule_days_overdue")})</span>}
                            {isDueSoon && <span className="ml-2 text-amber-600 font-semibold">({daysUntil} {t("schedule_days_until_due")})</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("schedule_amount_due")}: {inst.currency} {parseFloat(inst.amount).toFixed(2)}
                            {parseFloat(inst.paidAmount) > 0 && (
                              <> · {t("schedule_amount_paid")}: {inst.currency} {parseFloat(inst.paidAmount).toFixed(2)} · {t("schedule_remaining")}: {inst.currency} {remaining.toFixed(2)}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {inst.status !== "paid" && inst.status !== "cancelled" && remaining > 0 && (
                          <Link href={`/checkout/${booking.id}?installmentId=${inst.id}`}>
                            <Button size="sm" className="h-7 text-xs font-semibold bg-primary hover:bg-primary/90">
                              {t("pay_installment")} (${remaining.toFixed(2)})
                            </Button>
                          </Link>
                        )}
                        {isOverdue ? (
                          <Badge variant="destructive" data-testid={`badge-schedule-status-${inst.id}`}>{t("schedule_overdue_flag")}</Badge>
                        ) : isDueSoon ? (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">{t("schedule_due_soon")}</Badge>
                        ) : inst.status === "paid" ? (
                          <Badge variant="default" data-testid={`badge-schedule-status-${inst.id}`}><CheckCircle className="h-3 w-3 mr-1" />{t("schedule_status_paid")}</Badge>
                        ) : inst.status === "partially_paid" ? (
                          <Badge variant="secondary" data-testid={`badge-schedule-status-${inst.id}`}>{t("schedule_status_partially_paid")}</Badge>
                        ) : inst.status === "cancelled" ? (
                          <Badge variant="outline" data-testid={`badge-schedule-status-${inst.id}`}>{t("schedule_status_cancelled")}</Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-schedule-status-${inst.id}`}>{t("schedule_status_pending")}</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* 6. Riwayat Pembayaran (Payment Records) */}
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("payment_records")}</h3>
            {pmts && pmts.length > 0 ? (
              <div className="space-y-2">
                {pmts.map((pmt) => (
                  <Card key={pmt.id} data-testid={`card-payment-${pmt.id}`}>
                    <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">${Number(pmt.amount).toFixed(2)} {pmt.currency}</p>
                        <p className="text-xs text-muted-foreground">
                          {pmt.method?.replace(/_/g, " ")} • {pmt.createdAt ? new Date(pmt.createdAt).toLocaleDateString() : ""}
                        </p>
                        {pmt.notes && <p className="text-xs text-muted-foreground mt-1">{pmt.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={pmt.status === "paid" ? "default" : "secondary"}>
                          {pmt.status === "paid" && <CheckCircle className="h-3 w-3 mr-1" />}
                          {pmt.status || t("pending_label")}
                        </Badge>
                        {pmt.status === "paid" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs font-medium border-primary/30 text-primary hover:bg-primary/5"
                            onClick={() => downloadPaymentReceipt(pmt)}
                            title={t("download_receipt_title")}
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            {t("download_invoice")}
                          </Button>
                        )}
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
          </div>
        </TabsContent>

        <TabsContent value="changes" className="mt-4 space-y-4">
          {bookingId && <ChangeRequestsSection bookingId={bookingId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChangeRequestsSection({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [requestType, setRequestType] = useState("other");
  const [details, setDetails] = useState("");
  const [paxDelta, setPaxDelta] = useState("");

  const { data: requests } = useQuery<any[]>({ queryKey: [`/api/bookings/${bookingId}/change-requests`] });

  const submit = useMutation({
    mutationFn: () => apiRequest("POST", `/api/my-bookings/${bookingId}/change-requests`, {
      requestType,
      details,
      paxDelta: (requestType === "add_passengers" || requestType === "remove_passengers") && paxDelta ? parseInt(paxDelta) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}/change-requests`] });
      setOpen(false); setDetails(""); setPaxDelta(""); setRequestType("other");
      toast({ title: t("lc_request_submitted") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const needsPax = requestType === "add_passengers" || requestType === "remove_passengers";

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t("lc_my_change_requests")}</h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-request-change"><Plus className="h-4 w-4 mr-1" />{t("lc_request_change")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("lc_request_change")}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t("lc_request_type")}</Label>
                  <Select value={requestType} onValueChange={setRequestType}>
                    <SelectTrigger data-testid="select-request-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add_passengers">{t("lc_req_add_passengers")}</SelectItem>
                      <SelectItem value="remove_passengers">{t("lc_req_remove_passengers")}</SelectItem>
                      <SelectItem value="date_change">{t("lc_req_date_change")}</SelectItem>
                      <SelectItem value="other">{t("lc_req_other")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {needsPax && (
                  <div>
                    <Label>{t("lc_pax_delta")}</Label>
                    <Input type="number" value={paxDelta} onChange={(e) => setPaxDelta(e.target.value)} data-testid="input-pax-delta" />
                  </div>
                )}
                <div>
                  <Label>{t("lc_details")}</Label>
                  <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} data-testid="input-change-details" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
                <Button onClick={() => submit.mutate()} disabled={!details.trim() || submit.isPending} data-testid="button-submit-change">{t("lc_submit_request")}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {!requests?.length ? (
          <p className="text-sm text-muted-foreground">{t("lc_no_change_requests")}</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="rounded-md border p-3 space-y-1" data-testid={`my-change-request-${r.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="capitalize">{r.requestType?.replace("_", " ")}</Badge>
                  <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{r.status}</Badge>
                </div>
                <p className="text-sm">{r.details}</p>
                {r.resolutionNotes && <p className="text-xs text-muted-foreground">{r.resolutionNotes}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
