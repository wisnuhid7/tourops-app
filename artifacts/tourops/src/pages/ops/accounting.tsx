import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign,
  CheckCircle2,
  Clock,
  Receipt,
  Plus,
  Search,
  Download,
  Filter,
  FileText,
  RotateCcw,
  Send,
  XCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  Calendar,
} from "lucide-react";

/**
 * Currency formatter helper using USD as default or specified currency.
 * Guarantees proper floating-point parsing rather than string concatenation.
 */
function formatCurrency(val: number | string | null | undefined, currency = "USD"): string {
  const num = typeof val === "number" ? val : parseFloat(String(val || "0"));
  const validNum = isNaN(num) ? 0 : num;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(validNum);
  } catch {
    return `$${validNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/**
 * Accounting / Finance dashboard — handles receivables, payments tracking,
 * manual payments recording, reconciliation (confirm paid with bank mutation trail),
 * refunds, filtering, and reporting.
 */
export default function AccountingDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();

  // Queries
  const { data: bookings, isLoading: bookingsLoading } = useQuery<any[]>({ queryKey: ["/api/bookings"] });
  const { data: payments, isLoading: paymentsLoading } = useQuery<any[]>({ queryKey: ["/api/payments"] });
  const { data: userProfiles } = useQuery<any[]>({ queryKey: ["/api/user-profiles"] });

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "this_week" | "this_month" | "custom">("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal states
  const [recordFor, setRecordFor] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [recordPaymentType, setRecordPaymentType] = useState("full_payment");
  const [notes, setNotes] = useState("");

  // Reconciliation modal state
  const [reconcilePayment, setReconcilePayment] = useState<any | null>(null);
  const [actualPaidDate, setActualPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [transactionRef, setTransactionRef] = useState("");
  const [reconcileType, setReconcileType] = useState("full_payment");
  const [proofUrl, setProofUrl] = useState("");
  const [reconcileNotes, setReconcileNotes] = useState("");

  // Refund dialog state
  const [refundPayment, setRefundPayment] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");

  // Receipt / Detail preview dialog state
  const [receiptDetail, setReceiptDetail] = useState<any | null>(null);

  // Lookups
  const bookingById = useMemo(() => new Map((bookings || []).map((b) => [b.id, b])), [bookings]);
  const userProfileById = useMemo(() => new Map((userProfiles || []).map((u) => [u.userId, u])), [userProfiles]);

  const getCustomerName = (payment: any, booking?: any): string => {
    // 1. Direct fields joined from users table
    const joinedName = [payment?.customerFirstName, payment?.customerLastName].filter(Boolean).join(" ").trim();
    if (joinedName) return joinedName;
    if (payment?.customerName) return payment.customerName;
    if (payment?.customerEmail) return payment.customerEmail;

    // 2. Booking-level customer
    const b = booking || (payment?.bookingId ? bookingById.get(payment.bookingId) : null);
    if (b) {
      const prof = b.customerId ? userProfileById.get(b.customerId) : null;
      if (prof?.companyName) return prof.companyName;
      if (prof?.user) {
        const uName = [prof.user.firstName, prof.user.lastName].filter(Boolean).join(" ").trim();
        if (uName) return uName;
        if (prof.user.username) return prof.user.username;
        if (prof.user.email) return prof.user.email;
      }
      if (b.groupName) return b.groupName;
      if (b.customerId) return `Customer #${b.customerId.slice(0, 8)}`;
    }

    return "Customer";
  };

  const getPaymentTypeInfo = (payment: any, booking?: any) => {
    const metaType = payment.metadata?.paymentType;
    if (metaType === "deposit" || payment.notes?.toLowerCase().includes("deposit") || payment.notes?.toLowerCase().includes("dp")) {
      return { label: "DP / Deposit", variant: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" };
    }
    if (metaType === "installment" || payment.notes?.toLowerCase().includes("installment") || payment.notes?.toLowerCase().includes("cicilan")) {
      return { label: "Cicilan / Installment", variant: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800" };
    }
    if (metaType === "full_payment" || payment.notes?.toLowerCase().includes("full") || payment.notes?.toLowerCase().includes("pelunasan")) {
      return { label: "Pelunasan / Full", variant: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" };
    }

    const b = booking || (payment.bookingId ? bookingById.get(payment.bookingId) : null);
    if (b && Number(b.totalPrice) > 0) {
      const pAmt = Number(payment.amount) || 0;
      const bTotal = Number(b.totalPrice) || 0;
      if (pAmt < bTotal) {
        return { label: "DP / Deposit", variant: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" };
      }
    }
    return { label: "Full Payment", variant: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700" };
  };

  // Mutations
  const recordPayment = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/bookings/${recordFor.id}/payments`, {
        amount: parseFloat(amount),
        currency: recordFor.currency || "USD",
        method,
        status: "pending",
        notes: notes ? `[${recordPaymentType.toUpperCase()}] ${notes}` : `[${recordPaymentType.toUpperCase()}]`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: t("payment_recorded") || "Payment recorded successfully" });
      setRecordFor(null);
      setAmount("");
      setNotes("");
      setRecordPaymentType("full_payment");
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      if (!reconcilePayment) return;
      const body = {
        status: "paid",
        transactionId: transactionRef.trim() || undefined,
        receiptUrl: proofUrl.trim() || undefined,
        metadata: {
          ...(reconcilePayment.metadata || {}),
          paidAt: actualPaidDate,
          paymentType: reconcileType,
          reconciledAt: new Date().toISOString(),
          referenceNumber: transactionRef.trim() || undefined,
        },
        notes: reconcileNotes.trim()
          ? `${reconcilePayment.notes ? `${reconcilePayment.notes} | ` : ""}[Reconciled ${actualPaidDate}${transactionRef ? ` Ref: ${transactionRef.trim()}` : ""}]: ${reconcileNotes.trim()}`
          : reconcilePayment.notes,
      };
      return apiRequest("PATCH", `/api/payments/${reconcilePayment.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({
        title: t("payment_confirmed") || "Payment Confirmed & Reconciled",
        description: `Ref #${transactionRef || "N/A"} recorded for ${reconcilePayment?.bookingCode || "Booking"}.`,
      });
      setReconcilePayment(null);
      setTransactionRef("");
      setProofUrl("");
      setReconcileNotes("");
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const cancelPaymentMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/payments/${id}`, { status: "canceled" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: "Payment canceled" });
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!refundPayment) return;
      const body: Record<string, any> = {
        reason: refundReason.trim(),
        notes: refundNotes.trim() || undefined,
      };
      if (refundAmount.trim()) {
        body.amount = Number(parseFloat(refundAmount).toFixed(2));
      }
      return apiRequest("POST", `/api/payments/${refundPayment.id}/refunds`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: "Refund submitted successfully" });
      setRefundPayment(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundNotes("");
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  // Calculate Metrics safely using Number conversion to prevent string concatenation
  const { bookedTotal, paidTotal, pendingTotal, pendingCount, paidCount } = useMemo(() => {
    const pList = payments || [];
    const bList = bookings || [];

    const pPaid = pList.filter((p) => p.status === "paid");
    const pPending = pList.filter((p) => p.status === "pending");

    const pTotal = pPaid.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
    const pendTotal = pPending.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
    const bTotal = bList.reduce((acc, item) => acc + (Number(item.totalPrice) || 0), 0);

    return {
      bookedTotal: bTotal,
      paidTotal: pTotal,
      pendingTotal: pendTotal,
      pendingCount: pPending.length,
      paidCount: pPaid.length,
    };
  }, [payments, bookings]);

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    let list = payments || [];

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter((p) => {
        const code = (p.bookingCode || bookingById.get(p.bookingId)?.bookingCode || "").toLowerCase();
        const custName = getCustomerName(p).toLowerCase();
        const trxId = (p.transactionId || "").toLowerCase();
        const notesText = (p.notes || "").toLowerCase();
        return code.includes(q) || custName.includes(q) || trxId.includes(q) || notesText.includes(q);
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }

    // Method filter
    if (methodFilter !== "all") {
      list = list.filter((p) => p.method === methodFilter);
    }

    // Date range filter
    if (dateFilter !== "all") {
      const now = new Date();
      list = list.filter((p) => {
        const itemDate = new Date(p.metadata?.paidAt || p.createdAt || "");
        if (isNaN(itemDate.getTime())) return true;

        if (dateFilter === "today") {
          return itemDate.toDateString() === now.toDateString();
        }
        if (dateFilter === "this_week") {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          return itemDate >= sevenDaysAgo && itemDate <= now;
        }
        if (dateFilter === "this_month") {
          return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
        }
        if (dateFilter === "custom") {
          if (customStartDate && itemDate < new Date(`${customStartDate}T00:00:00`)) return false;
          if (customEndDate && itemDate > new Date(`${customEndDate}T23:59:59`)) return false;
          return true;
        }
        return true;
      });
    }

    return list;
  }, [payments, searchTerm, statusFilter, methodFilter, dateFilter, customStartDate, customEndDate, bookingById, userProfileById]);

  // Paginated payments
  const totalPages = Math.ceil(filteredPayments.length / pageSize) || 1;
  const paginatedPayments = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredPayments.slice(startIndex, startIndex + pageSize);
  }, [filteredPayments, page, pageSize]);

  // Export to CSV function
  const handleExportCSV = () => {
    if (!filteredPayments.length) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    const headers = [
      "Payment ID",
      "Booking Code",
      "Customer Name",
      "Amount",
      "Currency",
      "Payment Type",
      "Method",
      "Status",
      "Date",
      "Transaction ID / Reference",
      "Notes",
    ];

    const rows = filteredPayments.filter(Boolean).map((p) => {
      const b = p.bookingId ? bookingById.get(p.bookingId) : null;
      const cust = getCustomerName(p, b);
      const typeInfo = getPaymentTypeInfo(p, b);
      const dateStr = p.metadata?.paidAt || (p.createdAt ? new Date(p.createdAt).toISOString().slice(0, 10) : "");
      return [
        `"${p.id}"`,
        `"${p.bookingCode || b?.bookingCode || p.bookingId}"`,
        `"${cust.replace(/"/g, '""')}"`,
        p.amount || 0,
        `"${p.currency || "USD"}"`,
        `"${typeInfo.label}"`,
        `"${p.method || ""}"`,
        `"${p.status || ""}"`,
        `"${dateStr}"`,
        `"${p.transactionId || ""}"`,
        `"${(p.notes || "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `finance_payments_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "CSV exported successfully" });
  };

  const sendReminderMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await apiRequest("POST", `/api/payments/${paymentId}/remind`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: t("reminder_sent_success") || "Reminder Sent Successfully",
        description: data.emailSent
          ? (t("reminder_in_app_email_sent") || "Notifikasi in-app & email telah dikirim ke {recipient}.").replace("{recipient}", data.recipient)
          : (t("reminder_in_app_sent") || "Notifikasi in-app telah dikirim ke akun pelanggan ({recipient}).").replace("{recipient}", data.recipient),
      });
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const handleSendReminder = (payment: any) => {
    sendReminderMutation.mutate(payment.id);
  };

  const pBookingCode = (p: any) => {
    if (!p) return "—";
    return p.bookingCode || (p.bookingId ? bookingById.get(p.bookingId)?.bookingCode : "") || p.bookingId || "—";
  };

  const statusBadge = (st: string) => {
    switch (st) {
      case "paid":
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium">Paid</Badge>;
      case "pending":
        return <Badge variant="secondary" className="font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">Pending</Badge>;
      case "processing":
        return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">Processing</Badge>;
      case "refunded":
        return <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50">Refunded</Badge>;
      case "canceled":
        return <Badge variant="outline" className="text-muted-foreground border-slate-300">Canceled</Badge>;
      default:
        return <Badge variant="destructive">{st}</Badge>;
    }
  };

  if (bookingsLoading || paymentsLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto" data-testid="accounting-dashboard">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-600" />
            {t("finance_dashboard") || "Finance Dashboard"}
          </h1>
          <p className="text-muted-foreground">
            {t("finance_dashboard_subtitle") || "Receivables, payments, and reconciliation"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between text-muted-foreground">
              <span>{t("total_booked_value") || "Total Booked Value"}</span>
              <Receipt className="h-4 w-4 text-blue-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight" data-testid="stat-booked">
              {formatCurrency(bookedTotal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {bookings?.length || 0} bookings recorded
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between text-muted-foreground">
              <span>{t("collected_payments") || "Collected Payments"}</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400" data-testid="stat-paid">
              {formatCurrency(paidTotal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {paidCount} completed transactions
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between text-muted-foreground">
              <span>{t("pending_payments") || "Pending Payments"}</span>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400" data-testid="stat-pending">
              {formatCurrency(pendingTotal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1 font-medium">
              {pendingCount} transactions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payments Management Table with Search & Filters */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                {t("payments") || "Payments Ledger"}
                <Badge variant="secondary" className="ml-2 font-normal">
                  {filteredPayments.length} total
                </Badge>
              </CardTitle>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  placeholder="Search Booking, Client, Ref..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <div>
                <Select
                  value={statusFilter}
                  onValueChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status: All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select
                  value={methodFilter}
                  onValueChange={(val) => {
                    setMethodFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Method: All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="card">Credit Card</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select
                  value={dateFilter}
                  onValueChange={(val: any) => {
                    setDateFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Period: All Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="this_week">Past 7 Days</SelectItem>
                    <SelectItem value="this_month">This Month</SelectItem>
                    <SelectItem value="custom">Custom Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom Date Range pickers */}
            {dateFilter === "custom" && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-sm bg-muted/40 p-3 rounded-md">
                <span className="font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-4 w-4" /> Range:
                </span>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    className="w-36 h-8 text-xs"
                    value={customStartDate}
                    onChange={(e) => {
                      setCustomStartDate(e.target.value);
                      setPage(1);
                    }}
                  />
                  <span>to</span>
                  <Input
                    type="date"
                    className="w-36 h-8 text-xs"
                    value={customEndDate}
                    onChange={(e) => {
                      setCustomEndDate(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                {(customStartDate || customEndDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => {
                      setCustomStartDate("");
                      setCustomEndDate("");
                    }}
                  >
                    Clear dates
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[140px]">Date / Due</TableHead>
                  <TableHead className="w-[220px]">Booking & Client</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Ref / Proof</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPayments.filter(Boolean).map((p) => {
                  const b = p.bookingId ? bookingById.get(p.bookingId) : null;
                  const custName = getCustomerName(p, b);
                  const typeInfo = getPaymentTypeInfo(p, b);
                  const dateDisplay = p.metadata?.paidAt
                    ? new Date(p.metadata.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : p.createdAt
                    ? new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "—";

                  return (
                    <TableRow key={p.id} data-testid={`payment-row-${p.id}`} className="hover:bg-muted/30">
                      {/* Date */}
                      <TableCell className="text-xs">
                        <div className="font-medium">{dateDisplay}</div>
                        <span className="text-muted-foreground text-[10px]">
                          {p.status === "paid" ? "Paid Date" : "Due Date"}
                        </span>
                      </TableCell>

                      {/* Booking Code & Customer */}
                      <TableCell>
                        <div className="font-semibold text-sm flex items-center gap-1.5">
                          <span>{pBookingCode(p)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={custName}>
                          {custName}
                        </div>
                      </TableCell>

                      {/* Payment Type */}
                      <TableCell>
                        <Badge variant="outline" className={`text-xs px-2 py-0.5 font-normal ${typeInfo.variant}`}>
                          {typeInfo.label}
                        </Badge>
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="font-semibold text-sm">
                        {formatCurrency(p.amount, p.currency)}
                        {p.refundedAmount && Number(p.refundedAmount) > 0 ? (
                          <div className="text-[10px] text-destructive">
                            Ref: -{formatCurrency(p.refundedAmount, p.currency)}
                          </div>
                        ) : null}
                      </TableCell>

                      {/* Method */}
                      <TableCell className="text-xs capitalize">
                        {p.method?.replace("_", " ") || "—"}
                      </TableCell>

                      {/* Reference / Proof */}
                      <TableCell className="text-xs">
                        {p.transactionId ? (
                          <div className="font-mono bg-muted/60 px-1.5 py-0.5 rounded text-[11px] inline-block max-w-[130px] truncate" title={p.transactionId}>
                            {p.transactionId}
                          </div>
                        ) : p.receiptUrl ? (
                          <a
                            href={p.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1 text-[11px]"
                          >
                            <ExternalLink className="h-3 w-3" /> Proof
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>{statusBadge(p.status)}</TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Pending Actions */}
                          {p.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => {
                                  setReconcilePayment(p);
                                  setActualPaidDate(new Date().toISOString().slice(0, 10));
                                  setTransactionRef(p.transactionId || "");
                                  setReconcileType(typeInfo.label.includes("DP") ? "deposit" : "full_payment");
                                  setProofUrl(p.receiptUrl || "");
                                  setReconcileNotes("");
                                }}
                                data-testid={`button-confirm-${p.id}`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                {t("confirm_paid") || "Confirm Paid"}
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                                title={t("send_payment_reminder_tooltip") || "Send Payment Reminder (Email & In-App)"}
                                disabled={sendReminderMutation.isPending}
                                onClick={() => handleSendReminder(p)}
                              >
                                <Send className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                title="Cancel Payment"
                                onClick={() => {
                                  if (confirm("Are you sure you want to cancel this pending payment?")) {
                                    cancelPaymentMutation.mutate(p.id);
                                  }
                                }}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}

                          {/* Paid Actions */}
                          {p.status === "paid" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => setReceiptDetail(p)}
                                title="View Receipt / Invoice"
                              >
                                <FileText className="h-3.5 w-3.5 mr-1" />
                                Receipt
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  setRefundPayment(p);
                                  setRefundAmount(String(p.amount || ""));
                                  setRefundReason("");
                                  setRefundNotes("");
                                }}
                                title="Issue Refund"
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                Refund
                              </Button>
                            </>
                          )}

                          {/* General Detail View */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground"
                            onClick={() => setReceiptDetail(p)}
                            title="View Transaction Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {filteredPayments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No payments matching the selected criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {filteredPayments.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Rows per page:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    setPageSize(Number(val));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-16 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
                <span className="ml-2">
                  Showing {Math.min((page - 1) * pageSize + 1, filteredPayments.length)}–
                  {Math.min(page * pageSize, filteredPayments.length)} of {filteredPayments.length} results
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receivables & Bookings Tracking */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">{t("receivables_bookings") || "Receivables & Bookings"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>{t("booking") || "Booking"}</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>{t("status") || "Status"}</TableHead>
                  <TableHead>{t("total") || "Total Value"}</TableHead>
                  <TableHead className="text-right">{t("actions") || "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(bookings || []).filter(Boolean).map((b) => {
                  const custName = getCustomerName(null, b);
                  return (
                    <TableRow key={b.id} data-testid={`booking-row-${b.id}`} className="hover:bg-muted/30">
                      <TableCell className="font-semibold text-sm">{b?.bookingCode || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{custName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs font-normal">
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold text-sm">
                        {formatCurrency(b.totalPrice, b.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRecordFor(b);
                            setAmount("");
                            setNotes("");
                            setRecordPaymentType("full_payment");
                          }}
                          data-testid={`button-record-${b.id}`}
                          className="h-8 text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                          {t("record_payment") || "Record Payment"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!bookings || bookings.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      {t("no_bookings_found") || "No bookings found"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL 1: Reconciliation ("Confirm Paid") */}
      <Dialog open={!!reconcilePayment} onOpenChange={(o) => !o && setReconcilePayment(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Reconciliation & Confirm Payment
            </DialogTitle>
            <DialogDescription>
              Verify actual bank mutation details before recording this transaction as Paid.
            </DialogDescription>
          </DialogHeader>

          {reconcilePayment && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/40 p-3 rounded-lg border text-sm grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground text-xs">Booking:</span>
                  <div className="font-semibold">{pBookingCode(reconcilePayment)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Customer:</span>
                  <div className="font-semibold truncate">{getCustomerName(reconcilePayment)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Amount Due:</span>
                  <div className="font-bold text-emerald-600">
                    {formatCurrency(reconcilePayment.amount, reconcilePayment.currency)}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Payment Method:</span>
                  <div className="capitalize font-medium">{reconcilePayment.method?.replace("_", " ")}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="actual-date" className="text-xs font-medium">
                    Tanggal Bayar Aktual (Actual Paid Date) *
                  </Label>
                  <Input
                    id="actual-date"
                    type="date"
                    value={actualPaidDate}
                    onChange={(e) => setActualPaidDate(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="trans-ref" className="text-xs font-medium">
                    Nomor Referensi / Mutasi Bank (Transaction ID / Reference) *
                  </Label>
                  <Input
                    id="trans-ref"
                    placeholder="e.g. BCA-98234123 atau TXN-99824"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="mt-1 font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Nomor transaksi dari mutasi rekening bank atau bukti transfer gateway.
                  </p>
                </div>

                <div>
                  <Label className="text-xs font-medium">Tipe Pembayaran (Payment Type)</Label>
                  <Select value={reconcileType} onValueChange={setReconcileType}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_payment">Pelunasan / Full Payment</SelectItem>
                      <SelectItem value="deposit">Uang Muka / Deposit (DP)</SelectItem>
                      <SelectItem value="installment">Cicilan / Installment</SelectItem>
                      <SelectItem value="other">Lainnya / Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="proof-url" className="text-xs font-medium">
                    Link Bukti Bayar / Receipt File (Opsional)
                  </Label>
                  <Input
                    id="proof-url"
                    placeholder="https://... atau nomor lampiran mutasi"
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor="recon-notes" className="text-xs font-medium">
                    Catatan Rekonsiliasi (Audit Notes)
                  </Label>
                  <Textarea
                    id="recon-notes"
                    placeholder="Contoh: Mutasi telah dicocokkan dengan rekening koran BCA tanggal 21 Okt..."
                    value={reconcileNotes}
                    onChange={(e) => setReconcileNotes(e.target.value)}
                    className="mt-1 resize-none h-16 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReconcilePayment(null)}>
              {t("cancel") || "Cancel"}
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
            >
              {reconcileMutation.isPending ? "Reconciling..." : "Confirm & Mark Paid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Record Manual Payment */}
      <Dialog open={!!recordFor} onOpenChange={(o) => !o && setRecordFor(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>
              {t("record_payment") || "Record Payment"}{recordFor?.bookingCode ? ` — ${recordFor.bookingCode}` : ""}
            </DialogTitle>
            <DialogDescription>
              Record a received receivable or customer installment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="pay-amount">
                {t("amount") || "Amount"} ({recordFor?.currency || "USD"}) *
              </Label>
              <Input
                id="pay-amount"
                type="number"
                step="any"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="input-amount"
                className="mt-1 font-semibold"
              />
            </div>
            <div>
              <Label>{t("method") || "Payment Method"}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger data-testid="select-method" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">{t("bank_transfer") || "Bank Transfer"}</SelectItem>
                  <SelectItem value="card">{t("card") || "Credit Card"}</SelectItem>
                  <SelectItem value="cash">{t("cash") || "Cash"}</SelectItem>
                  <SelectItem value="other">{t("other") || "Other"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipe Pembayaran (Payment Type)</Label>
              <Select value={recordPaymentType} onValueChange={setRecordPaymentType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_payment">Full Payment / Pelunasan</SelectItem>
                  <SelectItem value="deposit">Deposit / DP</SelectItem>
                  <SelectItem value="installment">Installment / Cicilan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pay-notes">{t("notes") || "Notes / Mutation Reference"}</Label>
              <Input
                id="pay-notes"
                placeholder="Reference number or note"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-notes"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordFor(null)}>
              {t("cancel") || "Cancel"}
            </Button>
            <Button
              onClick={() => recordPayment.mutate()}
              disabled={!amount || recordPayment.isPending}
              data-testid="button-save-payment"
            >
              {recordPayment.isPending ? "Saving..." : t("save") || "Save Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Issue Refund */}
      <Dialog open={!!refundPayment} onOpenChange={(o) => !o && setRefundPayment(null)}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <RotateCcw className="h-5 w-5" />
              Process Payment Refund
            </DialogTitle>
            <DialogDescription>
              Submit a refund request for {refundPayment ? pBookingCode(refundPayment) : "this transaction"}.
            </DialogDescription>
          </DialogHeader>
          {refundPayment && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/40 p-3 rounded-lg border text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Payment:</span>
                  <span className="font-semibold">{formatCurrency(refundPayment.amount, refundPayment.currency)}</span>
                </div>
                {refundPayment.refundedAmount && Number(refundPayment.refundedAmount) > 0 ? (
                  <div className="flex justify-between text-xs text-destructive mt-1">
                    <span>Already Refunded:</span>
                    <span>-{formatCurrency(refundPayment.refundedAmount, refundPayment.currency)}</span>
                  </div>
                ) : null}
              </div>

              <div>
                <Label htmlFor="refund-amount">Refund Amount ({refundPayment.currency || "USD"})</Label>
                <Input
                  id="refund-amount"
                  type="number"
                  step="any"
                  max={refundPayment.amount}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="refund-reason">Refund Reason *</Label>
                <Input
                  id="refund-reason"
                  placeholder="e.g. Booking cancellation, customer request"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="refund-notes">Notes</Label>
                <Textarea
                  id="refund-notes"
                  placeholder="Optional internal notes"
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  className="mt-1 h-16 resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundPayment(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => refundMutation.mutate()}
              disabled={!refundReason.trim() || refundMutation.isPending}
            >
              {refundMutation.isPending ? "Processing..." : "Process Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Payment Voucher / Receipt Preview */}
      <Dialog open={!!receiptDetail} onOpenChange={(o) => !o && setReceiptDetail(null)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-lg">
              <span className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Payment Receipt & Voucher
              </span>
              {receiptDetail && statusBadge(receiptDetail.status)}
            </DialogTitle>
          </DialogHeader>

          {receiptDetail && (
            <div className="space-y-4 py-2 text-sm border-t border-b py-4 my-2" id="printable-receipt">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Transaction Ref</span>
                  <div className="font-mono font-medium text-xs mt-0.5">
                    {receiptDetail.transactionId || receiptDetail.id}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Payment Date</span>
                  <div className="font-medium text-xs mt-0.5">
                    {receiptDetail.metadata?.paidAt ||
                      (receiptDetail.createdAt ? new Date(receiptDetail.createdAt).toLocaleString() : "N/A")}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Booking Code</span>
                  <div className="font-semibold text-sm mt-0.5">{pBookingCode(receiptDetail)}</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Client / Customer</span>
                  <div className="font-medium text-sm mt-0.5">{getCustomerName(receiptDetail)}</div>
                </div>
              </div>

              <div className="bg-muted/40 p-4 rounded-lg space-y-2">
                <div className="flex justify-between font-medium">
                  <span>Gross Amount</span>
                  <span>{formatCurrency(receiptDetail.amount, receiptDetail.currency)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Payment Method</span>
                  <span className="capitalize">{receiptDetail.method?.replace("_", " ")}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Payment Type</span>
                  <span>{getPaymentTypeInfo(receiptDetail).label}</span>
                </div>
                {receiptDetail.notes && (
                  <div className="border-t pt-2 mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Notes:</span> {receiptDetail.notes}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.print();
              }}
            >
              Print / Save PDF
            </Button>
            <Button variant="default" size="sm" onClick={() => setReceiptDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
