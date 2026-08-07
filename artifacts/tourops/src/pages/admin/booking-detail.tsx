import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  Users, FileText, Workflow, MessageSquare, CreditCard,
  ClipboardList, ArrowLeft, CheckCircle, Clock, AlertTriangle,
  Send, Plane, Hotel, Bus, UserCheck, Ticket, Plus, Pencil,
  Trash2, Eye, ShieldCheck, ShieldX, Info, DollarSign,
  ExternalLink, Download, Printer, Globe
} from "lucide-react";
import { Link } from "wouter";
import { BOOKING_TYPES, BOOKING_STATUSES, FULFILLMENT_STATUSES, SERVICE_TYPES, WORKFLOW_STATUSES, SERVICE_WORKFLOW_STEPS } from "@/lib/constants";
import type { Booking, Traveler, BookingAssignment, BookingWorkflow, WorkflowStep, Document, Message, Payment, UserProfile, BookingServiceRequest, BookingPaymentSchedule } from "@workspace/db";
import { useState } from "react";
import { DocumentPreview } from "@/components/DocumentPreview";

const serviceIcons: Record<string, any> = {
  airline: Plane, hotel: Hotel, transport: Bus, guide: UserCheck, sights: Ticket,
};

const DOC_TYPES: Record<string, string> = {
  passport: "Passport",
  id_doc: "ID Document",
  visa: "Visa",
  eticket: "E-Ticket",
  pnr: "PNR",
  hotel_confirm: "Hotel Confirmation",
  voucher: "Voucher",
  transport_confirm: "Transport Confirmation",
  guide_confirm: "Guide Confirmation",
  sight_ticket: "Sight Ticket",
  quote: "Quote",
  receipt: "Receipt",
  other: "Other",
};

const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  card: "Card",
  cash: "Cash",
  other: "Other",
};

const PAYMENT_STATUSES: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

