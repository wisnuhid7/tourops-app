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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation, useSearch, Link } from "wouter";
import {
  DollarSign, CheckCircle2, Clock, Receipt, Plus, Search,
  Download, ExternalLink, RotateCcw, AlertTriangle, Eye, ArrowUpDown,
  CreditCard, Calendar, FileText, Check, X, ShieldCheck, Filter,
  ArrowLeft, ChevronRight
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Payment, Booking, Invoice, BookingPaymentSchedule } from "@workspace/db";

const fmt = (cents: number | null | undefined, currency?: string | null) => {
  const dollars = (cents ?? 0) / 100;
  return `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || "USD"}`;
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default",
  pending: "secondary",
  processing: "secondary",
  failed: "destructive",
  canceled: "outline",
  refunded: "outline",
};

const accountingI18n = {
  en: {
    back_to_dashboard: "Back to Finance Dashboard",
    overview_sub: "Reconciliation of payments, transfer verification, receivables monitoring, and official invoice management.",
    verification_title: "Transfer Verification",
    verification_sub: "Queue of customer manual bank transfer receipts requiring accounting verification.",
    payments_title: "All Transactions & Refunds",
    payments_sub: "Complete transaction logs for Stripe gateway & bank transfers, plus refund processing.",
    schedules_title: "Installment Schedules (AR Aging)",
    schedules_sub: "Installment due date tracking (AR aging) and customer receivables monitoring.",
    invoices_title: "Official Invoices & Billing",
    invoices_sub: "Official invoice billing issuance for tour bookings and PDF statement downloads.",
    bookings_title: "Booking Recap & Receivables",
    bookings_sub: "Booking summaries, manual payment recording, and balance verification.",
    export_csv: "Export CSV",
    create_invoice: "Create Invoice",
    total_booked_desc: "Total contract value across all bookings",
    collected_payments_desc: "Funds effectively deposited into account",
    outstanding_ar: "Outstanding Receivables (AR)",
    outstanding_ar_desc: "Unpaid installment schedules",
    pending_needs_review: "Requires review and verification",
    all_processed: "All transfers processed",
    open_action: "Open →",
    pending_attention_title: "Bank Transfer Receipts Awaiting Your Verification",
    pending_attention_desc: "Customers have uploaded manual payment receipts. Review and confirm incoming funds promptly.",
    open_full_queue: "View Complete Queue",
    shortcut_verification: "Transfer Verification",
    shortcut_verification_desc: "pending verification",
    shortcut_payments: "All Transactions",
    shortcut_payments_desc: "entries logged",
    shortcut_schedules: "Payment Schedules",
    shortcut_schedules_desc: "installment terms",
    shortcut_invoices: "Invoices & Billing",
    shortcut_invoices_desc: "invoices issued",
    shortcut_bookings: "Booking Recap",
    shortcut_bookings_desc: "tour bookings",
    shortcut_reports: "Financial Reports",
    shortcut_reports_desc: "Analytics & export",
    recent_payments: "Recent Payment Transactions",
    recent_payments_sub: "Latest 5 payment logs in system",
    view_all: "View All",
    no_payments_yet: "No payment transactions yet",
    upcoming_schedules: "Upcoming Due & Overdue Receivables",
    upcoming_schedules_sub: "Installment payments requiring attention",
    no_schedules_yet: "No overdue receivables currently",
    queue_title: "Payment Confirmation Queue",
    queue_sub: "List of manual bank transfers requiring receipt verification before approval.",
    amount_label: "Amount",
    total_contract: "Total Contract",
    view_receipt: "View Receipt",
    no_receipt_image: "No Receipt Image Attached",
    reject: "Reject",
    confirm_paid: "Confirm Paid",
    queue_empty_title: "All Transfers Cleared!",
    queue_empty_desc: "There are no pending bank transfers at this time. You can check the complete history in 'All Transactions'.",
    tx_history_title: "All Transactions & Financial Logs",
    tx_history_sub: "Incoming payment logs from Stripe, manual bank transfers, and refund records.",
    search_placeholder: "Search booking code, notes, ID...",
    status_filter_all: "All Statuses",
    status_paid: "Paid",
    status_pending: "Pending",
    status_refunded: "Refunded",
    status_failed: "Failed",
    method_filter_all: "All Methods",
    method_transfer: "Bank Transfer",
    method_card: "Card (Stripe)",
    method_cash: "Cash",
    th_booking_code: "Booking Code",
    th_date: "Date",
    th_amount: "Amount",
    th_method_provider: "Method & Provider",
    th_status: "Status",
    th_actions: "Actions",
    no_matching_tx: "No transactions match the selected filters.",
    btn_refund: "Refund",
    btn_approve: "Approve",
    schedules_title_full: "Payment Schedules & Receivables (AR Aging)",
    schedules_sub_full: "Track deposit and final installment deadlines to anticipate overdue payments.",
    filter_all_schedules: "All Installments",
    filter_overdue_only: "Overdue Only",
    filter_due_soon: "Due within 7 Days",
    filter_pending: "Pending Payment",
    filter_paid: "Paid in Full",
    th_installment: "Installment",
    th_due_date: "Due Date",
    th_bill_amount: "Amount Due",
    th_paid_amount: "Paid",
    overdue_by: "Overdue by",
    days: "days",
    remaining: "days left",
    of_total: "of total",
    no_schedules_found: "No installment schedules found.",
    invoices_title_full: "Official Invoices List",
    invoices_sub_full: "Issue customer billing statements and download official travel PDF documents.",
    btn_create_new_invoice: "Create New Invoice",
    th_invoice_num: "Invoice #",
    th_issue_date: "Issue Date",
    btn_download_pdf: "Print PDF",
    no_invoices_found: "No invoices created yet. Click 'Create New Invoice' above.",
    bookings_sub_full: "List of active bookings for manual bank transfer or office cash payments.",
    dialog_receipt_title: "Customer Bank Transfer Receipt",
    lbl_booking_code: "Booking Code:",
    lbl_received_amount: "Received Amount:",
    lbl_notes: "Notes:",
    btn_open_full_image: "Open Full Image",
    btn_confirm_incoming: "Confirm Payment Received",
    dialog_record_title: "Record Manual Payment",
    lbl_amount: "Amount",
    lbl_method: "Payment Method",
    lbl_notes_plain: "Notes",
    notes_placeholder: "e.g., Transfer received via bank, ref #...",
    btn_cancel: "Cancel",
    btn_save: "Save Payment",
    dialog_refund_title: "Process Payment Refund",
    lbl_transaction: "Transaction:",
    lbl_max_refund: "Maximum Refund:",
    lbl_refund_amount: "Refund Amount (USD)",
    lbl_refund_reason: "Refund Reason",
    opt_requested_by_customer: "Requested by Customer",
    opt_duplicate: "Duplicate Payment",
    opt_booking_cancelled: "Tour Booking Cancelled",
    opt_other: "Other Reason",
    lbl_internal_notes: "Internal Notes",
    refund_notes_placeholder: "Details of refund back to customer account...",
    btn_confirm_refund: "Confirm Refund",
    dialog_invoice_title: "Issue Official Invoice",
    lbl_select_booking: "Select Booking *",
    lbl_invoice_number: "Invoice Number (Optional / Auto)",
    lbl_invoice_amount: "Amount ($) *",
    lbl_due_date: "Due Date",
    lbl_invoice_notes: "Invoice Notes",
    invoice_notes_placeholder: "Notes printed on official PDF invoice...",
    btn_issue_invoice: "Issue Invoice",
    toast_payment_recorded: "Payment successfully recorded",
    toast_payment_confirmed: "Payment confirmed successfully",
    toast_payment_rejected: "Payment marked as invalid",
    toast_refund_success: "Refund processed successfully",
    toast_refund_failed: "Refund failed to process",
    toast_invoice_created: "Invoice created successfully",
    toast_pdf_downloaded: "Invoice PDF downloaded",
    toast_csv_exported: "Transaction report exported to CSV",
    toast_no_csv_data: "No payment transactions to export",
  },
  es: {
    back_to_dashboard: "Volver al Panel de Finanzas",
    overview_sub: "Conciliación de pagos, verificación de transferencias, seguimiento de cuentas por cobrar y gestión de facturas.",
    verification_title: "Verificación de Transferencias",
    verification_sub: "Cola de comprobantes de transferencia bancaria de clientes que requieren verificación contable.",
    payments_title: "Todas las Transacciones y Reembolsos",
    payments_sub: "Registro completo de transacciones de Stripe y transferencias, más procesamiento de reembolsos.",
    schedules_title: "Cronograma de Pagos (Antigüedad AR)",
    schedules_sub: "Seguimiento de cuotas vencidas y monitoreo de cobros de clientes.",
    invoices_title: "Facturas y Facturación Oficial",
    invoices_sub: "Emisión de facturas oficiales para reservas de tours y descarga de extractos en PDF.",
    bookings_title: "Resumen de Reservas y Cobros",
    bookings_sub: "Resúmenes de reservas, registro de pago manual y verificación de saldos pendientes.",
    export_csv: "Exportar CSV",
    create_invoice: "Crear Factura",
    total_booked_desc: "Valor contractual total de todas las reservas",
    collected_payments_desc: "Fondos efectivamente recibidos en cuenta",
    outstanding_ar: "Cuentas por Cobrar Pendientes (AR)",
    outstanding_ar_desc: "Cuotas de pago aún no cobradas",
    pending_needs_review: "Requiere revisión y confirmación",
    all_processed: "Todas las transferencias procesadas",
    open_action: "Abrir →",
    pending_attention_title: "Comprobantes de Transferencia Pendientes de Verificación",
    pending_attention_desc: "Los clientes han subido comprobantes de pago. Revise y confirme los fondos entrantes.",
    open_full_queue: "Ver Cola Completa",
    shortcut_verification: "Verificación de Transferencias",
    shortcut_verification_desc: "pendientes de validar",
    shortcut_payments: "Todas las Transacciones",
    shortcut_payments_desc: "movimientos registrados",
    shortcut_schedules: "Cronogramas de Pago",
    shortcut_schedules_desc: "cuotas de pago",
    shortcut_invoices: "Facturas y Cobros",
    shortcut_invoices_desc: "facturas emitidas",
    shortcut_bookings: "Resumen de Reservas",
    shortcut_bookings_desc: "reservas de tours",
    shortcut_reports: "Informes Financieros",
    shortcut_reports_desc: "Análisis y exportación",
    recent_payments: "Transacciones de Pago Recientes",
    recent_payments_sub: "Últimos 5 registros de pago en el sistema",
    view_all: "Ver Todas",
    no_payments_yet: "Aún no hay transacciones de pago",
    upcoming_schedules: "Cobros Próximos a Vencer o Vencidos",
    upcoming_schedules_sub: "Cuotas de pago que requieren seguimiento",
    no_schedules_yet: "No hay cuentas por cobrar vencidas en este momento",
    queue_title: "Cola de Confirmación de Pagos",
    queue_sub: "Lista de transferencias manuales que requieren revisión de comprobante antes de su aprobación.",
    amount_label: "Monto",
    total_contract: "Contrato Total",
    view_receipt: "Ver Comprobante",
    no_receipt_image: "Sin Comprobante Adjunto",
    reject: "Rechazar",
    confirm_paid: "Confirmar Pago",
    queue_empty_title: "¡Todas las Transferencias Listas!",
    queue_empty_desc: "No hay transferencias pendientes en este momento. Puede revisar el historial completo en 'Todas las Transacciones'.",
    tx_history_title: "Todas las Transacciones y Movimientos Financieros",
    tx_history_sub: "Historial de pagos entrantes vía Stripe, transferencias bancarias manuales y registros de reembolso.",
    search_placeholder: "Buscar código de reserva, notas, ID...",
    status_filter_all: "Todos los Estados",
    status_paid: "Pagado",
    status_pending: "Pendiente",
    status_refunded: "Reembolsado",
    status_failed: "Fallido",
    method_filter_all: "Todos los Métodos",
    method_transfer: "Transferencia Bancaria",
    method_card: "Tarjeta (Stripe)",
    method_cash: "Efectivo",
    th_booking_code: "Código de Reserva",
    th_date: "Fecha",
    th_amount: "Monto",
    th_method_provider: "Método y Proveedor",
    th_status: "Estado",
    th_actions: "Acciones",
    no_matching_tx: "No hay transacciones que coincidan con los filtros seleccionados.",
    btn_refund: "Reembolso",
    btn_approve: "Aprobar",
    schedules_title_full: "Monitoreo de Cronogramas de Pago y Cuentas por Cobrar (AR)",
    schedules_sub_full: "Monitoree vencimientos de depósitos y pagos finales para prevenir retrasos.",
    filter_all_schedules: "Todas las Cuotas",
    filter_overdue_only: "Solo Vencidas",
    filter_due_soon: "Vence en ≤ 7 Días",
    filter_pending: "Pendiente de Pago",
    filter_paid: "Pagado (Paid)",
    th_installment: "Cuota",
    th_due_date: "Vencimiento",
    th_bill_amount: "Monto a Pagar",
    th_paid_amount: "Pagado",
    overdue_by: "Vencido hace",
    days: "días",
    remaining: "días restantes",
    of_total: "del total",
    no_schedules_found: "No se encontraron cronogramas de pago.",
    invoices_title_full: "Lista de Facturas Oficiales",
    invoices_sub_full: "Emita extractos de facturación a clientes y descargue documentos PDF oficiales de viaje.",
    btn_create_new_invoice: "Crear Nueva Factura",
    th_invoice_num: "N° Factura",
    th_issue_date: "Fecha de Emisión",
    btn_download_pdf: "Imprimir PDF",
    no_invoices_found: "Aún no hay facturas creadas. Haga clic en 'Crear Nueva Factura'.",
    bookings_sub_full: "Lista de reservas activas para registro manual de transferencias bancarias o efectivo en oficina.",
    dialog_receipt_title: "Comprobante de Transferencia Bancaria del Cliente",
    lbl_booking_code: "Código de Reserva:",
    lbl_received_amount: "Monto Recibido:",
    lbl_notes: "Notas:",
    btn_open_full_image: "Abrir Imagen Completa",
    btn_confirm_incoming: "Confirmar Pago Recibido",
    dialog_record_title: "Registrar Pago Manual",
    lbl_amount: "Monto",
    lbl_method: "Método de Pago",
    lbl_notes_plain: "Notas",
    notes_placeholder: "ej., Transferencia bancaria recibida, ref #...",
    btn_cancel: "Cancelar",
    btn_save: "Guardar Pago",
    dialog_refund_title: "Procesar Reembolso de Pago",
    lbl_transaction: "Transacción:",
    lbl_max_refund: "Reembolso Máximo:",
    lbl_refund_amount: "Monto a Reembolsar (USD)",
    lbl_refund_reason: "Motivo del Reembolso",
    opt_requested_by_customer: "Solicitado por el Cliente",
    opt_duplicate: "Pago Duplicado",
    opt_booking_cancelled: "Reserva de Tour Cancelada",
    opt_other: "Otro Motivo",
    lbl_internal_notes: "Notas Internas",
    refund_notes_placeholder: "Detalles de la transferencia de devolución...",
    btn_confirm_refund: "Confirmar Reembolso",
    dialog_invoice_title: "Emitir Factura Oficial",
    lbl_select_booking: "Seleccionar Reserva *",
    lbl_invoice_number: "Número de Factura (Opcional / Auto)",
    lbl_invoice_amount: "Monto ($) *",
    lbl_due_date: "Fecha de Vencimiento",
    lbl_invoice_notes: "Notas de Factura",
    invoice_notes_placeholder: "Notas impresas en la factura PDF...",
    btn_issue_invoice: "Emitir Factura",
    toast_payment_recorded: "Pago registrado exitosamente",
    toast_payment_confirmed: "Pago confirmado exitosamente",
    toast_payment_rejected: "Pago marcado como inválido",
    toast_refund_success: "Reembolso procesado exitosamente",
    toast_refund_failed: "Error al procesar el reembolso",
    toast_invoice_created: "Factura creada exitosamente",
    toast_pdf_downloaded: "PDF de factura descargado",
    toast_csv_exported: "Reporte de transacciones exportado a CSV",
    toast_no_csv_data: "No hay transacciones de pago para exportar",
  },
  id: {
    back_to_dashboard: "Kembali ke Dasbor Keuangan",
    overview_sub: "Rekonsiliasi pembayaran, verifikasi bukti transfer, pemantauan piutang, dan manajemen faktur resmi.",
    verification_title: "Verifikasi Transfer",
    verification_sub: "Antrean verifikasi bukti transfer manual pelanggan yang membutuhkan validasi akunting.",
    payments_title: "Semua Transaksi & Refund",
    payments_sub: "Seluruh log transaksi gateway Stripe & bank transfer, serta pemrosesan pengembalian dana (refund).",
    schedules_title: "Jadwal Cicilan (AR Aging)",
    schedules_sub: "Pelacakan jatuh tempo cicilan pembayaran (AR Aging) dan pemantauan piutang pelanggan.",
    invoices_title: "Faktur & Tagihan Resmi",
    invoices_sub: "Penerbitan faktur tagihan resmi untuk pemesanan tur dan pengunduhan PDF.",
    bookings_title: "Rekap Pemesanan & Piutang",
    bookings_sub: "Ringkasan pemesanan, pencatatan pembayaran manual, dan verifikasi saldo tersisa.",
    export_csv: "Export CSV",
    create_invoice: "Buat Faktur",
    total_booked_desc: "Nilai kontrak keseluruhan booking",
    collected_payments_desc: "Dana efektif masuk rekening",
    outstanding_ar: "Sisa Piutang (AR)",
    outstanding_ar_desc: "Termin cicilan belum terbayar",
    pending_needs_review: "Perlu ditinjau dan dikonfirmasi",
    all_processed: "Semua transfer telah diproses",
    open_action: "Buka →",
    pending_attention_title: "Bukti Transfer Menunggu Verifikasi Anda",
    pending_attention_desc: "Pelanggan telah mengunggah bukti pembayaran manual. Segera periksa dan konfirmasi dana masuk.",
    open_full_queue: "Buka Antrean Lengkap",
    shortcut_verification: "Verifikasi Transfer",
    shortcut_verification_desc: "menunggu verifikasi",
    shortcut_payments: "Semua Transaksi",
    shortcut_payments_desc: "mutasi tercatat",
    shortcut_schedules: "Jadwal Cicilan",
    shortcut_schedules_desc: "termin cicilan",
    shortcut_invoices: "Faktur & Tagihan",
    shortcut_invoices_desc: "faktur terbit",
    shortcut_bookings: "Rekap Booking",
    shortcut_bookings_desc: "pesanan tur",
    shortcut_reports: "Laporan Finansial",
    shortcut_reports_desc: "Analisis & ekspor",
    recent_payments: "Transaksi Pembayaran Terbaru",
    recent_payments_sub: "5 catatan mutasi terakhir di sistem",
    view_all: "Semua",
    no_payments_yet: "Belum ada transaksi pembayaran",
    upcoming_schedules: "Piutang & Jatuh Tempo Terdekat",
    upcoming_schedules_sub: "Termin cicilan yang perlu dipantau",
    no_schedules_yet: "Tidak ada piutang tertunggak saat ini",
    queue_title: "Antrean Konfirmasi Pembayaran",
    queue_sub: "Daftar transfer manual yang membutuhkan pengecekan bukti struk rekening sebelum disetujui.",
    amount_label: "Nominal",
    total_contract: "Total Kontrak",
    view_receipt: "Lihat Bukti Transfer",
    no_receipt_image: "Tanpa Bukti Gambar",
    reject: "Tolak",
    confirm_paid: "Konfirmasi Lunas",
    queue_empty_title: "Semua Pembayaran Beres!",
    queue_empty_desc: "Tidak ada transaksi transfer yang tertunda saat ini. Anda dapat memeriksa seluruh riwayat di tab 'Semua Transaksi'.",
    tx_history_title: "Semua Transaksi & Mutasi Keuangan",
    tx_history_sub: "Riwayat pembayaran masuk melalui Stripe, transfer bank manual, dan proses refund.",
    search_placeholder: "Cari kode booking / catatan...",
    status_filter_all: "Semua Status",
    status_paid: "Lunas (Paid)",
    status_pending: "Pending",
    status_refunded: "Refunded",
    status_failed: "Gagal (Failed)",
    method_filter_all: "Semua Metode",
    method_transfer: "Transfer Bank",
    method_card: "Kartu (Stripe)",
    method_cash: "Tunai (Cash)",
    th_booking_code: "Kode Booking",
    th_date: "Tanggal",
    th_amount: "Nominal",
    th_method_provider: "Metode & Provider",
    th_status: "Status",
    th_actions: "Aksi",
    no_matching_tx: "Tidak ada transaksi yang cocok dengan filter yang dipilih.",
    btn_refund: "Refund",
    btn_approve: "Setujui",
    schedules_title_full: "Monitoring Jadwal Cicilan & Piutang (AR)",
    schedules_sub_full: "Pantau jatuh tempo termin DP dan pelunasan untuk mengantisipasi keterlambatan pembayaran.",
    filter_all_schedules: "Semua Cicilan",
    filter_overdue_only: "Terlambat (Overdue)",
    filter_due_soon: "Jatuh Tempo ≤ 7 Hari",
    filter_pending: "Menunggu Bayar",
    filter_paid: "Lunas (Paid)",
    th_installment: "Termin",
    th_due_date: "Jatuh Tempo",
    th_bill_amount: "Jumlah Tagihan",
    th_paid_amount: "Terbayar",
    overdue_by: "Lewat",
    days: "hari",
    remaining: "hari lagi",
    of_total: "dari total",
    no_schedules_found: "Tidak ada jadwal cicilan yang ditemukan.",
    invoices_title_full: "Daftar Faktur Resmi (Official Invoices)",
    invoices_sub_full: "Buat faktur penagihan pelanggan dan cetak dokumen PDF resmi perjalanan.",
    btn_create_new_invoice: "Buat Faktur Baru",
    th_invoice_num: "Nomor Faktur",
    th_issue_date: "Tanggal Terbit",
    btn_download_pdf: "Cetak PDF",
    no_invoices_found: "Belum ada faktur yang dibuat. Klik 'Buat Faktur Baru' di atas.",
    bookings_sub_full: "Daftar pemesanan aktif untuk pencatatan pembayaran manual bank transfer atau tunai di kantor.",
    dialog_receipt_title: "Bukti Transfer Bank Pelanggan",
    lbl_booking_code: "Kode Booking:",
    lbl_received_amount: "Nominal Masuk:",
    lbl_notes: "Catatan:",
    btn_open_full_image: "Buka Gambar Ukuran Penuh",
    btn_confirm_incoming: "Konfirmasi Bayar Masuk",
    dialog_record_title: "Catat Pembayaran Manual",
    lbl_amount: "Nominal",
    lbl_method: "Metode Pembayaran",
    lbl_notes_plain: "Catatan",
    notes_placeholder: "Contoh: Transfer Mandiri An. Budi",
    btn_cancel: "Batal",
    btn_save: "Simpan Pembayaran",
    dialog_refund_title: "Proses Refund Dana",
    lbl_transaction: "Transaksi:",
    lbl_max_refund: "Maksimal Refund:",
    lbl_refund_amount: "Nominal Refund (USD)",
    lbl_refund_reason: "Alasan Refund",
    opt_requested_by_customer: "Permintaan Pelanggan",
    opt_duplicate: "Pembayaran Ganda",
    opt_booking_cancelled: "Pembatalan Pemesanan Tur",
    opt_other: "Alasan Lain",
    lbl_internal_notes: "Catatan Internal",
    refund_notes_placeholder: "Keterangan transfer balik ke rekening pelanggan...",
    btn_confirm_refund: "Konfirmasi Refund",
    dialog_invoice_title: "Terbitkan Faktur Baru",
    lbl_select_booking: "Pilih Pemesanan (Booking) *",
    lbl_invoice_number: "Nomor Faktur (Opsional / Otomatis)",
    lbl_invoice_amount: "Nominal ($) *",
    lbl_due_date: "Tanggal Jatuh Tempo",
    lbl_invoice_notes: "Catatan Faktur",
    invoice_notes_placeholder: "Catatan yang akan tercetak di faktur PDF...",
    btn_issue_invoice: "Terbitkan Faktur",
    toast_payment_recorded: "Pembayaran berhasil dicatat",
    toast_payment_confirmed: "Pembayaran dikonfirmasi masuk",
    toast_payment_rejected: "Pembayaran ditandai tidak valid",
    toast_refund_success: "Refund berhasil diproses",
    toast_refund_failed: "Refund gagal diproses",
    toast_invoice_created: "Faktur berhasil dibuat",
    toast_pdf_downloaded: "Faktur PDF berhasil diunduh",
    toast_csv_exported: "Laporan transaksi berhasil diekspor ke CSV",
    toast_no_csv_data: "Tidak ada data transaksi untuk diekspor",
  }
};

