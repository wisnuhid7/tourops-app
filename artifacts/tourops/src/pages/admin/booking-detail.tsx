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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage, localizeScheduleLabel } from "@/hooks/use-language";
import {
  Users, FileText, Workflow, MessageSquare, CreditCard,
  ClipboardList, ArrowLeft, CheckCircle, Clock, AlertTriangle,
  Send, Plane, Hotel, Bus, UserCheck, Ticket, Plus, Pencil,
  Trash2, Eye, ShieldCheck, ShieldX, Info, DollarSign,
  ExternalLink, Download, Printer, Globe, XCircle,
  Bed, MapPin, Phone, Mail, Building
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { BOOKING_TYPES, BOOKING_STATUSES, SERVICE_TYPES, WORKFLOW_STATUSES, SERVICE_WORKFLOW_STEPS, USER_ROLES } from "@/lib/constants";
import type { Booking, Traveler, BookingWorkflow, WorkflowStep, Document, Message, Payment, UserProfile, BookingServiceRequest, BookingPaymentSchedule, Tour, TourDeparture } from "@workspace/db";
import { useState, useMemo } from "react";
import { DocumentPreview } from "@/components/DocumentPreview";
import { getFlightSchedule } from "@/lib/utils";

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
  const { t, lt, language } = useLanguage();
  const bookingId = params?.id;

  const [internalNotes, setInternalNotes] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [msgVisibility, setMsgVisibility] = useState("customer_visible");

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
  const [activeTab, setActiveTab] = useState("summary");

  const [managingWorkflow, setManagingWorkflow] = useState<BookingWorkflow | null>(null);
  const [editWorkflowStatus, setEditWorkflowStatus] = useState<string>("not_assigned");
  const [editWorkflowAssignee, setEditWorkflowAssignee] = useState<string>("none");
  const [editWorkflowNotes, setEditWorkflowNotes] = useState<string>("");

  const { data: booking, isLoading } = useQuery<Booking>({ queryKey: ["/api/bookings", bookingId] });
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
  const selectedDeparture = departures?.find((d) => d.id === booking?.departureId);
  const roomsNeeded = booking?.roomAllocations && Array.isArray(booking.roomAllocations) && booking.roomAllocations.length > 0
    ? (booking.roomAllocations as any[]).reduce((sum, a) => sum + (Number(a.count) || 1), 0)
    : (booking?.roomType === "triple" ? Math.max(1, Math.ceil((booking?.partySizeExpected || 1) / 3)) : Math.max(1, Math.ceil((booking?.partySizeExpected || 1) / 2)));
  const { data: schedule } = useQuery<BookingPaymentSchedule[]>({
    queryKey: ["/api/bookings", bookingId, "payment-schedule"],
    enabled: !!bookingId,
  });
  const { data: travelers } = useQuery<Traveler[]>({ queryKey: ["/api/bookings", bookingId, "travelers"] });
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

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const updateBooking = useMutation({
    mutationFn: (data: Record<string, any>) => apiRequest("PATCH", `/api/bookings/${bookingId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "workflows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: t("booking_updated") });
      setShowCancelDialog(false);
      setCancelReason("");
    },
    onError: (e: any) => {
      toast({ title: e?.message || t("update_failed"), variant: "destructive" });
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

  const updateWorkflow = useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      apiRequest("PATCH", `/api/workflows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "workflows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings", bookingId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      toast({ title: t("workflow_updated") });
    },
    onError: () => toast({ title: t("update_failed"), variant: "destructive" }),
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
      amount: Math.round(parseFloat(data.amount))
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
      amount: Math.round(parseFloat(data.amount))
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

  const getAdminServiceStatusPresentation = (status?: string | null) => {
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

  const getAssigneeRolePriority = (role?: string | null, serviceType?: string) => {
    if (!role || !serviceType) return 99;
    if (serviceType === "hotel" && (role === "hotel_manager" || role === "supplier")) return 1;
    if ((serviceType === "airline" || serviceType === "flight") && (role === "airline_supplier" || role === "flight_agent" || role === "supplier")) return 1;
    if (serviceType === "guide" && (role === "guide_manager" || role === "tour_leader" || role === "supplier")) return 1;
    if (serviceType === "sights" && (role === "sights_manager" || role === "supplier")) return 1;
    if (serviceType === "transport" && (role === "transport_manager" || role === "supplier")) return 1;
    if (["supplier", "hotel_manager", "guide_manager", "sights_manager", "airline_supplier", "transport_manager"].includes(role)) return 2;
    return 3;
  };

  const sortedAssignableUsers = useMemo(() => {
    if (!allUsers) return [];
    const serviceType = managingWorkflow?.serviceType;
    return [...allUsers]
      .filter((u) => u.role !== "customer")
      .sort((a, b) => {
        const prioA = getAssigneeRolePriority(a.role, serviceType);
        const prioB = getAssigneeRolePriority(b.role, serviceType);
        if (prioA !== prioB) return prioA - prioB;
        const nameA = a.companyName || a.userId || "";
        const nameB = b.companyName || b.userId || "";
        return nameA.localeCompare(nameB);
      });
  }, [allUsers, managingWorkflow?.serviceType]);

  const openManageWorkflow = (wf: BookingWorkflow) => {
    setManagingWorkflow(wf);
    let initialStatus = "not_assigned";
    if (wf.status === "completed") {
      initialStatus = "completed";
    } else if (wf.status === "in_progress" || wf.status === "blocked") {
      initialStatus = "in_progress";
    } else if (wf.status === "cancelled") {
      initialStatus = "cancelled";
    } else {
      initialStatus = "not_assigned";
    }
    setEditWorkflowStatus(initialStatus);
    setEditWorkflowAssignee(wf.assignedUserId || "none");
    setEditWorkflowNotes(wf.notes || "");
  };

  const handleSaveWorkflow = () => {
    if (!managingWorkflow) return;
    let finalStatus = editWorkflowStatus;
    if (editWorkflowAssignee !== "none" && (editWorkflowStatus === "not_assigned" || !editWorkflowStatus)) {
      finalStatus = "assigned";
    } else if (editWorkflowAssignee === "none" && editWorkflowStatus === "assigned") {
      finalStatus = "not_assigned";
    }

    updateWorkflow.mutate({
      id: managingWorkflow.id,
      status: finalStatus,
      assignedUserId: editWorkflowAssignee === "none" ? null : editWorkflowAssignee,
      notes: editWorkflowNotes,
    }, {
      onSuccess: () => {
        setManagingWorkflow(null);
      }
    });
  };

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

  const isLandOnly = Boolean(booking?.departureCity && booking.departureCity.toLowerCase().includes("land only"));
  const displayedWorkflows = useMemo(() => {
    return workflows?.filter((wf) => !(isLandOnly && wf.serviceType === "airline")) || [];
  }, [workflows, isLandOnly]);

  const blockedWorkflowsCount = displayedWorkflows.filter((wf) => wf.status === "blocked").length;
  const unassignedWorkflowCount = displayedWorkflows.filter((wf) => !wf.assignedUserId || wf.status === "not_assigned").length;
  const pendingDocsCount = documents?.filter((doc) => doc.status === "uploaded").length || 0;
  const missingTravelerCount = Math.max(0, (booking.partySizeExpected || 1) - (travelers?.length || 0));
  const pendingPaymentCount = payments?.filter((payment) => payment.status === "pending").length || 0;
  const hasPendingSchedule = (schedule || paymentSchedule)?.some((installment) => ["pending", "partially_paid", "late"].includes(installment.status)) || false;
  const hasPaymentAttention = pendingPaymentCount > 0 || hasPendingSchedule;
  const attentionDataReady = !!travelers && !!documents && !!workflows && (!isAdmin || !!payments);

  const tourTitle = tour ? lt(tour, "title") : undefined;
  const destination = tour?.countries?.filter(Boolean).join(", ");
  const departure = departures?.find((item) => item.id === booking.departureId);
  const customerProfile = allUsers?.find((profile) => profile.userId === booking.customerId);
  const customerName = customerProfile?.companyName || booking.customerId;

  const attentionItems: Array<{
    id: string;
    title: string;
    description: string;
    tab: string;
    actionLabel: string;
    icon: any;
    tone: "warning" | "danger";
  }> = [];

  if (blockedWorkflowsCount > 0) {
    attentionItems.push({
      id: "blocked-workflows",
      title: t("fulfillment"),
      description: `${blockedWorkflowsCount} ${t("workflows_blocked_suffix")}`,
      tab: "fulfillment",
      actionLabel: t("view_workflow"),
      icon: AlertTriangle,
      tone: "danger",
    });
  }
  if (missingTravelerCount > 0) {
    attentionItems.push({
      id: "missing-travelers",
      title: t("travelers"),
      description: `${missingTravelerCount} ${t("travelers_still_needed")}`,
      tab: "travelers",
      actionLabel: t("add_traveler"),
      icon: Users,
      tone: "warning",
    });
  }
  if (missingDocsCount > 0 || pendingDocsCount > 0) {
    attentionItems.push({
      id: "documents",
      title: t("documents"),
      description: missingDocsCount > 0
        ? `${missingDocsCount} ${t("travelers_missing_documents_suffix")}`
        : `${pendingDocsCount} ${t("documents_pending_review_suffix")}`,
      tab: "documents",
      actionLabel: t("documents"),
      icon: FileText,
      tone: "warning",
    });
  }
  if (hasPaymentAttention) {
    attentionItems.push({
      id: "payment",
      title: t("payments"),
      description: pendingPaymentCount > 0 ? `${pendingPaymentCount} ${t("payment_status_pending")}` : t("payment_pending"),
      tab: "payments",
      actionLabel: t("payments"),
      icon: CreditCard,
      tone: "warning",
    });
  }
  if (unassignedWorkflowCount > 0) {
    attentionItems.push({
      id: "unassigned",
      title: t("service_status"),
      description: `${unassignedWorkflowCount} ${t("assignments_need_attention_suffix")}`,
      tab: "fulfillment",
      actionLabel: t("service_status"),
      icon: Workflow,
      tone: "warning",
    });
  }

  const notesValue = internalNotes !== null ? internalNotes : (booking.internalNotes || "");

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-2">
        <Link href="/admin/bookings">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-1" />{t("back")}
          </Button>
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{t("booking_info")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="h-8 shadow-sm">
          <Printer className="h-4 w-4 mr-2" />
          {t("print_summary")}
        </Button>
      </div>

      <section className="overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-background to-background shadow-sm" data-testid="card-admin-booking-hero">
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t("booking_code")}</p>
                <Badge variant="outline" data-testid="badge-booking-type">{BOOKING_TYPES[booking.bookingType]}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="font-mono text-3xl font-bold tracking-tight sm:text-4xl" data-testid="text-booking-code">{booking.bookingCode}</h1>
                <Badge variant={booking.status === "confirmed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"} className="text-sm" data-testid="badge-status">
                  {BOOKING_STATUSES[booking.status || "submitted"]}
                </Badge>
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl" data-testid="text-trip-title">
                {tourTitle || booking.groupName || t("trip_summary")}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {destination && <span>{destination}</span>}
                {booking.groupName && <span data-testid="text-group-name">{booking.groupName}</span>}
                {!tourTitle && booking.tourId && <span className="font-mono text-xs">{booking.tourId}</span>}
              </div>
            </div>

            <div className="flex min-w-[220px] flex-col items-stretch gap-2 sm:items-end">
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {booking.status === "cancelled" ? (
                  <Badge variant="destructive" className="h-9 px-3 text-xs uppercase font-semibold tracking-wider gap-1.5 shadow-sm" data-testid="badge-booking-cancelled">
                    <XCircle className="h-4 w-4" />
                    {BOOKING_STATUSES.cancelled}
                  </Badge>
                ) : (
                  <>
                    {(booking.status === "submitted" || !booking.status) ? (
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              if (missingTravelerCount > 0 && !confirm(`${t("confirm_missing_travelers_prefix")} ${booking.partySizeExpected} ${t("confirm_missing_travelers_middle")} ${travelers?.length || 0} ${t("confirm_missing_travelers_suffix")}`)) return;
                              updateBooking.mutate({ status: "confirmed" });
                            }}
                            disabled={updateBooking.isPending}
                            className="h-9 bg-emerald-600 shadow-sm hover:bg-emerald-700"
                            data-testid="button-confirm-booking"
                          >
                            <CheckCircle className="h-4 w-4 mr-1.5" />
                            {t("confirm_booking")}
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCancelDialog(true)}
                            disabled={updateBooking.isPending}
                            className="h-9 border-destructive/30 text-destructive hover:bg-destructive/10"
                            data-testid="button-cancel-booking-init"
                          >
                            <XCircle className="h-4 w-4 mr-1.5" />
                            {t("cancel_booking")}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select
                          value={booking.status || "confirmed"}
                          onValueChange={(v) => updateBooking.mutate({ status: v })}
                          disabled={!isAdmin || updateBooking.isPending}
                        >
                          <SelectTrigger className="w-[150px] bg-background/80" data-testid="select-booking-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="confirmed">{BOOKING_STATUSES.confirmed}</SelectItem>
                            <SelectItem value="in_progress">{BOOKING_STATUSES.in_progress}</SelectItem>
                            <SelectItem value="completed">{BOOKING_STATUSES.completed}</SelectItem>
                          </SelectContent>
                        </Select>
                        {isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowCancelDialog(true)}
                            disabled={updateBooking.isPending}
                            className="h-9 border-destructive/30 text-destructive hover:bg-destructive/10"
                            data-testid="button-cancel-booking-init"
                          >
                            <XCircle className="h-4 w-4 mr-1.5" />
                            {t("cancel_booking")}
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {booking.status === "cancelled" && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-xs font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{t("booking_cancelled_services_blocked_warning")}</span>
            </div>
          )}

          <div className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-primary/10 pt-5 text-sm sm:grid-cols-5">
            <div>
              <p className="text-xs text-muted-foreground">{t("customer")}</p>
              <p className="mt-1 truncate font-medium" title={customerName}>{customerName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("party_size")}</p>
              <p className="mt-1 font-medium" data-testid="text-party-size">{travelers?.length || 0} / {booking.partySizeExpected || 1} {t("travelers_suffix")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("departure_city") || "Departure City"}</p>
              <p className="mt-1 font-medium truncate" title={booking.departureCity || t("not_available")}>{booking.departureCity || t("not_available")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("departure_date")}</p>
              <p className="mt-1 font-medium">{departure?.startDate ? new Date(departure.startDate).toLocaleDateString() : t("not_available")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("date")}</p>
              <p className="mt-1 font-medium">{booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : t("not_available")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/20 sm:p-5" data-testid="card-needs-attention">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <h2 className="font-semibold">{t("needs_attention")}</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t("your_tasks")}</p>
          </div>
          {attentionDataReady && attentionItems.length > 0 && <Badge variant="outline" className="border-amber-400/70 bg-background/50">{Math.min(4, attentionItems.length)} {t("awaiting_action")}</Badge>}
        </div>
        {!attentionDataReady ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-16 bg-amber-100/60 dark:bg-amber-900/20" />
            <Skeleton className="h-16 bg-amber-100/60 dark:bg-amber-900/20" />
          </div>
        ) : attentionItems.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {attentionItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-background/80 p-3 dark:border-amber-900/60" data-testid={`attention-${item.id}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.tone === "danger" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 bg-background" onClick={() => setActiveTab(item.tab)}>{item.actionLabel}</Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300" data-testid="attention-all-clear">
            <CheckCircle className="h-4 w-4" />
            <span>{t("all_clear_no_actions")}</span>
          </div>
        )}
      </section>

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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start gap-1 rounded-xl border bg-card p-1.5 shadow-sm">
          <TabsTrigger value="summary" data-testid="tab-summary"><Info className="h-3.5 w-3.5 mr-1" />{t("summary")}</TabsTrigger>
          <TabsTrigger value="travelers" data-testid="tab-travelers"><Users className="h-3.5 w-3.5 mr-1" />{t("travelers")} <span className="ml-1 text-xs text-muted-foreground">{travelers?.length ?? "—"}</span></TabsTrigger>
          <TabsTrigger value="fulfillment" data-testid="tab-fulfillment"><Workflow className="h-3.5 w-3.5 mr-1" />{t("service_status")} <span className="ml-1 text-xs text-muted-foreground">{displayedWorkflows.length ?? "—"}</span></TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents"><FileText className="h-3.5 w-3.5 mr-1" />{t("documents")} <span className="ml-1 text-xs text-muted-foreground">{documents?.length ?? "—"}</span></TabsTrigger>
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
                    <p className="text-xs text-muted-foreground">{t("tour_label")}</p>
                    <p className="font-medium text-xs truncate" title={tour?.title || booking.tourId || ""} data-testid="summary-tour-id">
                      {tour?.title || booking.tourId || t("not_available")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("departure_date")}</p>
                    <p className="font-medium text-xs" data-testid="summary-departure-id">
                      {selectedDeparture?.startDate 
                        ? `${format(new Date(selectedDeparture.startDate), "dd MMM yyyy")} - ${selectedDeparture.endDate ? format(new Date(selectedDeparture.endDate), "dd MMM yyyy") : ""}`
                        : (booking.departureId || t("not_available"))}
                    </p>
                  </div>
                  {booking.departureCity && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("departure_city") || "Departure City"}</p>
                      <p className="font-medium text-xs" data-testid="summary-departure-city">{booking.departureCity}</p>
                    </div>
                  )}
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

            {/* Accommodation & Hotel Details Card */}
            {((tourHotels && tourHotels.length > 0) || booking.roomType) && (
              <Card className="md:col-span-2 border-primary/20 bg-muted/10" data-testid="card-admin-accommodation-info">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-1.5">
                      <Hotel className="h-4 w-4 text-primary" />
                      {t("accommodation_details")}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="gap-1">
                        <Bed className="h-3 w-3" />
                        {roomsNeeded} {t("rooms_summary")} ({booking.roomType ? t((booking.roomType === "matrimonial" ? "room_matrimonial" : booking.roomType === "doble" ? "room_double" : "room_triple") as any) : "Standard"})
                      </Badge>
                      {selectedDeparture?.startDate && (
                        <span className="text-muted-foreground">
                          {format(new Date(selectedDeparture.startDate), "dd MMM")} - {selectedDeparture.endDate ? format(new Date(selectedDeparture.endDate), "dd MMM yyyy") : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {tourHotels && tourHotels.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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



        {/* TAB D: Fulfillment */}
        <TabsContent value="fulfillment" className="mt-4">
          {displayedWorkflows && displayedWorkflows.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{t("service_status")}</h2>
                  <p className="text-sm text-muted-foreground">{t("service_status_summary")}</p>
                </div>
                <div className="rounded-full border bg-background/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
                  <span className="font-semibold text-foreground">{displayedWorkflows.filter((wf) => wf.status === "completed").length}/{displayedWorkflows.length}</span>{" "}
                  <span>{t("services_completed")}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {displayedWorkflows.map((wf) => {
                const Icon = serviceIcons[wf.serviceType] || Workflow;
                const presentation = getAdminServiceStatusPresentation(wf.status);
                const StatusIcon = presentation.icon;
                const assignedName = getUserName(wf.assignedUserId);

                return (
                  <Card key={wf.id} className="h-full border-border/80 flex flex-col justify-between hover:bg-accent/5 transition-colors shadow-xs" data-testid={`card-workflow-${wf.id}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <span className="font-semibold text-sm block" data-testid={`text-workflow-type-${wf.id}`}>
                              {SERVICE_TYPES[wf.serviceType] || wf.serviceType}
                            </span>
                            {wf.countryCode && (
                              <p className="text-[11px] text-muted-foreground" data-testid={`text-workflow-country-${wf.id}`}>
                                {t("country_prefix")} {wf.countryCode}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`gap-1.5 py-0.5 px-2.5 text-xs ${presentation.badgeClass}`}
                          data-testid={`badge-workflow-status-${wf.id}`}
                        >
                          <StatusIcon className="h-3.5 w-3.5" />
                          {presentation.label}
                        </Badge>
                      </div>

                      {wf.serviceType === "airline" && (() => {
                        const flightSched = getFlightSchedule(
                          selectedDeparture?.startDate,
                          selectedDeparture?.endDate,
                          tour?.countries,
                          tourTitle
                        );

                        return (
                          <div className="p-2.5 rounded bg-sky-500/10 border border-sky-500/20 text-xs space-y-1.5" data-testid={`admin-airline-summary-${wf.id}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 font-medium text-sky-800 dark:text-sky-300">
                                <Plane className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                <span>
                                  {booking.departureCity || "Jakarta (CGK)"} &rarr; {destination || tourTitle || "Destinasi Tour"}
                                </span>
                              </div>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${flightSched.isInternational ? "border-indigo-300 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50" : "border-emerald-300 text-emerald-700 dark:text-emerald-300 bg-emerald-50/50"}`}>
                                {flightSched.routeTypeLabel}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                              {flightSched.flightDepartureDate && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-sky-600" />
                                  <span className="text-foreground font-medium">Berangkat:</span> {format(flightSched.flightDepartureDate, "dd MMM yyyy")} ({flightSched.tagLabel})
                                </span>
                              )}
                              {flightSched.flightReturnDate && (
                                <span className="flex items-center gap-1">
                                  <span className="text-foreground font-medium">Pulang:</span> {format(flightSched.flightReturnDate, "dd MMM yyyy")}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Ticket className="h-3 w-3" />
                                {booking.partySizeExpected || 1} Tiket (Pax)
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {wf.serviceType === "hotel" && (
                        <div className="p-2.5 rounded bg-muted/40 border text-xs space-y-1" data-testid={`admin-hotel-summary-${wf.id}`}>
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <Hotel className="h-3.5 w-3.5 text-primary" />
                            <span>{tourHotels && tourHotels.length > 0 ? tourHotels.map((h: any) => h.name).join(", ") : t("hotel_information")}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Bed className="h-3 w-3" />
                              {roomsNeeded} {t("rooms_summary")} ({booking.roomType ? t((booking.roomType === "matrimonial" ? "room_matrimonial" : booking.roomType === "doble" ? "room_double" : "room_triple") as any) : "Standard"})
                            </span>
                            {selectedDeparture?.startDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(selectedDeparture.startDate), "dd MMM")} - {selectedDeparture.endDate ? format(new Date(selectedDeparture.endDate), "dd MMM yyyy") : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="border-t pt-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground truncate" data-testid={`text-workflow-assigned-${wf.id}`}>
                            <span className="font-medium text-foreground">{t("assigned_to")}:</span>{" "}
                            {wf.assignedUserId ? assignedName : <span className="italic">{t("unassigned")}</span>}
                          </p>
                          {wf.notes && (
                            <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                              {wf.notes}
                            </p>
                          )}
                        </div>

                        {isOps && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5 shrink-0"
                            onClick={() => openManageWorkflow(wf)}
                            disabled={booking.status === "cancelled"}
                            data-testid={`button-manage-workflow-${wf.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5 text-primary" />
                            <span>Kelola Layanan</span>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              </div>
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
            {/* Payment Schedule (installments) */}
            {Array.isArray(schedule) && schedule.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("payment_schedule_title")}</h3>
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
                              {" · "}{t("schedule_amount_paid")}: {inst.currency} {parseFloat(inst.paidAmount).toFixed(2)}
                              {" · "}{t("schedule_remaining")}: {inst.currency} {remaining.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div>
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
                            <SelectItem key={inv.id} value={inv.id}>{inv.invoiceNumber} - {inv.currency} {Number(inv.amount).toFixed(2)}</SelectItem>
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
                              {p.currency} {Number(p.amount).toFixed(2)}
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
                            {inv.currency} {Number(inv.amount).toFixed(2)} | {t("due_label")} {inv.dueDate || t("not_available")}
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

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {t("cancel_booking")}
            </DialogTitle>
            <DialogDescription>
              {t("cancel_booking_confirm_text")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs">{t("cancellation_reason_label")}</Label>
            <Textarea
              placeholder={t("cancellation_reason_placeholder")}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              data-testid="input-cancel-reason"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCancelDialog(false)} disabled={updateBooking.isPending}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => updateBooking.mutate({ status: "cancelled", reason: cancelReason })}
              disabled={updateBooking.isPending}
              data-testid="button-confirm-cancel-booking"
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              {t("confirm_cancellation")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Kelola Layanan */}
      <Dialog open={!!managingWorkflow} onOpenChange={(open) => !open && setManagingWorkflow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Kelola Layanan: {managingWorkflow ? (SERVICE_TYPES[managingWorkflow.serviceType] || managingWorkflow.serviceType) : ""}
            </DialogTitle>
            <DialogDescription>
              Atur status layanan dan staf yang ditugaskan secara langsung tanpa tahapan alur kerja rumit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Status Layanan</Label>
              <Select value={editWorkflowStatus} onValueChange={setEditWorkflowStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih status layanan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_assigned">
                    <span className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-amber-500" />
                      <span>Menunggu (Belum Ditugaskan / Menunggu Diterima Supplier)</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="in_progress">
                    <span className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-sky-500" />
                      <span>Diproses (Supplier Sedang Menyiapkan)</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="completed">
                    <span className="flex items-center gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Selesai (Siap & Terkonfirmasi)</span>
                    </span>
                  </SelectItem>
                  <SelectItem value="cancelled">
                    <span className="flex items-center gap-2">
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Dibatalkan</span>
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-semibold block">{t("assigned_to")}</Label>
                {managingWorkflow?.serviceType && (
                  <span className="text-[11px] text-muted-foreground">
                    Rekomendasi untuk <strong className="capitalize">{SERVICE_TYPES[managingWorkflow.serviceType] || managingWorkflow.serviceType}</strong>
                  </span>
                )}
              </div>
              <Select value={editWorkflowAssignee} onValueChange={setEditWorkflowAssignee}>
                <SelectTrigger>
                  <SelectValue placeholder={t("assign_to_placeholder")} />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="none">
                    <span className="text-muted-foreground italic">-- {t("unassigned")} (Kosongkan) --</span>
                  </SelectItem>
                  {sortedAssignableUsers.map((u) => {
                    const roleLabel = USER_ROLES[u.role || ""] || u.role;
                    const isRecommended = getAssigneeRolePriority(u.role, managingWorkflow?.serviceType) === 1;
                    return (
                      <SelectItem key={u.id} value={u.userId}>
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span className="font-medium">{u.companyName || u.userId}</span>
                          <span className={`text-[11px] ${isRecommended ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                            {roleLabel} {isRecommended && "★"}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Catatan Operasional (Opsional)</Label>
              <Textarea
                placeholder="Tambahkan catatan khusus layanan jika ada..."
                value={editWorkflowNotes}
                onChange={(e) => setEditWorkflowNotes(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setManagingWorkflow(null)}>
              {t("cancel") || "Batal"}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveWorkflow}
              disabled={updateWorkflow.isPending}
              className="gap-1.5"
            >
              {updateWorkflow.isPending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