export default function AdminBookingDetail() {
  const [, params] = useRoute("/admin/bookings/:id");
  const { toast } = useToast();
  const { t } = useLanguage();
  const bookingId = params?.id;

  const [internalNotes, setInternalNotes] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [msgVisibility, setMsgVisibility] = useState("customer_visible");
  const [assignService, setAssignService] = useState("");
  const [assignCountry, setAssignCountry] = useState("");
  const [assignUser, setAssignUser] = useState("");

  const [showAddTraveler, setShowAddTraveler] = useState(false);
  const [editTravelerId, setEditTravelerId] = useState<string | null>(null);
  const [travelerForm, setTravelerForm] = useState({
    firstName: "", lastName: "", dob: "", nationality: "", passportNumber: "",
    passportExpiry: "", gender: "", specialNeeds: "",
  });

  const [docForm, setDocForm] = useState({ docType: "", fileName: "", fileUrl: "", travelerId: "", workflowStepId: "" });
  const [showAddDoc, setShowAddDoc] = useState(false);

  const [paymentForm, setPaymentForm] = useState({ amount: "", currency: "USD", method: "bank_transfer", notes: "", invoiceId: "" });
  const [showAddPayment, setShowAddPayment] = useState(false);

  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "", amount: "", currency: "USD", dueDate: "", notes: "" });
  const [showAddInvoice, setShowAddInvoice] = useState(false);

  // Service request form
  const [showCreateSR, setShowCreateSR] = useState(false);
  const [srForm, setSrForm] = useState({
    serviceType: "", supplierUserId: "", serviceDate: "", quantity: "1",
    paxCount: "", agreedRate: "", location: "", notesForSupplier: "",
  });

  // Payment schedule
  const [showGenerateSchedule, setShowGenerateSchedule] = useState(false);
  const [scheduleInstallments, setScheduleInstallments] = useState([
    { label: "Deposit", percentage: 20, dueDate: "" },
    { label: "Second Payment", percentage: 30, dueDate: "" },
    { label: "Third Payment", percentage: 30, dueDate: "" },
    { label: "Final Payment", percentage: 20, dueDate: "" },
  ]);
  const [recordingPaymentId, setRecordingPaymentId] = useState<string | null>(null);
  const [recordPaymentAmount, setRecordPaymentAmount] = useState("");

  const { data: booking, isLoading } = useQuery<Booking>({ queryKey: ["/api/bookings", bookingId] });
  const { data: travelers } = useQuery<Traveler[]>({ queryKey: ["/api/bookings", bookingId, "travelers"] });
  const { data: assignments } = useQuery<BookingAssignment[]>({ queryKey: ["/api/bookings", bookingId, "assignments"] });
  const { data: workflows } = useQuery<BookingWorkflow[]>({ queryKey: ["/api/bookings", bookingId, "workflows"] });
  const { data: documents } = useQuery<Document[]>({ queryKey: ["/api/bookings", bookingId, "documents"] });
  const { data: currentUserProfile } = useQuery<UserProfile>({ queryKey: ["/api/user-profile"] });
  const isAdmin = currentUserProfile?.role === "admin" || currentUserProfile?.role === "super_admin";
  const currentRole = currentUserProfile?.role;
  const isOps = isAdmin || currentRole === "operations_manager";
  const isFinanceOps = isOps || currentRole === "accounting";
  const isScheduleViewer = isFinanceOps || currentRole === "support_agent";

  const { data: messages } = useQuery<Message[]>({ 
    queryKey: ["/api/bookings", bookingId, "messages"],
    enabled: !!bookingId && isAdmin
  });
  const { data: payments } = useQuery<Payment[]>({ 
    queryKey: ["/api/bookings", bookingId, "payments"],
    enabled: !!bookingId && isAdmin
  });
  const { data: allUsers } = useQuery<UserProfile[]>({ queryKey: ["/api/user-profiles"] });
  const { data: auditLogs } = useQuery<any[]>({ 
    queryKey: ["/api/audit-logs", "booking", bookingId],
    enabled: !!bookingId && isAdmin 
  });
  const { data: invoices } = useQuery<any[]>({ 
    queryKey: ["/api/bookings", bookingId, "invoices"],
    enabled: !!bookingId && isAdmin 
  });
  const { data: serviceRequests } = useQuery<BookingServiceRequest[]>({
    queryKey: ["/api/bookings", bookingId, "service-requests"],
    enabled: !!bookingId && isOps,
  });
  const { data: paymentSchedule } = useQuery<BookingPaymentSchedule[]>({
    queryKey: ["/api/bookings", bookingId, "payment-schedule"],
    enabled: !!bookingId && isScheduleViewer,
  });

  const updateBooking = useMutation({
    mutationFn: (data: Record<string, any>) => apiRequest("PATCH", `/api/bookings/${bookingId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: t("booking_updated") });
    },
  });

  const createTraveler = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/bookings/${bookingId}/travelers`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "travelers"] });
      toast({ title: t("traveler_added") });
      setShowAddTraveler(false);
      resetTravelerForm();
    },
  });

  const updateTraveler = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/travelers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "travelers"] });
      toast({ title: t("traveler_updated") });
      setEditTravelerId(null);
      resetTravelerForm();
    },
  });

  const deleteTraveler = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/travelers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "travelers"] });
      toast({ title: t("traveler_removed") });
    },
  });

  const createAssignment = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/bookings/${bookingId}/assignments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "assignments"] });
      toast({ title: t("assignment_created") });
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/assignments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "assignments"] });
      toast({ title: t("assignment_removed") });
    },
  });

  const createDocument = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/bookings/${bookingId}/documents`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "documents"] });
      toast({ title: t("document_added") });
      setShowAddDoc(false);
      setDocForm({ docType: "", fileName: "", fileUrl: "", travelerId: "", workflowStepId: "" });
    },
  });

  const updateDocument = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/documents/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "documents"] });
      toast({ title: t("document_status_updated") });
    },
  });

  const sendMessage = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/bookings/${bookingId}/messages`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "messages"] });
      setNewMessage("");
      toast({ title: t("message_sent") });
    },
  });

  const createPayment = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/bookings/${bookingId}/payments`, {
      ...data,
      amount: Math.round(parseFloat(data.amount) * 100)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "invoices"] });
      toast({ title: t("payment_added") });
      setShowAddPayment(false);
      setPaymentForm({ amount: "", currency: "USD", method: "bank_transfer", notes: "", invoiceId: "" });
    },
  });

  const createInvoice = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/bookings/${bookingId}/invoices`, {
      ...data,
      amount: Math.round(parseFloat(data.amount) * 100)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "invoices"] });
      toast({ title: t("invoice_created") });
      setShowAddInvoice(false);
      setInvoiceForm({ invoiceNumber: "", amount: "", currency: "USD", dueDate: "", notes: "" });
    },
  });

  const updatePayment = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/payments/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
      toast({ title: t("payment_status_updated") });
    },
  });

  const createServiceRequest = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/bookings/${bookingId}/service-requests`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "service-requests"] });
      toast({ title: t("ops_sr_created") });
      setShowCreateSR(false);
      setSrForm({ serviceType: "", supplierUserId: "", serviceDate: "", quantity: "1", paxCount: "", agreedRate: "", location: "", notesForSupplier: "" });
    },
    onError: (e: any) => toast({ title: e?.message || "Error", variant: "destructive" }),
  });

  const patchSRStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/service-requests/${id}/status`, { status }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "service-requests"] });
      toast({ title: vars.status === "sent" ? t("ops_sr_sent") : t("ops_sr_cancelled") });
    },
    onError: (e: any) => toast({ title: e?.message || "Error", variant: "destructive" }),
  });

  const generateSchedule = useMutation({
    mutationFn: (installments: any[]) =>
      apiRequest("POST", `/api/bookings/${bookingId}/payment-schedule/generate`, { installments }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "payment-schedule"] });
      toast({ title: t("ops_ps_generated") });
      setShowGenerateSchedule(false);
    },
    onError: (e: any) => toast({ title: e?.message || "Error", variant: "destructive" }),
  });

  const recordPayment = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) =>
      apiRequest("PATCH", `/api/payment-schedule/${id}/record-payment`, { amount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "payment-schedule"] });
      toast({ title: t("ops_ps_payment_recorded") });
      setRecordingPaymentId(null);
      setRecordPaymentAmount("");
    },
    onError: (e: any) => toast({ title: e?.message || "Error", variant: "destructive" }),
  });

  function resetTravelerForm() {
    setTravelerForm({
      firstName: "", lastName: "", dob: "", nationality: "", passportNumber: "",
      passportExpiry: "", gender: "", specialNeeds: "",
    });
  }

  function openEditTraveler(t: Traveler) {
    setEditTravelerId(t.id);
    setTravelerForm({
      firstName: t.firstName || "",
      lastName: t.lastName || "",
      dob: t.dob || "",
      nationality: t.nationality || "",
      passportNumber: t.passportNumber || "",
      passportExpiry: t.passportExpiry || "",
      gender: t.gender || "",
      specialNeeds: t.specialNeeds || "",
    });
  }

  function getUserName(userId: string | null) {
    if (!userId || !allUsers) return t("unassigned");
    const u = allUsers.find((x) => x.userId === userId);
    return u?.companyName || u?.userId || userId;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!booking) {
    return <div className="p-6"><p className="text-muted-foreground">Booking not found</p></div>;
  }

  const missingDocsCount = travelers?.filter((t) => {
    const travelerDocs = documents?.filter((d) => d.travelerId === t.id);
    return !travelerDocs || travelerDocs.length === 0;
  }).length || 0;

  const blockedWorkflowsCount = workflows?.filter((wf) => wf.status === "blocked").length || 0;

  const notesValue = internalNotes !== null ? internalNotes : (booking.internalNotes || "");

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4 no-print">
        <Link href="/admin/bookings">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold font-serif" data-testid="text-booking-code">{booking.bookingCode}</h1>
            <Badge variant="outline" data-testid="badge-booking-type">{BOOKING_TYPES[booking.bookingType]}</Badge>
          </div>
          {booking.groupName && <p className="text-muted-foreground text-sm" data-testid="text-group-name">{booking.groupName}</p>}
        </div>
        <div className="flex gap-2">
          {isAdmin && (booking.status === "submitted" || !booking.status) && (
            <div className="flex flex-col items-end gap-1">
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => {
                  const missingTravelers = (booking.partySizeExpected || 1) - (travelers?.length || 0);
                  if (missingTravelers > 0) {
                    if (!confirm(`${t("confirm_missing_travelers_prefix")} ${booking.partySizeExpected} ${t("confirm_missing_travelers_middle")} ${travelers?.length || 0} ${t("confirm_missing_travelers_suffix")}`)) {
                      return;
                    }
                  }
                  updateBooking.mutate({ status: "confirmed" });
                }}
                disabled={updateBooking.isPending}
                className="h-8 shadow-sm bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-confirm-booking"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {t("confirm_booking")}
              </Button>
              {(booking.partySizeExpected || 1) > (travelers?.length || 0) && (
                <span className="text-[10px] text-amber-600 font-medium flex items-center">
                  <AlertTriangle className="h-3 w-3 mr-1" /> {t("missing_travelers")}
                </span>
              )}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 shadow-sm">
            <Printer className="h-4 w-4 mr-2" />
            {t("print_summary")}
          </Button>
        </div>
      </div>

      {/* Printable Header */}
      <div className="hidden print:block border-b-2 border-[#116bb0] pb-4 mb-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Globe className="h-10 w-10 text-[#116bb0]" />
            <div>
              <h1 className="text-3xl font-bold font-serif text-[#116bb0]">{t("tourops_booking_summary")}</h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-sans">{t("official_operational_document")}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-2xl">{booking.bookingCode}</p>
            <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={booking.status || "submitted"} onValueChange={(v) => updateBooking.mutate({ status: v })} disabled={!isAdmin || updateBooking.isPending}>
          <SelectTrigger className="w-[140px]" data-testid="select-booking-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(BOOKING_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select 
          value={booking.fulfillmentStatus || "pending"} 
          onValueChange={(v) => {
            if (v === "completed") {
              const missingPassports = travelers?.filter(t => {
                const travelerDocs = documents?.filter(d => d.travelerId === t.id && d.docType === "passport");
                return !travelerDocs || travelerDocs.length === 0;
              });
              if (missingPassports && missingPassports.length > 0) {
                if (!confirm(`${missingPassports.length} ${t("missing_passports_suffix")}`)) {
                  return;
                }
              }
            }
            updateBooking.mutate({ fulfillmentStatus: v });
          }}
          disabled={!isAdmin || updateBooking.isPending}
        >
          <SelectTrigger className="w-[160px]" data-testid="select-fulfillment-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(FULFILLMENT_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("party_size")}</p>
            <p className="text-xl font-bold" data-testid="text-party-size">{booking.partySizeExpected}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("status")}</p>
            <Badge variant={booking.status === "confirmed" ? "default" : "secondary"} data-testid="badge-status">
              {BOOKING_STATUSES[booking.status || "submitted"]}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("fulfillment")}</p>
            <Badge variant={booking.fulfillmentStatus === "completed" ? "default" : "outline"} data-testid="badge-fulfillment">
              {FULFILLMENT_STATUSES[booking.fulfillmentStatus || "pending"]}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("join_code")}</p>
            <p className="font-mono text-sm" data-testid="text-join-code">{booking.joinCode || t("not_available")}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="summary" data-testid="tab-summary"><Info className="h-3.5 w-3.5 mr-1" />{t("summary")}</TabsTrigger>
          <TabsTrigger value="travelers" data-testid="tab-travelers"><Users className="h-3.5 w-3.5 mr-1" />{t("travelers")}</TabsTrigger>
          <TabsTrigger value="assignments" data-testid="tab-assignments"><ClipboardList className="h-3.5 w-3.5 mr-1" />{t("assignments")}</TabsTrigger>
          <TabsTrigger value="fulfillment" data-testid="tab-fulfillment"><Workflow className="h-3.5 w-3.5 mr-1" />{t("fulfillment")}</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents"><FileText className="h-3.5 w-3.5 mr-1" />{t("documents")}</TabsTrigger>
          {isAdmin && <TabsTrigger value="messages" data-testid="tab-messages"><MessageSquare className="h-3.5 w-3.5 mr-1" />{t("messages")}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="payments" data-testid="tab-payments"><CreditCard className="h-3.5 w-3.5 mr-1" />{t("payments")}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="invoices" data-testid="tab-invoices"><FileText className="h-3.5 w-3.5 mr-1" />{t("invoices")}</TabsTrigger>}
          {isOps && <TabsTrigger value="service-requests" data-testid="tab-service-requests"><Send className="h-3.5 w-3.5 mr-1" />{t("ops_sr_tab")}</TabsTrigger>}
          {isScheduleViewer && <TabsTrigger value="payment-schedule" data-testid="tab-payment-schedule"><DollarSign className="h-3.5 w-3.5 mr-1" />{t("ops_ps_tab")}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="history" data-testid="tab-history"><Clock className="h-3.5 w-3.5 mr-1" />{t("history")}</TabsTrigger>}
        </TabsList>

        {/* TAB A: Summary */}
        <TabsContent value="summary" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("booking_info")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("booking_code")}</p>
                    <p className="font-medium" data-testid="summary-booking-code">{booking.bookingCode}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("type_label")}</p>
                    <p className="font-medium" data-testid="summary-booking-type">{BOOKING_TYPES[booking.bookingType]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("status")}</p>
                    <p className="font-medium" data-testid="summary-status">{BOOKING_STATUSES[booking.status || "submitted"]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("fulfillment")}</p>
                    <p className="font-medium" data-testid="summary-fulfillment">{FULFILLMENT_STATUSES[booking.fulfillmentStatus || "pending"]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("tour_id")}</p>
                    <p className="font-medium font-mono text-xs" data-testid="summary-tour-id">{booking.tourId || t("not_available")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("departure_id")}</p>
                    <p className="font-medium font-mono text-xs" data-testid="summary-departure-id">{booking.departureId || t("not_available")}</p>
                  </div>
                  {booking.leaderUserId && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("leader_user")}</p>
                      <p className="font-medium" data-testid="summary-leader">{getUserName(booking.leaderUserId)}</p>
                    </div>
                  )}
                  {booking.joinCode && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("join_code")}</p>
                      <p className="font-medium font-mono" data-testid="summary-join-code">{booking.joinCode}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{t("internal_notes")}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={notesValue}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder={isAdmin ? t("add_internal_notes_placeholder") : t("no_notes")}
                  className="min-h-[120px]"
                  disabled={!isAdmin}
                  data-testid="input-internal-notes"
                />
                {isAdmin && (
                  <Button
                    onClick={() => {
                      updateBooking.mutate({ internalNotes: notesValue }, {
                        onSuccess: () => setInternalNotes(null)
                      });
                    }}
                    disabled={updateBooking.isPending}
                    data-testid="button-save-notes"
                  >{t("save_notes")}</Button>
                )}
              </CardContent>
            </Card>
          </div>

          {(missingDocsCount > 0 || blockedWorkflowsCount > 0) && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("alerts")}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {missingDocsCount > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="alert-missing-docs">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span>{missingDocsCount} {t("travelers_missing_documents_suffix")}</span>
                  </div>
                )}
                {blockedWorkflowsCount > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="alert-blocked-workflows">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span>{blockedWorkflowsCount} {t("workflows_blocked_suffix")}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB B: Travelers */}
        <TabsContent value="travelers" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {travelers?.length || 0} {t("travelers_count_suffix")}
            </h3>
            {isAdmin && (
              <Dialog open={showAddTraveler} onOpenChange={(open) => { setShowAddTraveler(open); if (!open) resetTravelerForm(); }}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-traveler"><Plus className="h-4 w-4 mr-2" />{t("add_traveler")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("add_traveler")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("first_name")}</Label>
                      <Input value={travelerForm.firstName} onChange={(e) => setTravelerForm({ ...travelerForm, firstName: e.target.value })} data-testid="input-traveler-first-name" />
                    </div>
                    <div>
                      <Label>{t("last_name")}</Label>
                      <Input value={travelerForm.lastName} onChange={(e) => setTravelerForm({ ...travelerForm, lastName: e.target.value })} data-testid="input-traveler-last-name" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("date_of_birth")}</Label>
                      <Input type="date" value={travelerForm.dob} onChange={(e) => setTravelerForm({ ...travelerForm, dob: e.target.value })} data-testid="input-traveler-dob" />
                    </div>
                    <div>
                      <Label>{t("gender")}</Label>
                      <Select value={travelerForm.gender} onValueChange={(v) => setTravelerForm({ ...travelerForm, gender: v })}>
                        <SelectTrigger data-testid="select-traveler-gender"><SelectValue placeholder={t("select_label")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">{t("male")}</SelectItem>
                          <SelectItem value="female">{t("female")}</SelectItem>
                          <SelectItem value="other">{t("other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t("nationality")}</Label>
                      <Input value={travelerForm.nationality} onChange={(e) => setTravelerForm({ ...travelerForm, nationality: e.target.value })} data-testid="input-traveler-nationality" />
                    </div>
                    <div>
                      <Label>{t("passport_number")}</Label>
                      <Input value={travelerForm.passportNumber} onChange={(e) => setTravelerForm({ ...travelerForm, passportNumber: e.target.value })} data-testid="input-traveler-passport" />
                    </div>
                  </div>
                  <div>
                    <Label>{t("special_needs")}</Label>
                    <Input value={travelerForm.specialNeeds} onChange={(e) => setTravelerForm({ ...travelerForm, specialNeeds: e.target.value })} data-testid="input-traveler-special-needs" />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (travelerForm.firstName && travelerForm.lastName) {
                        createTraveler.mutate({ bookingId, ...travelerForm });
                      }
                    }}
                    disabled={!travelerForm.firstName || !travelerForm.lastName || createTraveler.isPending}
                    data-testid="button-submit-traveler"
                  >{t("add_traveler")}</Button>
                </div>
              </DialogContent>
            </Dialog>
            )}
          </div>

          {travelers && travelers.length > 0 ? (
            <div className="space-y-2">
              {travelers.map((trav) => (
                <Card key={trav.id} data-testid={`card-traveler-${trav.id}`}>
                  <CardContent className="p-4">
                    {editTravelerId === trav.id ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>{t("first_name")}</Label>
                            <Input value={travelerForm.firstName} onChange={(e) => setTravelerForm({ ...travelerForm, firstName: e.target.value })} data-testid="input-edit-first-name" />
                          </div>
                          <div>
                            <Label>{t("last_name")}</Label>
                            <Input value={travelerForm.lastName} onChange={(e) => setTravelerForm({ ...travelerForm, lastName: e.target.value })} data-testid="input-edit-last-name" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>{t("dob_short")}</Label>
                            <Input type="date" value={travelerForm.dob} onChange={(e) => setTravelerForm({ ...travelerForm, dob: e.target.value })} data-testid="input-edit-dob" />
                          </div>
                          <div>
                            <Label>{t("gender")}</Label>
                            <Select value={travelerForm.gender} onValueChange={(v) => setTravelerForm({ ...travelerForm, gender: v })}>
                              <SelectTrigger data-testid="select-edit-gender"><SelectValue placeholder={t("select_label")} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="male">{t("male")}</SelectItem>
                                <SelectItem value="female">{t("female")}</SelectItem>
                                <SelectItem value="other">{t("other")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>{t("nationality")}</Label>
                            <Input value={travelerForm.nationality} onChange={(e) => setTravelerForm({ ...travelerForm, nationality: e.target.value })} data-testid="input-edit-nationality" />
                          </div>
                          <div>
                            <Label>{t("passport")}</Label>
                            <Input value={travelerForm.passportNumber} onChange={(e) => setTravelerForm({ ...travelerForm, passportNumber: e.target.value })} data-testid="input-edit-passport" />
                          </div>
                        </div>
                        <div>
                          <Label>{t("special_needs")}</Label>
                          <Input value={travelerForm.specialNeeds} onChange={(e) => setTravelerForm({ ...travelerForm, specialNeeds: e.target.value })} data-testid="input-edit-special-needs" />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            onClick={() => updateTraveler.mutate({ id: trav.id, data: travelerForm })}
                            disabled={updateTraveler.isPending}
                            data-testid="button-save-traveler"
                          >{t("save")}</Button>
                          <Button variant="outline" onClick={() => { setEditTravelerId(null); resetTravelerForm(); }} data-testid="button-cancel-edit">{t("cancel")}</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="font-medium" data-testid={`text-traveler-name-${trav.id}`}>{trav.firstName} {trav.lastName}</p>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                            {trav.dob && <span data-testid={`text-traveler-dob-${trav.id}`}>{t("dob_label")} {trav.dob}</span>}
                            {trav.nationality && <span data-testid={`text-traveler-nationality-${trav.id}`}>{trav.nationality}</span>}
                            {trav.passportNumber && <span data-testid={`text-traveler-passport-${trav.id}`}>{t("passport_label")} {trav.passportNumber}</span>}
                            {trav.gender && <span data-testid={`text-traveler-gender-${trav.id}`}>{trav.gender}</span>}
                          </div>
                          {trav.specialNeeds && <p className="text-xs text-muted-foreground mt-1" data-testid={`text-traveler-special-${trav.id}`}>{t("needs_label")} {trav.specialNeeds}</p>}
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditTraveler(trav)}
                              data-testid={`button-edit-traveler-${trav.id}`}
                            ><Pencil className="h-4 w-4" /></Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteTraveler.mutate(trav.id)}
                              data-testid={`button-delete-traveler-${trav.id}`}
                            ><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t("no_travelers_added")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB C: Assignments */}
        <TabsContent value="assignments" className="mt-4 space-y-4">
          {isAdmin && (
            <Card>
              <CardHeader><CardTitle className="text-base">{t("assign_service")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <Select value={assignService} onValueChange={setAssignService}>
                  <SelectTrigger className="w-[180px]" data-testid="select-assign-service"><SelectValue placeholder={t("service_type_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SERVICE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  value={assignCountry}
                  onChange={(e) => setAssignCountry(e.target.value)}
                  placeholder={t("country_code")}
                  className="w-[130px]"
                  data-testid="input-assign-country"
                />
                <Select value={assignUser} onValueChange={setAssignUser}>
                  <SelectTrigger className="w-[200px]" data-testid="select-assign-user"><SelectValue placeholder={t("assign_to_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    {allUsers?.filter((u) => u.role !== "customer").map((u) => (
                      <SelectItem key={u.id} value={u.userId}>{u.companyName || u.userId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => {
                    if (assignService && assignUser) {
                      createAssignment.mutate({
                        serviceType: assignService,
                        assignedUserId: assignUser,
                        countryCode: assignCountry || undefined,
                      });
                      setAssignService("");
                      setAssignUser("");
                      setAssignCountry("");
                    }
                  }}
                  disabled={!assignService || !assignUser || createAssignment.isPending}
                  data-testid="button-create-assignment"
                >{t("assign")}</Button>
              </div>
            </CardContent>
          </Card>
          )}

          {assignments && assignments.length > 0 ? (
            <div className="space-y-2">
              {assignments.map((a) => {
                const Icon = serviceIcons[a.serviceType] || ClipboardList;
                return (
                  <Card key={a.id} data-testid={`card-assignment-${a.id}`}>
                    <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm" data-testid={`text-assignment-type-${a.id}`}>{SERVICE_TYPES[a.serviceType]}</p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-assignment-country-${a.id}`}>
                            {a.countryCode ? `${t("country_prefix")} ${a.countryCode}` : t("global")}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground" data-testid={`text-assignment-user-${a.id}`}>
                          {getUserName(a.assignedUserId)}
                        </span>
                        <Badge data-testid={`badge-assignment-status-${a.id}`}>{a.status || "assigned"}</Badge>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAssignment.mutate(a.id)}
                            data-testid={`button-delete-assignment-${a.id}`}
                          ><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t("no_assignments_yet")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB D: Fulfillment */}
        <TabsContent value="fulfillment" className="mt-4">
          {workflows && workflows.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workflows.map((wf) => {
                const Icon = serviceIcons[wf.serviceType] || Workflow;
                const steps = SERVICE_WORKFLOW_STEPS[wf.serviceType] || [];
                const currentIdx = steps.findIndex((s) => s.code === wf.currentStep);
                return (
                  <Link href={`/admin/workflows/${wf.id}`} key={wf.id}>
                    <Card className="hover-elevate cursor-pointer" data-testid={`card-workflow-${wf.id}`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-primary" />
                            <span className="font-medium text-sm" data-testid={`text-workflow-type-${wf.id}`}>{SERVICE_TYPES[wf.serviceType]}</span>
                          </div>
                          <Badge
                            variant={wf.status === "completed" ? "default" : wf.status === "blocked" ? "destructive" : "outline"}
                            data-testid={`badge-workflow-status-${wf.id}`}
                          >
                            {WORKFLOW_STATUSES[wf.status || "not_assigned"]}
                          </Badge>
                        </div>
                        {wf.countryCode && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-workflow-country-${wf.id}`}>{t("country_prefix")} {wf.countryCode}</p>
                        )}
                        <p className="text-xs text-muted-foreground" data-testid={`text-workflow-assigned-${wf.id}`}>
                          {t("assigned_label")} {getUserName(wf.assignedUserId)}
                        </p>
                        {wf.currentStep && (
                          <p className="text-xs text-muted-foreground" data-testid={`text-workflow-step-${wf.id}`}>
                            {t("step_label")} {steps.find((s) => s.code === wf.currentStep)?.name || wf.currentStep}
                          </p>
                        )}
                        {steps.length > 0 && (
                          <div className="flex items-center gap-1">
                            {steps.map((step, i) => (
                              <div
                                key={step.code}
                                className={`h-1.5 flex-1 rounded-full ${
                                  i <= currentIdx
                                    ? wf.status === "blocked" ? "bg-destructive" : "bg-primary"
                                    : "bg-muted"
                                }`}
                                title={step.name}
                              />
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-primary">
                          <ExternalLink className="h-3 w-3" />
                          <span>{t("view_workflow")}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <Workflow className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t("no_workflows_started")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB E: Documents */}
        <TabsContent value="documents" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {documents?.length || 0} {t("documents_count_suffix")}
            </h3>
            <Dialog open={showAddDoc} onOpenChange={setShowAddDoc}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-document"><Plus className="h-4 w-4 mr-2" />{t("add_document")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("add_document")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>{t("document_type")}</Label>
                    <Select value={docForm.docType} onValueChange={(v) => setDocForm({ ...docForm, docType: v })}>
                      <SelectTrigger data-testid="select-doc-type"><SelectValue placeholder={t("select_type_placeholder")} /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(DOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("file_name")}</Label>
                    <Input
                      value={docForm.fileName}
                      onChange={(e) => setDocForm({ ...docForm, fileName: e.target.value })}
                      placeholder="document.pdf"
                      data-testid="input-doc-filename"
                    />
                  </div>
                  <div>
                    <Label>{t("file_url_path")}</Label>
                    <Input
                      value={docForm.fileUrl}
                      onChange={(e) => setDocForm({ ...docForm, fileUrl: e.target.value })}
                      placeholder="https://example.com/doc.pdf"
                      data-testid="input-doc-fileurl"
                    />
                  </div>
                  <div>
                    <Label>{t("traveler_optional")}</Label>
                    <Select value={docForm.travelerId} onValueChange={(v) => setDocForm({ ...docForm, travelerId: v })}>
                      <SelectTrigger data-testid="select-doc-traveler"><SelectValue placeholder={t("select_traveler_placeholder")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("none_option")}</SelectItem>
                        {travelers?.map((trav) => (
                          <SelectItem key={trav.id} value={trav.id}>{trav.firstName} {trav.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("workflow_step_optional")}</Label>
                    <Input
                      value={docForm.workflowStepId}
                      onChange={(e) => setDocForm({ ...docForm, workflowStepId: e.target.value })}
                      placeholder={t("step_id_placeholder")}
                      data-testid="input-doc-workflow-step"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (docForm.docType && docForm.fileName) {
                        createDocument.mutate({
                          bookingId,
                          docType: docForm.docType,
                          fileName: docForm.fileName,
                          fileUrl: docForm.fileUrl || undefined,
                          travelerId: docForm.travelerId && docForm.travelerId !== "none" ? docForm.travelerId : undefined,
                          workflowStepId: docForm.workflowStepId || undefined,
                        });
                      }
                    }}
                    disabled={!docForm.docType || !docForm.fileName || createDocument.isPending}
                    data-testid="button-submit-document"
                  >{t("add_document")}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {documents && documents.length > 0 ? (
            <div className="space-y-2">
              {documents.map((doc) => (
                <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm" data-testid={`text-doc-type-${doc.id}`}>{DOC_TYPES[doc.docType] || doc.docType}</p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-doc-filename-${doc.id}`}>{doc.fileName}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "secondary"}
                        data-testid={`badge-doc-status-${doc.id}`}
                      >
                        {doc.status || t("uploaded")}
                      </Badge>
                      {doc.fileUrl && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => window.open(doc.fileUrl!, "_blank")} title={t("view_document_tooltip")}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" asChild title={t("download_document_tooltip")}>
                            <a href={doc.fileUrl} download={doc.fileName}>
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        </>
                      )}
                      {isAdmin && doc.status === "uploaded" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateDocument.mutate({ id: doc.id, status: "approved" })}
                            data-testid={`button-approve-doc-${doc.id}`}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 mr-1" />{t("approve")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateDocument.mutate({ id: doc.id, status: "rejected" })}
                            data-testid={`button-reject-doc-${doc.id}`}
                          >
                            <ShieldX className="h-3.5 w-3.5 mr-1" />{t("reject")}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">{t("no_documents_uploaded")}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB F: Messages */}
        {isAdmin && (
          <TabsContent value="messages" className="mt-4 space-y-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={t("type_message_placeholder")}
                  data-testid="input-message"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Select value={msgVisibility} onValueChange={setMsgVisibility}>
                    <SelectTrigger className="w-[180px]" data-testid="select-message-visibility"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer_visible">{t("customer_visible")}</SelectItem>
                      <SelectItem value="internal_only">{t("internal_only")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => {
                      if (newMessage.trim()) {
                        sendMessage.mutate({ messageText: newMessage, visibility: msgVisibility });
                      }
                    }}
                    disabled={!newMessage.trim() || sendMessage.isPending}
                    data-testid="button-send-message"
                  ><Send className="h-4 w-4 mr-2" />{t("send")}</Button>
                </div>
              </CardContent>
            </Card>

            {messages && messages.length > 0 ? (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <Card key={msg.id} data-testid={`card-message-${msg.id}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm" data-testid={`text-message-sender-${msg.id}`}>{msg.senderName || t("system")}</span>
                          <Badge variant={msg.visibility === "internal_only" ? "secondary" : "outline"} className="text-xs">
                            {msg.visibility === "internal_only" ? t("internal_badge") : t("customer_badge")}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground" data-testid={`text-message-time-${msg.id}`}>
                          {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}
                        </span>
                      </div>
                      <p className="text-sm" data-testid={`text-message-body-${msg.id}`}>{msg.messageText}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("no_messages_yet")}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* TAB G: Payments */}
        {isAdmin && (
          <TabsContent value="payments" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                {payments?.length || 0} {t("payments_count_suffix")}
              </h3>
              <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-payment"><Plus className="h-4 w-4 mr-2" />{t("add_payment")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("add_payment")}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>{t("amount")}</Label>
                        <Input
                          type="number"
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                          placeholder="0.00"
                          data-testid="input-payment-amount"
                        />
                      </div>
                      <div>
                        <Label>{t("currency")}</Label>
                        <Input
                          value={paymentForm.currency}
                          onChange={(e) => setPaymentForm({ ...paymentForm, currency: e.target.value })}
                          placeholder="USD"
                          data-testid="input-payment-currency"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>{t("method")}</Label>
                      <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm({ ...paymentForm, method: v })}>
                        <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PAYMENT_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("link_to_invoice_optional")}</Label>
                      <Select value={paymentForm.invoiceId} onValueChange={(v) => setPaymentForm({ ...paymentForm, invoiceId: v })}>
                        <SelectTrigger data-testid="select-payment-invoice"><SelectValue placeholder={t("select_invoice_placeholder")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("none_option")}</SelectItem>
                          {invoices?.map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>{inv.invoiceNumber} - {inv.currency} {(inv.amount / 100).toFixed(2)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("notes")}</Label>
                      <Textarea
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                        placeholder={t("payment_notes_placeholder")}
                        data-testid="input-payment-notes"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (paymentForm.amount && !isNaN(parseFloat(paymentForm.amount)) && parseFloat(paymentForm.amount) > 0) {
                          createPayment.mutate({
                            bookingId,
                            amount: paymentForm.amount,
                            currency: paymentForm.currency,
                            method: paymentForm.method,
                            notes: paymentForm.notes || undefined,
                            invoiceId: paymentForm.invoiceId === "none" ? undefined : paymentForm.invoiceId || undefined,
                          });
                        }
                      }}
                      disabled={!paymentForm.amount || createPayment.isPending}
                      data-testid="button-submit-payment"
                    >{t("add_payment")}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {payments && payments.length > 0 ? (
              <div className="space-y-2">
                {payments.map((p) => {
                  const linkedInvoice = invoices?.find(inv => inv.id === p.invoiceId);
                  return (
                    <Card key={p.id} data-testid={`card-payment-${p.id}`}>
                      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm" data-testid={`text-payment-amount-${p.id}`}>
                              {p.currency} {(p.amount / 100).toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground" data-testid={`text-payment-method-${p.id}`}>
                              {PAYMENT_METHODS[p.method || "bank_transfer"] || p.method}
                              {linkedInvoice && <span className="ml-2 font-semibold text-primary">| {t("linked_to_prefix")} {linkedInvoice.invoiceNumber}</span>}
                            </p>
                            {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={p.status === "paid" ? "default" : p.status === "failed" ? "destructive" : "secondary"}
                            data-testid={`badge-payment-status-${p.id}`}
                          >
                            {PAYMENT_STATUSES[p.status || "pending"] || p.status}
                          </Badge>
                          {p.receiptUrl && (
                            <Button size="sm" variant="ghost" onClick={() => window.open(p.receiptUrl!, "_blank")} title="View Receipt">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          {p.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => updatePayment.mutate({ id: p.id, status: "paid" })}
                              data-testid={`button-mark-paid-${p.id}`}
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />{t("mark_paid")}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <CreditCard className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("no_payments_recorded")}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* TAB H: Invoices */}
        {isAdmin && (
          <TabsContent value="invoices" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                {invoices?.length || 0} {t("invoices_count_suffix")}
              </h3>
              <Dialog open={showAddInvoice} onOpenChange={setShowAddInvoice}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-invoice"><Plus className="h-4 w-4 mr-2" />{t("create_invoice")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("create_invoice")}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>{t("invoice_number")}</Label>
                      <Input
                        value={invoiceForm.invoiceNumber}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })}
                        placeholder="INV-2024-001"
                        data-testid="input-invoice-number"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>{t("amount")}</Label>
                        <Input
                          type="number"
                          value={invoiceForm.amount}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                          placeholder="0.00"
                          data-testid="input-invoice-amount"
                        />
                      </div>
                      <div>
                        <Label>{t("currency")}</Label>
                        <Input
                          value={invoiceForm.currency}
                          onChange={(e) => setInvoiceForm({ ...invoiceForm, currency: e.target.value })}
                          placeholder="USD"
                          data-testid="input-invoice-currency"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>{t("due_date")}</Label>
                      <Input
                        type="date"
                        value={invoiceForm.dueDate}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                        data-testid="input-invoice-due-date"
                      />
                    </div>
                    <div>
                      <Label>{t("notes")}</Label>
                      <Textarea
                        value={invoiceForm.notes}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                        placeholder={t("invoice_notes_placeholder")}
                        data-testid="input-invoice-notes"
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => {
                        if (invoiceForm.invoiceNumber && invoiceForm.amount) {
                          createInvoice.mutate(invoiceForm);
                        }
                      }}
                      disabled={!invoiceForm.invoiceNumber || !invoiceForm.amount || createInvoice.isPending}
                      data-testid="button-submit-invoice"
                    >{t("create_invoice")}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {invoices && invoices.length > 0 ? (
              <div className="space-y-2">
                {invoices.map((inv) => (
                  <Card key={inv.id} data-testid={`card-invoice-${inv.id}`}>
                    <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm" data-testid={`text-invoice-number-${inv.id}`}>
                            {inv.invoiceNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {inv.currency} {(inv.amount / 100).toFixed(2)} | {t("due_label")} {inv.dueDate || t("not_available")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={inv.status === "paid" ? "default" : inv.status === "sent" ? "secondary" : "outline"}>
                          {inv.status?.toUpperCase() || t("draft").toUpperCase()}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => window.print()} title={t("print_invoice_tooltip")}>
                           <Printer className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("no_invoices_created")}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
        {/* TAB: Service Requests */}
        {isOps && (
          <TabsContent value="service-requests" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                {serviceRequests?.length || 0} {t("ops_sr_tab").toLowerCase()}
              </h3>
              <Dialog open={showCreateSR} onOpenChange={setShowCreateSR}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-sr"><Plus className="h-4 w-4 mr-2" />{t("ops_sr_create")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{t("ops_sr_create")}</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>{t("ops_sr_service_type")}</Label>
                      <Select value={srForm.serviceType} onValueChange={(v) => setSrForm({ ...srForm, serviceType: v })}>
                        <SelectTrigger data-testid="select-sr-service-type"><SelectValue placeholder={t("select_label")} /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(SERVICE_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("ops_sr_supplier")}</Label>
                      <Select value={srForm.supplierUserId} onValueChange={(v) => setSrForm({ ...srForm, supplierUserId: v })}>
                        <SelectTrigger data-testid="select-sr-supplier"><SelectValue placeholder={t("select_label")} /></SelectTrigger>
                        <SelectContent>
                          {allUsers?.filter(u => ["supplier","airline_supplier","hotel_manager","transport_manager","guide_manager","sights_manager"].includes(u.role ?? "")).map(u => (
                            <SelectItem key={u.id} value={u.userId}>{u.companyName || u.userId}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>{t("ops_sr_date")}</Label>
                        <Input type="date" value={srForm.serviceDate} onChange={(e) => setSrForm({ ...srForm, serviceDate: e.target.value })} data-testid="input-sr-date" />
                      </div>
                      <div>
                        <Label>{t("ops_sr_location")}</Label>
                        <Input value={srForm.location} onChange={(e) => setSrForm({ ...srForm, location: e.target.value })} data-testid="input-sr-location" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label>{t("ops_sr_quantity")}</Label>
                        <Input type="number" min="1" value={srForm.quantity} onChange={(e) => setSrForm({ ...srForm, quantity: e.target.value })} data-testid="input-sr-quantity" />
                      </div>
                      <div>
                        <Label>{t("ops_sr_pax")}</Label>
                        <Input type="number" min="0" value={srForm.paxCount} onChange={(e) => setSrForm({ ...srForm, paxCount: e.target.value })} data-testid="input-sr-pax" />
                      </div>
                      <div>
                        <Label>{t("ops_sr_agreed_rate")}</Label>
                        <Input type="number" min="0" step="0.01" value={srForm.agreedRate} onChange={(e) => setSrForm({ ...srForm, agreedRate: e.target.value })} data-testid="input-sr-rate" />
                      </div>
                    </div>
                    <div>
                      <Label>{t("ops_sr_notes")}</Label>
                      <Textarea value={srForm.notesForSupplier} onChange={(e) => setSrForm({ ...srForm, notesForSupplier: e.target.value })} data-testid="input-sr-notes" />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!srForm.serviceType || !srForm.supplierUserId || !srForm.serviceDate || !srForm.agreedRate || createServiceRequest.isPending}
                      onClick={() => createServiceRequest.mutate({
                        serviceType: srForm.serviceType,
                        supplierUserId: srForm.supplierUserId,
                        serviceDate: srForm.serviceDate,
                        quantity: parseInt(srForm.quantity) || 1,
                        paxCount: parseInt(srForm.paxCount) || 0,
                        agreedRate: srForm.agreedRate,
                        location: srForm.location || undefined,
                        notesForSupplier: srForm.notesForSupplier || undefined,
                      })}
                      data-testid="button-submit-sr"
                    >{t("ops_sr_create")}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {serviceRequests && serviceRequests.length > 0 ? (
              <div className="space-y-2">
                {serviceRequests.map((sr) => {
                  const Icon = serviceIcons[sr.serviceType] || ClipboardList;
                  const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
                    pending: "secondary", sent: "default", confirmed: "default",
                    rejected: "destructive", changes_requested: "outline", cancelled: "outline",
                  };
                  const statusLabels: Record<string, string> = {
                    pending: t("ops_sr_status_pending"), sent: t("ops_sr_status_sent"),
                    confirmed: t("ops_sr_status_confirmed"), rejected: t("ops_sr_status_rejected"),
                    changes_requested: t("ops_sr_status_changes_requested"), cancelled: t("ops_sr_status_cancelled"),
                  };
                  return (
                    <Card key={sr.id} data-testid={`card-sr-${sr.id}`}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{SERVICE_TYPES[sr.serviceType]}</p>
                              <p className="text-xs text-muted-foreground">
                                {sr.serviceDate ? String(sr.serviceDate) : ""}{sr.location ? ` · ${sr.location}` : ""} · {t("ops_sr_pax")}: {sr.paxCount} · {sr.currency} {sr.agreedRate}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={statusColors[sr.status] ?? "outline"} data-testid={`badge-sr-status-${sr.id}`}>
                              {statusLabels[sr.status] ?? sr.status}
                            </Badge>
                            {(sr.status === "pending" || sr.status === "changes_requested") && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={patchSRStatus.isPending}
                                onClick={() => patchSRStatus.mutate({ id: sr.id, status: "sent" })}
                                data-testid={`button-sr-send-${sr.id}`}
                              ><Send className="h-3 w-3 mr-1" />{t("ops_sr_send")}</Button>
                            )}
                            {(sr.status === "pending" || sr.status === "sent" || sr.status === "changes_requested") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={patchSRStatus.isPending}
                                onClick={() => { if (confirm(`${t("ops_sr_cancel_req")}?`)) patchSRStatus.mutate({ id: sr.id, status: "cancelled" }); }}
                                data-testid={`button-sr-cancel-${sr.id}`}
                              ><Trash2 className="h-3 w-3 mr-1" />{t("ops_sr_cancel_req")}</Button>
                            )}
                          </div>
                        </div>
                        {sr.notesForSupplier && (
                          <p className="text-xs text-muted-foreground border-t pt-2">{t("ops_sr_notes")}: {sr.notesForSupplier}</p>
                        )}
                        {sr.supplierResponse && (
                          <p className="text-xs border-t pt-2">
                            <span className="font-medium text-muted-foreground">{t("ops_sr_response")}:</span> {sr.supplierResponse}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">{t("ops_sr_supplier")}: {getUserName(sr.supplierUserId)}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <Send className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("ops_sr_none")}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* TAB: Payment Schedule */}
        {isScheduleViewer && (
          <TabsContent value="payment-schedule" className="mt-4 space-y-4">
            {paymentSchedule && paymentSchedule.length > 0 ? (
              <div className="space-y-2">
                {paymentSchedule.map((inst) => {
                  const psStatusLabels: Record<string, string> = {
                    pending: t("ops_ps_status_pending"), paid: t("ops_ps_status_paid"),
                    partially_paid: t("ops_ps_status_partially_paid"), cancelled: t("ops_ps_status_cancelled"),
                  };
                  const psStatusColors: Record<string, "default" | "secondary" | "outline"> = {
                    pending: "secondary", paid: "default", partially_paid: "outline", cancelled: "outline",
                  };
                  return (
                    <Card key={inst.id} data-testid={`card-ps-${inst.id}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-sm">{inst.label} <span className="text-muted-foreground font-normal">({inst.percentage}%)</span></p>
                            <p className="text-xs text-muted-foreground">
                              {inst.currency} {inst.amount} · {t("ops_ps_due_date")}: {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString() : "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">{t("ops_ps_paid")}: {inst.currency} {inst.paidAmount}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={psStatusColors[inst.status] ?? "secondary"} data-testid={`badge-ps-status-${inst.id}`}>
                              {psStatusLabels[inst.status] ?? inst.status}
                            </Badge>
                            {isFinanceOps && inst.status !== "paid" && inst.status !== "cancelled" && (
                              recordingPaymentId === inst.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    className="w-24 h-8 text-xs"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={recordPaymentAmount}
                                    onChange={(e) => setRecordPaymentAmount(e.target.value)}
                                    data-testid={`input-ps-amount-${inst.id}`}
                                  />
                                  <Button
                                    size="sm"
                                    disabled={!recordPaymentAmount || recordPayment.isPending}
                                    onClick={() => recordPayment.mutate({ id: inst.id, amount: recordPaymentAmount })}
                                    data-testid={`button-ps-confirm-${inst.id}`}
                                  ><CheckCircle className="h-3.5 w-3.5" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setRecordingPaymentId(null); setRecordPaymentAmount(""); }}>✕</Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setRecordingPaymentId(inst.id); setRecordPaymentAmount(""); }}
                                  data-testid={`button-ps-record-${inst.id}`}
                                ><DollarSign className="h-3 w-3 mr-1" />{t("ops_ps_record_payment")}</Button>
                              )
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-8">
                  <CreditCard className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">{t("ops_ps_none")}</p>
                </CardContent>
              </Card>
            )}

            {isFinanceOps && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{t("ops_ps_generate")}</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setShowGenerateSchedule(!showGenerateSchedule)}>
                      {showGenerateSchedule ? t("cancel") : t("ops_ps_generate")}
                    </Button>
                  </div>
                </CardHeader>
                {showGenerateSchedule && (
                  <CardContent className="space-y-3">
                    {scheduleInstallments.map((inst, i) => (
                      <div key={i} className="grid grid-cols-[1fr_72px_140px_32px] gap-2 items-end">
                        <div>
                          {i === 0 && <Label className="text-xs mb-1 block">{t("ops_ps_installment_label")}</Label>}
                          <Input
                            value={inst.label}
                            onChange={(e) => { const n = [...scheduleInstallments]; n[i] = { ...n[i], label: e.target.value }; setScheduleInstallments(n); }}
                            placeholder={`Installment ${i + 1}`}
                            data-testid={`input-ps-label-${i}`}
                          />
                        </div>
                        <div>
                          {i === 0 && <Label className="text-xs mb-1 block">{t("ops_ps_percentage")}</Label>}
                          <Input
                            type="number" min="1" max="100"
                            value={inst.percentage}
                            onChange={(e) => { const n = [...scheduleInstallments]; n[i] = { ...n[i], percentage: parseFloat(e.target.value) || 0 }; setScheduleInstallments(n); }}
                            data-testid={`input-ps-pct-${i}`}
                          />
                        </div>
                        <div>
                          {i === 0 && <Label className="text-xs mb-1 block">{t("ops_ps_due_date")}</Label>}
                          <Input
                            type="date"
                            value={inst.dueDate}
                            onChange={(e) => { const n = [...scheduleInstallments]; n[i] = { ...n[i], dueDate: e.target.value }; setScheduleInstallments(n); }}
                            data-testid={`input-ps-due-${i}`}
                          />
                        </div>
                        <Button
                          variant="ghost" size="icon" className="h-9 w-8 mt-auto"
                          onClick={() => setScheduleInstallments(scheduleInstallments.filter((_, j) => j !== i))}
                          disabled={scheduleInstallments.length <= 1}
                          data-testid={`button-ps-remove-${i}`}
                        ><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => setScheduleInstallments([...scheduleInstallments, { label: "", percentage: 0, dueDate: "" }])}
                        data-testid="button-ps-add-installment"
                      ><Plus className="h-3 w-3 mr-1" />{t("ops_ps_add_installment")}</Button>
                      <span className={`text-xs font-medium ${Math.abs(scheduleInstallments.reduce((a, i) => a + i.percentage, 0) - 100) > 0.001 ? "text-destructive" : "text-muted-foreground"}`}>
                        Total: {scheduleInstallments.reduce((a, i) => a + i.percentage, 0).toFixed(1)}%
                      </span>
                    </div>
                    <Button
                      className="w-full"
                      disabled={
                        generateSchedule.isPending ||
                        Math.abs(scheduleInstallments.reduce((a, i) => a + i.percentage, 0) - 100) > 0.001 ||
                        scheduleInstallments.some(i => !i.label || !i.dueDate)
                      }
                      onClick={() => generateSchedule.mutate(scheduleInstallments.map(i => ({ label: i.label, percentage: i.percentage, dueDate: i.dueDate })))}
                      data-testid="button-ps-generate"
                    >{t("ops_ps_generate")}</Button>
                  </CardContent>
                )}
              </Card>
            )}
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("audit_trail")}</CardTitle>
              </CardHeader>
              <CardContent>
                {auditLogs && auditLogs.length > 0 ? (
                  <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="relative">
                        <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-primary border-4 border-background" />
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-semibold">{log.action ? log.action.replace(/_/g, " ").toUpperCase() : ""}</p>
                            <p className="text-[10px] text-muted-foreground">{log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t("changed_by_label")} <span className="font-medium text-foreground">{log.changedByName || t("system")}</span>
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-4 p-2 bg-muted/30 rounded border text-[11px]">
                            <div>
                              <p className="text-muted-foreground uppercase font-bold text-[9px]">{t("previous_label")}</p>
                              <p>{log.previousValue || "-"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground uppercase font-bold text-[9px]">{t("new_value_label")}</p>
                              <p className="text-primary font-medium">{log.newValue || "-"}</p>
                            </div>
                          </div>
                          {log.note && <p className="text-xs italic text-muted-foreground mt-1">"{log.note}"</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-12 text-center">
                    <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">{t("no_audit_logs")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