export default function AccountingDashboard() {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const search = useSearch();

  const at = (key: keyof typeof accountingI18n.en) => {
    const currentLang = (language === "es" || language === "id") ? language : "en";
    return accountingI18n[currentLang][key] || accountingI18n.en[key] || "";
  };

  // Direct sidebar routing sync
  const queryParams = new URLSearchParams(search);
  const activeTab = queryParams.get("tab") || "overview";

  // Queries
  const { data: bookings, isLoading: bookingsLoading } = useQuery<Booking[]>({ queryKey: ["/api/bookings"] });
  const { data: payments, isLoading: paymentsLoading } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });
  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: schedules, isLoading: schedulesLoading } = useQuery<BookingPaymentSchedule[]>({ queryKey: ["/api/payment-schedules"] });

  // Record Manual Payment state
  const [recordFor, setRecordFor] = useState<Booking | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [notes, setNotes] = useState("");

  // Receipt Preview state
  const [previewReceipt, setPreviewReceipt] = useState<{ url: string; payment: Payment; booking?: Booking } | null>(null);

  // Refund state
  const [refundPayment, setRefundPayment] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("requested_by_customer");
  const [refundNotes, setRefundNotes] = useState("");

  // Create Invoice state
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [invoiceBookingId, setInvoiceBookingId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");

  // Filters for All Payments tab
  const [paymentSearch, setPaymentSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");

  // Filters for Schedules tab
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState("all");

  const bookingById = useMemo(() => new Map((bookings || []).map(b => [b.id, b])), [bookings]);

  // Mutations
  const recordPayment = useMutation({
    mutationFn: () => {
      if (!recordFor) throw new Error("No booking selected");
      const cents = Math.round(parseFloat(amount) * 100);
      return apiRequest("POST", `/api/bookings/${recordFor.id}/payments`, {
        amount: cents,
        currency: recordFor.currency || "USD",
        method,
        status: "paid",
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-schedules"] });
      toast({ title: at("toast_payment_recorded") });
      setRecordFor(null);
      setAmount("");
      setNotes("");
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const confirmPayment = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/payments/${id}`, { status: "paid" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-schedules"] });
      toast({ title: at("toast_payment_confirmed") });
      if (previewReceipt) setPreviewReceipt(null);
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const rejectPayment = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/payments/${id}`, { status: "failed", notes: "Rejected by accounting team" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: at("toast_payment_rejected") });
      if (previewReceipt) setPreviewReceipt(null);
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const processRefund = useMutation({
    mutationFn: async () => {
      if (!refundPayment) throw new Error("No payment selected");
      const body: Record<string, unknown> = {
        reason: refundReason,
        notes: refundNotes.trim() || undefined,
      };
      if (refundAmount.trim()) {
        body.amount = Math.round(parseFloat(refundAmount) * 100);
      }
      return (await apiRequest("POST", `/api/payments/${refundPayment.id}/refunds`, body)).json();
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      toast({
        title: res?.refund?.status === "failed" ? at("toast_refund_failed") : at("toast_refund_success"),
        variant: res?.refund?.status === "failed" ? "destructive" : undefined,
      });
      setRefundPayment(null);
      setRefundAmount("");
      setRefundNotes("");
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: () => {
      const b = bookingById.get(invoiceBookingId);
      const parsedAmount = Math.round(parseFloat(invoiceAmount));
      return apiRequest("POST", `/api/bookings/${invoiceBookingId}/invoices`, {
        invoiceNumber: invoiceNumber.trim() || `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        amount: parsedAmount,
        currency: b?.currency || "USD",
        status: "sent",
        dueDate: invoiceDueDate || undefined,
        notes: invoiceNotes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: at("toast_invoice_created") });
      setShowCreateInvoice(false);
      setInvoiceBookingId("");
      setInvoiceNumber("");
      setInvoiceAmount("");
      setInvoiceDueDate("");
      setInvoiceNotes("");
    },
    onError: (e: any) => toast({ title: String(e.message || e), variant: "destructive" }),
  });

  const downloadInvoicePDF = (inv: Invoice) => {
    const booking = bookingById.get(inv.bookingId);
    const doc = new jsPDF();

    // Top Header Banner
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, 210, 42, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("TOUROPS", 16, 20);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("OFFICIAL INVOICE & BILLING STATEMENT", 16, 28);
    doc.text("finance@tourops.com | +1 (800) 555-0199", 16, 35);

    doc.text(`INVOICE: ${inv.invoiceNumber}`, 194, 20, { align: "right" });
    doc.text(`Date: ${new Date(inv.createdAt || Date.now()).toLocaleDateString()}`, 194, 28, { align: "right" });
    if (inv.dueDate) {
      doc.text(`Due Date: ${inv.dueDate}`, 194, 35, { align: "right" });
    }

    // Customer & Booking Information
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("BILLED TO / BOOKING REFERENCE:", 16, 54);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Booking Reference Code: ${booking?.bookingCode || inv.bookingId}`, 16, 62);
    doc.text(`Booking Type: ${booking?.bookingType || "Standard"}`, 16, 68);
    doc.text(`Total Travelers / Party Size: ${booking?.partySizeExpected || 1} Person(s)`, 16, 74);
    doc.text(`Status: ${(inv.status || "draft").toUpperCase()}`, 16, 80);

    // Items Table
    autoTable(doc, {
      startY: 88,
      head: [["Description", "Currency", "Amount"]],
      body: [
        [
          `Tour Package Booking (${booking?.bookingCode || inv.bookingId}) - ${inv.notes || "Official Tour Operations Services"}`,
          inv.currency || "USD",
          `$${inv.amount.toLocaleString()}`,
        ],
      ],
      theme: "striped",
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold" },
      foot: [["Total Amount Due", "", `$${inv.amount.toLocaleString()} ${inv.currency || "USD"}`]],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
    });

    // Payment Instructions
    const finalY = (doc as any).lastAutoTable?.finalY || 130;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("PAYMENT INSTRUCTIONS:", 16, finalY + 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Bank Name: Tourops International Escrow Bank", 16, finalY + 23);
    doc.text("Account Number: 8820-0012-9938-110", 16, finalY + 29);
    doc.text("SWIFT/BIC: TOURUS33XXX", 16, finalY + 35);
    doc.text("Reference: Please quote your Invoice Number or Booking Reference Code.", 16, finalY + 41);

    doc.save(`Invoice-${inv.invoiceNumber}.pdf`);
    toast({ title: at("toast_pdf_downloaded") });
  };

  const exportPaymentsCSV = () => {
    if (!payments || payments.length === 0) {
      toast({ title: at("toast_no_csv_data"), variant: "destructive" });
      return;
    }

    const headers = ["ID", "Booking Code", "Date", "Amount (USD)", "Currency", "Method", "Status", "Provider", "Refunded (USD)", "Transaction Ref", "Notes"];
    const rows = payments.map((p) => {
      const b = bookingById.get(p.bookingId);
      const amountUSD = (p.amount / 100).toFixed(2);
      const refundedUSD = ((p.refundedAmount || 0) / 100).toFixed(2);
      const dateStr = p.createdAt ? new Date(p.createdAt).toISOString() : "";
      return [
        p.id,
        b?.bookingCode || p.bookingId,
        `"${dateStr}"`,
        amountUSD,
        p.currency || "USD",
        `"${p.method || "bank_transfer"}"`,
        `"${p.status || "pending"}"`,
        `"${p.provider || "manual"}"`,
        refundedUSD,
        `"${p.transactionId || p.paymentIntentId || ""}"`,
        `"${(p.notes || "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tourops-payments-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({ title: at("toast_csv_exported") });
  };

  if (bookingsLoading || paymentsLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  // Financial calculations
  const totalBookedValue = (bookings || []).reduce((s, b) => s + (b.totalPrice || 0), 0);
  const collectedPayments = (payments || []).filter(p => p.status === "paid").reduce((s, p) => s + (p.amount || 0), 0) / 100;
  const outstandingReceivables = Math.max(0, totalBookedValue - collectedPayments);
  const pendingPayments = (payments || []).filter(p => p.status === "pending");

  // Filtered Payments
  const filteredPayments = (payments || []).filter((p) => {
    const b = bookingById.get(p.bookingId);
    const code = (b?.bookingCode || p.bookingId).toLowerCase();
    const query = paymentSearch.toLowerCase();
    const matchesSearch = !paymentSearch || code.includes(query) || (p.notes || "").toLowerCase().includes(query) || (p.transactionId || "").toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    const matchesMethod = methodFilter === "all" || p.method === methodFilter;
    return matchesSearch && matchesStatus && matchesMethod;
  });

  // Filtered Schedules
  const filteredSchedules = (schedules || []).filter((s) => {
    if (scheduleStatusFilter === "all") return true;
    if (scheduleStatusFilter === "overdue") {
      const now = new Date();
      return (s.status === "late" || (s.status !== "paid" && s.status !== "cancelled" && new Date(s.dueDate) < now));
    }
    if (scheduleStatusFilter === "due_soon") {
      const now = new Date();
      const due = new Date(s.dueDate);
      const days = Math.ceil((due.getTime() - now.getTime()) / 86400000);
      return s.status !== "paid" && s.status !== "cancelled" && days >= 0 && days <= 7;
    }
    return s.status === scheduleStatusFilter;
  });

  const tabMetadata: Record<string, { title: string; subtitle: string; icon: any }> = {
    overview: {
      title: t("finance_dashboard"),
      subtitle: at("overview_sub"),
      icon: DollarSign,
    },
    verification: {
      title: t("transfer_verification" as any) || at("verification_title"),
      subtitle: at("verification_sub"),
      icon: Clock,
    },
    payments: {
      title: t("nav_payments"),
      subtitle: at("payments_sub"),
      icon: CreditCard,
    },
    schedules: {
      title: t("payment_schedule_title"),
      subtitle: at("schedules_sub"),
      icon: Calendar,
    },
    invoices: {
      title: t("invoices_heading"),
      subtitle: at("invoices_sub"),
      icon: FileText,
    },
    bookings: {
      title: t("booking_recap" as any) || at("bookings_title"),
      subtitle: at("bookings_sub"),
      icon: Receipt,
    },
  };

  const currentMeta = tabMetadata[activeTab] || tabMetadata.overview;
  const ActiveIcon = currentMeta.icon;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto" data-testid="accounting-dashboard">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {activeTab !== "overview" && (
            <Link href="/ops/accounting" className="inline-flex items-center text-xs text-muted-foreground hover:text-primary mb-2 transition-colors">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              {at("back_to_dashboard")}
            </Link>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-foreground flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <ActiveIcon className="h-6 w-6" />
            </div>
            {currentMeta.title}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {currentMeta.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(activeTab === "overview" || activeTab === "payments") && (
            <Button variant="outline" className="rounded-xl font-medium shadow-xs" onClick={exportPaymentsCSV}>
              <Download className="h-4 w-4 mr-2 text-primary" />
              {at("export_csv")}
            </Button>
          )}
          {(activeTab === "overview" || activeTab === "invoices") && (
            <Button className="rounded-xl font-medium shadow-xs" onClick={() => setShowCreateInvoice(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              {t("create_invoice" as any) || at("create_invoice")}
            </Button>
          )}
        </div>
      </div>

      {/* Key Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border border-border/60 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>{t("total_booked_value")}</span>
              <Receipt className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold font-serif" data-testid="stat-booked">
              ${totalBookedValue.toLocaleString()}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{at("total_booked_desc")}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>{t("collected_payments")}</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold font-serif text-emerald-600 dark:text-emerald-400" data-testid="stat-paid">
              ${collectedPayments.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{at("collected_payments_desc")}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border/60 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>{at("outstanding_ar")}</span>
              <CreditCard className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold font-serif text-primary">
              ${outstandingReceivables.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">{at("outstanding_ar_desc")}</p>
          </CardContent>
        </Card>

        <Link href="/ops/accounting?tab=verification" className="block cursor-pointer">
          <Card className={`rounded-2xl border transition-all hover:shadow-md shadow-xs ${pendingPayments.length > 0 ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" : "border-border/60"}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>{t("pending_payments")}</span>
                <Clock className={`h-4 w-4 ${pendingPayments.length > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl sm:text-3xl font-bold font-serif ${pendingPayments.length > 0 ? "text-amber-700 dark:text-amber-400" : "text-foreground"}`} data-testid="stat-pending">
                {pendingPayments.length}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
                <span>{pendingPayments.length > 0 ? at("pending_needs_review") : at("all_processed")}</span>
                {pendingPayments.length > 0 && <span className="text-amber-700 font-medium text-[10px]">{at("open_action")}</span>}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Main Content Controlled Directly by Sidebar */}
      <Tabs value={activeTab} className="space-y-6">
        {/* =========================================================================
            OVERVIEW: DASHBOARD UTAMA AKUNTANSI
        ========================================================================== */}
        <TabsContent value="overview" className="space-y-6">
          {/* Attention Banner if Pending Payments Exist */}
          {pendingPayments.length > 0 && (
            <Card className="rounded-2xl border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 shadow-xs">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-amber-900 dark:text-amber-200">
                      {pendingPayments.length} {at("pending_attention_title")}
                    </CardTitle>
                    <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                      {at("pending_attention_desc")}
                    </p>
                  </div>
                </div>
                <Link href="/ops/accounting?tab=verification">
                  <Button size="sm" className="rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs">
                    {at("open_full_queue")} ({pendingPayments.length})
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {pendingPayments.slice(0, 3).map((p) => {
                    const b = bookingById.get(p.bookingId);
                    return (
                      <div key={p.id} className="p-3.5 rounded-xl border border-amber-200/80 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-sm">{b?.bookingCode || p.bookingId}</span>
                          <Badge variant="outline" className="text-[10px] uppercase font-semibold border-amber-300 text-amber-800">
                            {p.method?.replace(/_/g, " ")}
                          </Badge>
                          <span className="font-semibold text-sm">{fmt(p.amount, p.currency)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {p.receiptUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg text-xs h-8"
                              onClick={() => setPreviewReceipt({ url: p.receiptUrl!, payment: p, booking: b })}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              {at("view_receipt")}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="rounded-lg text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => confirmPayment.mutate(p.id)}
                            disabled={confirmPayment.isPending}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            {at("confirm_paid")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Modules Shortcuts */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { title: t("transfer_verification" as any) || at("shortcut_verification"), desc: `${pendingPayments.length} ${at("shortcut_verification_desc")}`, url: "/ops/accounting?tab=verification", icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
              { title: t("nav_payments"), desc: `${payments?.length || 0} ${at("shortcut_payments_desc")}`, url: "/ops/accounting?tab=payments", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-500/10" },
              { title: t("payment_schedule_title"), desc: `${schedules?.length || 0} ${at("shortcut_schedules_desc")}`, url: "/ops/accounting?tab=schedules", icon: Calendar, color: "text-violet-600", bg: "bg-violet-500/10" },
              { title: t("invoices_heading"), desc: `${invoices?.length || 0} ${at("shortcut_invoices_desc")}`, url: "/ops/accounting?tab=invoices", icon: FileText, color: "text-emerald-600", bg: "bg-emerald-500/10" },
              { title: t("booking_recap" as any) || at("shortcut_bookings"), desc: `${bookings?.length || 0} ${at("shortcut_bookings_desc")}`, url: "/ops/accounting?tab=bookings", icon: Receipt, color: "text-teal-600", bg: "bg-teal-500/10" },
              { title: t("reports"), desc: at("shortcut_reports_desc"), url: "/admin/reports", icon: ArrowUpDown, color: "text-rose-600", bg: "bg-rose-500/10" },
            ].map((m) => (
              <Link key={m.url} href={m.url} className="block group">
                <Card className="rounded-2xl border border-border/60 hover:border-primary/40 hover:shadow-sm transition-all p-3.5 h-full">
                  <div className={`h-9 w-9 rounded-xl ${m.bg} ${m.color} flex items-center justify-center mb-2.5`}>
                    <m.icon className="h-4.5 w-4.5" />
                  </div>
                  <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{m.title}</h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</p>
                </Card>
              </Link>
            ))}
          </div>

          {/* 2-Column Split: Recent Payments & Upcoming Schedules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Payments */}
            <Card className="rounded-2xl border border-border/60 shadow-xs">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">{at("recent_payments")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{at("recent_payments_sub")}</p>
                </div>
                <Link href="/ops/accounting?tab=payments">
                  <Button variant="ghost" size="sm" className="rounded-xl text-xs">
                    {at("view_all")} ({payments?.length || 0}) <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {(payments || []).slice(0, 5).map((p) => {
                    const b = bookingById.get(p.bookingId);
                    return (
                      <div key={p.id} className="p-3 rounded-xl border border-border/50 bg-card/60 flex items-center justify-between text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground">{b?.bookingCode || p.bookingId}</span>
                            <Badge variant={statusVariant[p.status || "pending"] || "outline"} className="text-[10px] uppercase font-semibold">
                              {p.status}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {p.method?.replace(/_/g, " ")} · {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-sm text-foreground">{fmt(p.amount, p.currency)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {(!payments || payments.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-6">{at("no_payments_yet")}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Schedules (Due Soon or Overdue) */}
            <Card className="rounded-2xl border border-border/60 shadow-xs">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">{at("upcoming_schedules")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{at("upcoming_schedules_sub")}</p>
                </div>
                <Link href="/ops/accounting?tab=schedules">
                  <Button variant="ghost" size="sm" className="rounded-xl text-xs">
                    {at("view_all")} ({schedules?.length || 0}) <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {(schedules || [])
                    .filter(s => s.status !== "paid" && s.status !== "cancelled")
                    .slice(0, 5)
                    .map((s) => {
                      const b = bookingById.get(s.bookingId);
                      const isOverdue = new Date(s.dueDate) < new Date();
                      return (
                        <div key={s.id} className="p-3 rounded-xl border border-border/50 bg-card/60 flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-foreground">{b?.bookingCode || s.bookingId}</span>
                              <Badge variant={isOverdue ? "destructive" : "secondary"} className="text-[10px] uppercase font-semibold">
                                {isOverdue ? "Overdue" : s.status}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {at("th_due_date")}: <strong>{new Date(s.dueDate).toLocaleDateString()}</strong> · #{s.installmentNumber} ({s.label})
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-sm text-foreground">${parseFloat(s.amount).toFixed(2)} {s.currency}</span>
                          </div>
                        </div>
                      );
                    })}
                  {(!schedules || schedules.filter(s => s.status !== "paid" && s.status !== "cancelled").length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-6">{at("no_schedules_yet")}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* =========================================================================
            TAB 1: VERIFIKASI TRANSFER BANK (PENDING QUEUE)
        ========================================================================== */}
        <TabsContent value="verification" className="space-y-4">
          <Card className="rounded-2xl border border-border/60 shadow-xs">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">{at("queue_title")}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {at("queue_sub")}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {pendingPayments.length > 0 ? (
                <div className="space-y-3">
                  {pendingPayments.map((p) => {
                    const b = bookingById.get(p.bookingId);
                    return (
                      <div
                        key={p.id}
                        className="p-4 sm:p-5 rounded-2xl border border-border/60 bg-card hover:border-border transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                        data-testid={`payment-row-${p.id}`}
                      >
                        <div className="flex items-start sm:items-center gap-3.5">
                          <div className="h-11 w-11 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                            <Clock className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-base text-foreground font-mono">
                                {b?.bookingCode || p.bookingId}
                              </span>
                              <Badge variant="outline" className="text-[10px] uppercase font-semibold border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/20">
                                {p.method?.replace(/_/g, " ")}
                              </Badge>
                              {p.createdAt && (
                                <span className="text-xs text-muted-foreground">
                                  {new Date(p.createdAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {at("amount_label")}: <strong className="text-foreground text-sm font-semibold">{fmt(p.amount, p.currency)}</strong>
                              {b?.totalPrice && (
                                <span> · {at("total_contract")}: ${b.totalPrice.toLocaleString()}</span>
                              )}
                            </p>
                            {p.notes && (
                              <p className="text-xs text-muted-foreground mt-1 bg-muted/40 p-2 rounded-lg italic">
                                "{p.notes}"
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                          {p.receiptUrl ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl font-medium text-xs border-primary/30 text-primary hover:bg-primary/5"
                              onClick={() => setPreviewReceipt({ url: p.receiptUrl!, payment: p, booking: b })}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1.5" />
                              {at("view_receipt")}
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="text-[11px] rounded-lg">
                              {at("no_receipt_image")}
                            </Badge>
                          )}

                          <Button
                            size="sm"
                            variant="destructive"
                            className="rounded-xl font-medium text-xs"
                            onClick={() => rejectPayment.mutate(p.id)}
                            disabled={rejectPayment.isPending}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            {at("reject")}
                          </Button>

                          <Button
                            size="sm"
                            className="rounded-xl font-medium text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                            onClick={() => confirmPayment.mutate(p.id)}
                            disabled={confirmPayment.isPending}
                            data-testid={`button-confirm-${p.id}`}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            {at("confirm_paid")}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 flex items-center justify-center mb-3">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <h4 className="font-semibold text-sm text-foreground">{at("queue_empty_title")}</h4>
                  <p className="text-xs text-muted-foreground max-w-sm mt-1">
                    {at("queue_empty_desc")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            TAB 2: SEMUA TRANSAKSI & REFUND
        ========================================================================== */}
        <TabsContent value="payments" className="space-y-4">
          <Card className="rounded-2xl border border-border/60 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold">{at("tx_history_title")}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {at("tx_history_sub")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={at("search_placeholder")}
                      value={paymentSearch}
                      onChange={(e) => setPaymentSearch(e.target.value)}
                      className="pl-8 rounded-xl h-9 text-xs"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px] rounded-xl h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{at("status_filter_all")}</SelectItem>
                      <SelectItem value="paid">{at("status_paid")}</SelectItem>
                      <SelectItem value="pending">{at("status_pending")}</SelectItem>
                      <SelectItem value="refunded">{at("status_refunded")}</SelectItem>
                      <SelectItem value="failed">{at("status_failed")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={methodFilter} onValueChange={setMethodFilter}>
                    <SelectTrigger className="w-[140px] rounded-xl h-9 text-xs"><SelectValue placeholder="Metode" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{at("method_filter_all")}</SelectItem>
                      <SelectItem value="bank_transfer">{at("method_transfer")}</SelectItem>
                      <SelectItem value="card">{at("method_card")}</SelectItem>
                      <SelectItem value="cash">{at("method_cash")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{at("th_booking_code")}</TableHead>
                      <TableHead>{at("th_date")}</TableHead>
                      <TableHead>{at("th_amount")}</TableHead>
                      <TableHead>{at("th_method_provider")}</TableHead>
                      <TableHead>{at("th_status")}</TableHead>
                      <TableHead className="text-right">{at("th_actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((p) => {
                      const b = bookingById.get(p.bookingId);
                      const remainingRefund = p.amount - (p.refundedAmount || 0);
                      const canRefund = ["paid", "partially_refunded"].includes(p.status || "") && remainingRefund > 0;
                      return (
                        <TableRow key={p.id} data-testid={`payment-row-${p.id}`}>
                          <TableCell className="font-medium">
                            {b ? (
                              <Link href={`/admin/bookings/${b.id}`} className="font-mono text-primary hover:underline">
                                {b.bookingCode}
                              </Link>
                            ) : (
                              <span className="font-mono text-xs">{p.bookingId.slice(0, 8)}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-sm">{fmt(p.amount, p.currency)}</span>
                            {(p.refundedAmount || 0) > 0 && (
                              <span className="block text-[11px] text-destructive">
                                Refund: -{fmt(p.refundedAmount)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="capitalize text-xs">
                            <span className="font-medium text-foreground">{p.method?.replace(/_/g, " ")}</span>
                            <span className="block text-[10px] text-muted-foreground">{p.provider || "manual"}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[p.status || "pending"]} className="capitalize text-xs rounded-md">
                              {p.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {p.receiptUrl && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-xs rounded-lg"
                                  onClick={() => setPreviewReceipt({ url: p.receiptUrl!, payment: p, booking: b })}
                                  title={at("view_receipt")}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {canRefund && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs rounded-lg text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    setRefundPayment(p);
                                    setRefundAmount((remainingRefund / 100).toFixed(2));
                                  }}
                                  title={at("btn_refund")}
                                >
                                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                  {at("btn_refund")}
                                </Button>
                              )}
                              {p.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 text-xs rounded-lg bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                                  onClick={() => confirmPayment.mutate(p.id)}
                                  disabled={confirmPayment.isPending}
                                  data-testid={`button-confirm-${p.id}`}
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" />
                                  {at("btn_approve")}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredPayments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                          {at("no_matching_tx")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            TAB 3: JADWAL CICILAN & PIUTANG (AR AGING)
        ========================================================================== */}
        <TabsContent value="schedules" className="space-y-4">
          <Card className="rounded-2xl border border-border/60 shadow-xs">
            <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold">{at("schedules_title_full")}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {at("schedules_sub_full")}
                </p>
              </div>
              <Select value={scheduleStatusFilter} onValueChange={setScheduleStatusFilter}>
                <SelectTrigger className="w-[180px] rounded-xl h-9 text-xs"><SelectValue placeholder="Filter Jadwal" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{at("filter_all_schedules")}</SelectItem>
                  <SelectItem value="overdue">{at("filter_overdue_only")}</SelectItem>
                  <SelectItem value="due_soon">{at("filter_due_soon")}</SelectItem>
                  <SelectItem value="pending">{at("filter_pending")}</SelectItem>
                  <SelectItem value="paid">{at("filter_paid")}</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {schedulesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{at("th_booking_code")}</TableHead>
                        <TableHead>{at("th_installment")}</TableHead>
                        <TableHead>{at("th_due_date")}</TableHead>
                        <TableHead>{at("th_bill_amount")}</TableHead>
                        <TableHead>{at("th_paid_amount")}</TableHead>
                        <TableHead>{at("th_status")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSchedules.map((s) => {
                        const b = bookingById.get(s.bookingId);
                        const now = new Date();
                        const due = new Date(s.dueDate);
                        const daysUntil = Math.ceil((due.getTime() - now.getTime()) / 86400000);
                        const isOverdue = s.status === "late" || (s.status !== "paid" && s.status !== "cancelled" && due < now);
                        const isDueSoon = !isOverdue && s.status !== "paid" && s.status !== "cancelled" && daysUntil <= 7 && daysUntil >= 0;

                        return (
                          <TableRow key={s.id} className={isOverdue ? "bg-destructive/5" : isDueSoon ? "bg-amber-50/40" : ""}>
                            <TableCell className="font-medium">
                              {b ? (
                                <Link href={`/admin/bookings/${b.id}`} className="font-mono text-primary hover:underline">
                                  {b.bookingCode}
                                </Link>
                              ) : (
                                <span className="font-mono text-xs">{s.bookingId.slice(0, 8)}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-xs text-foreground block">
                                #{s.installmentNumber} - {s.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{s.percentage}% {at("of_total")}</span>
                            </TableCell>
                            <TableCell className="text-xs">
                              {due.toLocaleDateString()}
                              {isOverdue && (
                                <span className="block text-[10px] font-bold text-destructive">
                                  {at("overdue_by")} {Math.abs(daysUntil)} {at("days")}
                                </span>
                              )}
                              {isDueSoon && (
                                <span className="block text-[10px] font-bold text-amber-600">
                                  {daysUntil} {at("remaining")}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-semibold text-xs">
                              ${parseFloat(s.amount).toFixed(2)} {s.currency}
                            </TableCell>
                            <TableCell className="text-xs">
                              ${parseFloat(s.paidAmount).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              {isOverdue ? (
                                <Badge variant="destructive" className="text-[10px] rounded-md">
                                  {language === 'id' ? 'Terlambat' : language === 'es' ? 'Vencido' : 'Overdue'}
                                </Badge>
                              ) : isDueSoon ? (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] rounded-md">
                                  {language === 'id' ? 'Jatuh Tempo' : language === 'es' ? 'Próximo a Vencer' : 'Due Soon'}
                                </Badge>
                              ) : (
                                <Badge variant={statusVariant[s.status] || "secondary"} className="text-[10px] rounded-md capitalize">
                                  {s.status}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredSchedules.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                            {at("no_schedules_found")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            TAB 4: FAKTUR & TAGIHAN (INVOICES)
        ========================================================================== */}
        <TabsContent value="invoices" className="space-y-4">
          <Card className="rounded-2xl border border-border/60 shadow-xs">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">{at("invoices_title_full")}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {at("invoices_sub_full")}
                </p>
              </div>
              <Button size="sm" className="rounded-xl font-medium" onClick={() => setShowCreateInvoice(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                {at("btn_create_new_invoice")}
              </Button>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{at("th_invoice_num")}</TableHead>
                        <TableHead>{at("th_booking_code")}</TableHead>
                        <TableHead>{at("th_issue_date")}</TableHead>
                        <TableHead>{at("th_due_date")}</TableHead>
                        <TableHead>{at("th_amount")}</TableHead>
                        <TableHead>{at("th_status")}</TableHead>
                        <TableHead className="text-right">{at("th_actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(invoices || []).map((inv) => {
                        const b = bookingById.get(inv.bookingId);
                        return (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono font-bold text-xs text-foreground">
                              {inv.invoiceNumber}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {b?.bookingCode || inv.bookingId.slice(0, 8)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {inv.dueDate || "—"}
                            </TableCell>
                            <TableCell className="font-semibold text-xs">
                              ${inv.amount.toLocaleString()} {inv.currency}
                            </TableCell>
                            <TableCell>
                              <Badge variant={inv.status === "paid" ? "default" : inv.status === "sent" ? "secondary" : "outline"} className="capitalize text-xs rounded-md">
                                {inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs rounded-lg"
                                onClick={() => downloadInvoicePDF(inv)}
                              >
                                <Download className="h-3.5 w-3.5 mr-1 text-primary" />
                                {at("btn_download_pdf")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {(!invoices || invoices.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                            {at("no_invoices_found")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            TAB 5: REKAP BOOKING & CATAT BAYAR MANUAL
        ========================================================================== */}
        <TabsContent value="bookings" className="space-y-4">
          <Card className="rounded-2xl border border-border/60 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{t("receivables_bookings")}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {at("bookings_sub_full")}
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("booking")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>{t("total")}</TableHead>
                      <TableHead className="text-right">{t("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(bookings || []).map((b) => (
                      <TableRow key={b.id} data-testid={`booking-row-${b.id}`}>
                        <TableCell className="font-mono font-medium">{b.bookingCode}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{b.status}</Badge></TableCell>
                        <TableCell className="font-semibold text-xs">${(b.totalPrice || 0).toLocaleString()} {b.currency}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-xl h-8 text-xs font-medium text-primary hover:bg-primary/10"
                            onClick={() => {
                              setRecordFor(b);
                              setAmount(String(b.totalPrice || ""));
                            }}
                            data-testid={`button-record-${b.id}`}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            {t("record_payment")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!bookings || bookings.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                          {t("no_bookings_found")}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* =========================================================================
          DIALOG 1: PRATINJAU BUKTI TRANSFER (RECEIPT PREVIEW)
      ========================================================================== */}
      <Dialog open={!!previewReceipt} onOpenChange={(open) => !open && setPreviewReceipt(null)}>
        <DialogContent className="rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{at("dialog_receipt_title")}</DialogTitle>
          </DialogHeader>
          {previewReceipt && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/40 rounded-xl space-y-1 text-xs">
                <p><strong>{at("lbl_booking_code")}</strong> {previewReceipt.booking?.bookingCode || previewReceipt.payment.bookingId}</p>
                <p><strong>{at("lbl_received_amount")}</strong> {fmt(previewReceipt.payment.amount, previewReceipt.payment.currency)}</p>
                {previewReceipt.payment.notes && <p><strong>{at("lbl_notes")}</strong> {previewReceipt.payment.notes}</p>}
              </div>

              <div className="border border-border/60 rounded-xl overflow-hidden bg-slate-900/5 flex items-center justify-center p-2 min-h-[220px]">
                <img
                  src={previewReceipt.url}
                  alt={at("view_receipt")}
                  className="max-h-[350px] w-auto object-contain rounded-lg shadow-sm"
                />
              </div>

              <div className="flex items-center justify-between gap-2 border-t pt-3">
                <Button variant="outline" className="rounded-xl text-xs" onClick={() => window.open(previewReceipt.url, "_blank")}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  {at("btn_open_full_image")}
                </Button>

                {previewReceipt.payment.status === "pending" && (
                  <Button
                    className="rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    onClick={() => confirmPayment.mutate(previewReceipt.payment.id)}
                    disabled={confirmPayment.isPending}
                  >
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    {at("btn_confirm_incoming")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          DIALOG 2: CATAT PEMBAYARAN MANUAL
      ========================================================================== */}
      <Dialog open={!!recordFor} onOpenChange={(open) => !open && setRecordFor(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {at("dialog_record_title")} — {recordFor?.bookingCode}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount" className="text-xs font-semibold">
                {at("lbl_amount")} ({recordFor?.currency || "USD"})
              </Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="100.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-xl"
                data-testid="input-amount"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{at("lbl_method")}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="rounded-xl" data-testid="select-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">{at("method_transfer")}</SelectItem>
                  <SelectItem value="card">{at("method_card")}</SelectItem>
                  <SelectItem value="cash">{at("method_cash")}</SelectItem>
                  <SelectItem value="other">{t("other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-notes" className="text-xs font-semibold">{at("lbl_notes_plain")}</Label>
              <Input
                id="pay-notes"
                placeholder={at("notes_placeholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-xl"
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setRecordFor(null)}>
              {at("btn_cancel")}
            </Button>
            <Button
              className="rounded-xl font-semibold"
              onClick={() => recordPayment.mutate()}
              disabled={!amount || recordPayment.isPending}
              data-testid="button-save-payment"
            >
              {recordPayment.isPending ? "..." : at("btn_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          DIALOG 3: AJUKAN REFUND
      ========================================================================== */}
      <Dialog open={!!refundPayment} onOpenChange={(open) => !open && setRefundPayment(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
              <RotateCcw className="h-5 w-5" />
              {at("dialog_refund_title")}
            </DialogTitle>
          </DialogHeader>
          {refundPayment && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/40 rounded-xl space-y-1 text-xs">
                <p><strong>{at("lbl_transaction")}</strong> {fmt(refundPayment.amount, refundPayment.currency)}</p>
                <p><strong>{at("lbl_max_refund")}</strong> {fmt(refundPayment.amount - (refundPayment.refundedAmount || 0), refundPayment.currency)}</p>
                <p><strong>Provider:</strong> {refundPayment.provider || "manual"}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{at("lbl_refund_amount")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={((refundPayment.amount - (refundPayment.refundedAmount || 0)) / 100).toFixed(2)}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{at("lbl_refund_reason")}</Label>
                <Select value={refundReason} onValueChange={setRefundReason}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="requested_by_customer">{at("opt_requested_by_customer")}</SelectItem>
                    <SelectItem value="duplicate">{at("opt_duplicate")}</SelectItem>
                    <SelectItem value="booking_cancelled">{at("opt_booking_cancelled")}</SelectItem>
                    <SelectItem value="other">{at("opt_other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{at("lbl_internal_notes")}</Label>
                <Textarea
                  placeholder={at("refund_notes_placeholder")}
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setRefundPayment(null)}>
                  {at("btn_cancel")}
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-xl font-semibold"
                  onClick={() => processRefund.mutate()}
                  disabled={!refundAmount || processRefund.isPending}
                >
                  {processRefund.isPending ? "..." : at("btn_confirm_refund")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          DIALOG 4: BUAT FAKTUR BARU (NEW INVOICE)
      ========================================================================== */}
      <Dialog open={showCreateInvoice} onOpenChange={setShowCreateInvoice}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{at("dialog_invoice_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{at("lbl_select_booking")}</Label>
              <Select value={invoiceBookingId} onValueChange={(val) => {
                setInvoiceBookingId(val);
                const b = bookingById.get(val);
                if (b && !invoiceAmount) setInvoiceAmount(String(b.totalPrice || ""));
              }}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder={at("lbl_select_booking")} /></SelectTrigger>
                <SelectContent>
                  {(bookings || []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bookingCode} - ${b.totalPrice?.toLocaleString()} ({b.bookingType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{at("lbl_invoice_number")}</Label>
              <Input
                placeholder="Contoh: INV-2026-001"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{at("lbl_invoice_amount")}</Label>
                <Input
                  type="number"
                  placeholder="500"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{at("lbl_due_date")}</Label>
                <Input
                  type="date"
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{at("lbl_invoice_notes")}</Label>
              <Textarea
                placeholder={at("invoice_notes_placeholder")}
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowCreateInvoice(false)}>
              {at("btn_cancel")}
            </Button>
            <Button
              className="rounded-xl font-semibold"
              onClick={() => createInvoiceMutation.mutate()}
              disabled={!invoiceBookingId || !invoiceAmount || createInvoiceMutation.isPending}
            >
              {createInvoiceMutation.isPending ? "..." : at("btn_issue_invoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
