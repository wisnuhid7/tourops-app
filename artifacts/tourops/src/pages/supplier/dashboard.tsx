import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle2, Clock, AlertCircle, FileText, 
  Users, MessageSquare, Upload, ArrowRight,
  Hotel, Bus, MapPin, Camera, Plane,
  ChevronRight, Calendar, User, Search, Globe,
  UserCheck, Ticket, Download, FileCheck, AlertTriangle,
  DollarSign, Bell, Plus, Trash2, Pencil,
  Bed, LayoutGrid, List, Phone, Mail, Building, XCircle
} from "lucide-react";
import { SightsTab } from "@/pages/admin/master-data";
import { AirlinesCatalogTab } from "@/pages/supplier/airlines-catalog";
import { WORKFLOW_STATUSES } from "@/lib/constants";
import type { BookingWorkflow, Booking, UserProfile, Traveler, Document } from "@workspace/db";
import { Link, useSearch } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { getFullImageUrl, getFlightSchedule } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useLanguage } from "@/hooks/use-language";
import { SupplierServiceRequests } from "@/components/supplier-service-requests";
import { HotelFormFields, emptyHotelFormValues, hotelToFormValues, hotelFormToPayload, type HotelFormValues } from "@/components/hotel-form-fields";
import type { ColDef, GetRowIdParams, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { agGridDefaultColDef, agGridTheme } from "@/lib/ag-grid-config";

const toGridDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00`) : null;

export default function SupplierDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const ROLE_CONFIG: Record<string, { title: string; subtitle: string; icon: any }> = {
    airline_supplier: { title: t("airline_dashboard"), subtitle: t("manage_ticketing_assignments"), icon: Plane },
    hotel_manager: { title: t("hotel_dashboard"), subtitle: t("manage_accommodation_bookings"), icon: Hotel },
    transport_manager: { title: t("transport_dashboard"), subtitle: t("manage_vehicle_fleet_tasks"), icon: Bus },
    guide_manager: { title: t("guide_dashboard"), subtitle: t("manage_tour_guide_assignments"), icon: UserCheck },
    sights_manager: { title: t("sights_dashboard"), subtitle: t("manage_tickets_entry_permits"), icon: Ticket },
    supplier: { title: t("supplier_dashboard"), subtitle: t("manage_general_supply"), icon: Globe },
    admin: { title: t("supplier_overview_admin"), subtitle: t("viewing_all_supplier_tasks"), icon: Globe },
    super_admin: { title: t("supplier_overview_super_admin"), subtitle: t("viewing_all_supplier_tasks"), icon: Globe },
  };
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/user-profile"],
  });

  const { data: workflows, isLoading } = useQuery<(BookingWorkflow & { 
    booking?: Booking;
    tour?: { id: string; title: string; durationDays: number; durationNights: number; countries?: string[] | null };
    departure?: { id: string; startDate: string; endDate: string };
    hotels?: Array<{ id: string; name: string; starRating: number | null; cityId: string; address: string | null; contactPhone: string | null; contactEmail: string | null }>;
    roomsNeeded?: number;
  })[]>({
    queryKey: ["/api/supplier/workflows"],
  });

  const [tasksViewMode, setTasksViewMode] = useState<"table" | "cards">("table");

  const updateWorkflow = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/workflows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/workflows"] });
      toast({ title: t("workflow_updated") });
    },
  });

  const acceptTask = useMutation({
    mutationFn: (workflowId: string) =>
      apiRequest("PATCH", `/api/workflows/${workflowId}`, { status: "in_progress" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/workflows"] });
      toast({
        title: "Tugas Berhasil Diterima!",
        description: "Status layanan kini berubah menjadi Diproses.",
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const completeTask = useMutation({
    mutationFn: (workflowId: string) =>
      apiRequest("PATCH", `/api/workflows/${workflowId}`, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/workflows"] });
      toast({
        title: "Tugas Ditandai Selesai!",
        description: "Status layanan telah rampung dan terkonfirmasi.",
      });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const getSupplierTaskStatus = (status?: string | null) => {
    switch (status) {
      case "completed":
        return {
          label: "Selesai",
          icon: CheckCircle2,
          badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
        };
      case "in_progress":
        return {
          label: "Diproses",
          icon: Clock,
          badgeClass: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
        };
      case "blocked":
        return {
          label: "Kendala",
          icon: AlertTriangle,
          badgeClass: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
        };
      case "cancelled":
        return {
          label: "Dibatalkan",
          icon: XCircle,
          badgeClass: "border-border bg-muted text-muted-foreground",
        };
      case "assigned":
      case "not_assigned":
      default:
        return {
          label: "Tugas Baru",
          icon: Clock,
          badgeClass: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 font-semibold",
        };
    }
  };

  const search = useSearch();
  // Deep-link support: /supplier?tab=guide_rates opens directly on that tab
  // (used by the admin/super_admin "Guides" sidebar link).
  const requestedTab = new URLSearchParams(search).get("tab") || "tasks";
  // Airline search (simulated data) is disabled — coerce stale deep links to the default tab.
  const initialTab = requestedTab === "airline_search" ? "tasks" : requestedTab;
  const [activeTab, setActiveTab] = useState(initialTab);
  // Keep the active tab in sync when the URL changes while mounted
  // (e.g. sidebar links switching between /supplier and /supplier?tab=...).
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

  const { data: hotelRates } = useQuery<any[]>({ queryKey: ["/api/rates/hotel"] });
  const [hotelRateSearch, setHotelRateSearch] = useState("");
  const normalizedHotelRateSearch = hotelRateSearch.trim().toLowerCase();
  const filteredHotelRates = (hotelRates || []).filter((rate) => [rate.hotelName, rate.roomType, rate.currency, rate.pricePerRoomPerNight, rate.validFrom, rate.validTo, rate.status].filter(Boolean).join(" ").toLowerCase().includes(normalizedHotelRateSearch));
  const canRegisterHotels = profile?.role === "hotel_manager" || profile?.role === "admin" || profile?.role === "super_admin";
  const { data: hotels } = useQuery<any[]>({ queryKey: ["/api/hotels"], enabled: canRegisterHotels });
  const { data: cities } = useQuery<any[]>({ queryKey: ["/api/master/cities"], enabled: canRegisterHotels });
  const [hotelSearch, setHotelSearch] = useState("");
  const normalizedHotelSearch = hotelSearch.trim().toLowerCase();
  const filteredHotels = (hotels || []).filter((hotel) => [
    hotel.name,
    hotel.starRating != null ? String(hotel.starRating) : "",
    hotel.basePrice,
    hotel.roomRateMatrimonial,
    hotel.roomRateDouble,
    hotel.roomRateTriple,
    hotel.currency,
    hotel.status,
  ].filter(Boolean).join(" ").toLowerCase().includes(normalizedHotelSearch));

  const [hotelDialogOpen, setHotelDialogOpen] = useState(false);
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);
  const [deleteHotelId, setDeleteHotelId] = useState<string | null>(null);
  const [hotelForm, setHotelForm] = useState<HotelFormValues>(emptyHotelFormValues);

  const openCreateHotel = () => { setEditingHotelId(null); setHotelForm(emptyHotelFormValues); setHotelDialogOpen(true); };
  const openEditHotel = (h: any) => {
    setEditingHotelId(h.id);
    setHotelForm(hotelToFormValues(h));
    setHotelDialogOpen(true);
  };

  const registerHotel = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/hotels", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hotels"] });
      toast({ title: t("hotel_registered") });
      setHotelDialogOpen(false);
      setHotelForm(emptyHotelFormValues);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateHotel = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/hotels/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hotels"] });
      toast({ title: t("hotel_updated") });
      setHotelDialogOpen(false);
      setEditingHotelId(null);
      setHotelForm(emptyHotelFormValues);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteHotel = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/hotels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hotels"] });
      toast({ title: t("hotel_deleted") });
      setDeleteHotelId(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const submitHotel = () => {
    const payload = hotelFormToPayload(hotelForm);
    if (editingHotelId) updateHotel.mutate({ id: editingHotelId, ...payload });
    else registerHotel.mutate(payload);
  };

  const hotelGridTheme = useMemo(() => agGridTheme, []);
  const hotelDefaultColDef = useMemo<ColDef<any>>(() => agGridDefaultColDef, []);
  const hotelColumnDefs = useMemo<ColDef<any>[]>(() => [
    { headerName: t("hotel_name"), field: "name", minWidth: 220, flex: 1, filter: "agTextColumnFilter" },
    { headerName: t("stars_label"), width: 110, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.starRating ?? null, valueFormatter: (params) => `${params.value ?? ""} ⭐` },
    { headerName: t("base_price_label"), minWidth: 260, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => { const h = params.data; if (!h) return "-"; return [h.roomRateMatrimonial, h.roomRateDouble, h.roomRateTriple].some((r: any) => r) ? `M ${h.roomRateMatrimonial ?? "—"} / D ${h.roomRateDouble ?? "—"} / T ${h.roomRateTriple ?? "—"} ${h.currency}` : h.basePrice ? `${h.currency} ${h.basePrice}` : "-"; } },
    { headerName: t("status"), minWidth: 150, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => { const status = params.data?.status; return status === "approved" ? t("approved_status") : status === "draft" ? t("pending_approval") : status || ""; }, filterValueGetter: (params) => { const status = params.data?.status; return status === "approved" ? t("approved_status") : status === "draft" ? t("pending_approval") : status || ""; }, cellRenderer: (params: ICellRendererParams<any>) => { const status = params.data?.status; return <Badge variant={status === "approved" || status === "published" ? "default" : "secondary"} className="capitalize">{status === "approved" ? t("approved_status") : status === "draft" ? t("pending_approval") : status}</Badge>; } },
    { headerName: t("actions"), width: 100, pinned: "right", sortable: false, filter: false, resizable: false, cellRenderer: (params: ICellRendererParams<any>) => params.data ? <div className="flex items-center gap-1"><Button size="icon" variant="ghost" onClick={() => openEditHotel(params.data)} data-testid={`button-edit-hotel-${params.data.id}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setDeleteHotelId(params.data.id)} data-testid={`button-delete-hotel-${params.data.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> : null },
  ], [openEditHotel, t]);

  const { data: guideRates } = useQuery<any[]>({ queryKey: ["/api/rates/guide"] });
  const { data: sightsRates } = useQuery<any[]>({ queryKey: ["/api/rates/sights"] });
  const { data: airlineRates } = useQuery<any[]>({ queryKey: ["/api/rates/airline"] });
  const [guideSearch, setGuideSearch] = useState("");
  const [sightsSearch, setSightsSearch] = useState("");
  const [airlineSearch, setAirlineSearch] = useState("");
  const normalizedGuideSearch = guideSearch.trim().toLowerCase();
  const normalizedSightsSearch = sightsSearch.trim().toLowerCase();
  const normalizedAirlineSearch = airlineSearch.trim().toLowerCase();
  const filteredGuideRates = (guideRates || []).filter((rate) => [rate.guideName, rate.language, rate.currency, rate.price, rate.validFrom, rate.validTo, rate.status].filter(Boolean).join(" ").toLowerCase().includes(normalizedGuideSearch));
  const filteredSightsRates = (sightsRates || []).filter((rate) => [rate.attractionName, rate.ticketType, rate.currency, rate.pricePerPerson, rate.validFrom, rate.validTo, rate.status].filter(Boolean).join(" ").toLowerCase().includes(normalizedSightsSearch));
  const filteredAirlineRates = (airlineRates || []).filter((rate) => [rate.airlineName, rate.routeFrom, rate.routeTo, rate.currency, rate.price, rate.validFrom, rate.validTo, rate.status].filter(Boolean).join(" ").toLowerCase().includes(normalizedAirlineSearch));

  const saveRate = useMutation({
    mutationFn: ({ type, id, data }: { type: string, id?: string, data: any }) => {
      if (id) return apiRequest("PATCH", `/api/rates/${type}/${id}`, data);
      return apiRequest("POST", `/api/rates/${type}`, data);
    },
    onSuccess: (_, { type }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/rates/${type}`] });
      toast({ title: t("rate_saved_successfully") });
      setRateDialogOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteRate = useMutation({
    mutationFn: ({ type, id }: { type: string, id: string }) => apiRequest("DELETE", `/api/rates/${type}/${id}`),
    onSuccess: (_, { type }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/rates/${type}`] });
      toast({ title: t("rate_deleted"), variant: "destructive" });
    },
  });

  const guideStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => apiRequest("PATCH", `/api/rates/guide/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rates/guide"] });
      toast({ title: t("guide_status_updated") });
    },
  });

  const sightsStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => apiRequest("PATCH", `/api/rates/sights/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rates/sights"] });
      toast({ title: t("rate_saved_successfully") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const airlineStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: string }) => apiRequest("PATCH", `/api/rates/airline/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rates/airline"] });
      toast({ title: t("rate_saved_successfully") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [rateType, setRateType] = useState<"hotel" | "guide" | "sights" | "airline">("hotel");
  const [editingRate, setEditingRate] = useState<any>(null);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [guidePhotoUrl, setGuidePhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Sync the guide photo with whichever record the rate dialog opens for.
  useEffect(() => {
    if (rateDialogOpen) setGuidePhotoUrl(editingRate?.photoUrl || null);
  }, [rateDialogOpen, editingRate]);

  useEffect(() => {
    if (!rateDialogOpen || rateType !== "hotel") return;
    const hotelName = String(editingRate?.hotelName || "").trim().toLowerCase();
    const matchedHotel = (hotels || []).find((hotel: any) => hotel.id === editingRate?.hotelId)
      || (hotelName ? (hotels || []).find((hotel: any) => String(hotel.name || "").trim().toLowerCase() === hotelName) : undefined);
    setSelectedHotelId(matchedHotel?.id || "");
  }, [rateDialogOpen, rateType, editingRate, hotels]);

  const handleGuidePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const uploaded = await res.json();
      setGuidePhotoUrl(uploaded.url);
      toast({ title: t("image_uploaded_successfully") });
    } catch {
      toast({ title: t("failed_to_upload_image"), variant: "destructive" });
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const openRateDialog = (type: "hotel" | "guide" | "sights" | "airline", rate?: any) => {
    setRateType(type);
    setEditingRate(rate || null);
    setSelectedAttraction(rate?.attractionName || "");
    setSelectedAirline(rate?.airlineName || "");
    setRateDialogOpen(true);
  };

  const hotelRateGridTheme = useMemo(() => agGridTheme, []);
  const hotelRateDefaultColDef = useMemo<ColDef<any>>(() => agGridDefaultColDef, []);
  const hotelRateColumnDefs = useMemo<ColDef<any>[]>(() => [
    { headerName: t("hotel_name"), field: "hotelName", minWidth: 220, flex: 1, filter: "agTextColumnFilter" },
    { headerName: t("room_type"), minWidth: 150, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.roomType || "-" },
    { headerName: t("rate_label"), width: 150, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.pricePerRoomPerNight != null ? Number(params.data.pricePerRoomPerNight) : null, valueFormatter: (params) => params.data ? `${params.data.currency} ${params.data.pricePerRoomPerNight}` : "" },
    { headerName: t("validity_label"), minWidth: 190, flex: 1, filter: "agDateColumnFilter", valueGetter: (params) => `${params.data?.validFrom || ""} to ${params.data?.validTo || ""}`, filterValueGetter: (params) => toGridDate(params.data?.validFrom) },
    { headerName: t("status"), width: 130, filter: "agTextColumnFilter", field: "status", filterValueGetter: (params) => params.data?.status || "", cellRenderer: (params: ICellRendererParams<any>) => <Badge variant="outline" className="capitalize">{params.data?.status}</Badge> },
    { headerName: t("actions"), width: 110, pinned: "right", sortable: false, filter: false, resizable: false, cellRenderer: (params: ICellRendererParams<any>) => params.data ? <div className="flex justify-end gap-2"><Button variant="ghost" size="icon" onClick={() => openRateDialog("hotel", params.data)} data-testid={`button-edit-hotel-rate-${params.data.id}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if (confirm(t("confirm_delete_rate"))) deleteRate.mutate({ type: "hotel", id: params.data.id }); }}><Trash2 className="h-4 w-4" /></Button></div> : null },
  ], [deleteRate, openRateDialog, t]);

  const guideRateGridTheme = useMemo(() => agGridTheme, []);
  const guideRateDefaultColDef = useMemo<ColDef<any>>(() => agGridDefaultColDef, []);
  const guideRateColumnDefs = useMemo<ColDef<any>[]>(() => [
    { headerName: t("guide_name"), field: "guideName", minWidth: 220, flex: 1, filter: "agTextColumnFilter" },
    { headerName: t("language"), minWidth: 130, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.language || "-" },
    { headerName: t("rate_label"), width: 150, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.price != null ? Number(params.data.price) : null, valueFormatter: (params) => params.data ? `${params.data.currency} ${params.data.price}` : "" },
    { headerName: t("validity_label"), minWidth: 190, flex: 1, filter: "agDateColumnFilter", valueGetter: (params) => `${params.data?.validFrom || ""} to ${params.data?.validTo || ""}`, filterValueGetter: (params) => toGridDate(params.data?.validFrom) },
    {
      headerName: t("status"), minWidth: 180, flex: 1, filter: "agTextColumnFilter", field: "status", filterValueGetter: (params) => params.data?.status || "",
      cellRenderer: (params: ICellRendererParams<any>) => params.data ? <div className="flex items-center gap-2"><Switch checked={params.data.status === "active"} onCheckedChange={(checked) => guideStatusMutation.mutate({ id: params.data.id, status: checked ? "active" : "draft" })} disabled={guideStatusMutation.isPending || params.data.status === "archived"} aria-label={t("status")} data-testid={`switch-guide-status-${params.data.id}`} /><Badge variant="outline" className="capitalize">{params.data.status}</Badge></div> : null,
    },
    { headerName: t("actions"), width: 100, pinned: "right", sortable: false, filter: false, resizable: false, cellRenderer: (params: ICellRendererParams<any>) => params.data ? <div className="flex justify-end gap-2"><Button variant="ghost" size="icon" onClick={() => openRateDialog("guide", params.data)} data-testid={`button-edit-guide-${params.data.id}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-guide-${params.data.id}`} onClick={() => { if (confirm(t("delete_guide_confirm"))) deleteRate.mutate({ type: "guide", id: params.data.id }); }}><Trash2 className="h-4 w-4" /></Button></div> : null },
  ], [deleteRate, guideStatusMutation, openRateDialog, t]);

  const sightsRateGridTheme = useMemo(() => agGridTheme, []);
  const sightsRateDefaultColDef = useMemo<ColDef<any>>(() => agGridDefaultColDef, []);
  const sightsRateColumnDefs = useMemo<ColDef<any>[]>(() => [
    { headerName: t("attraction_label"), field: "attractionName", minWidth: 220, flex: 1, filter: "agTextColumnFilter" },
    { headerName: t("ticket_type_label"), minWidth: 160, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.ticketType || "-" },
    { headerName: t("price"), width: 150, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.pricePerPerson != null ? Number(params.data.pricePerPerson) : null, valueFormatter: (params) => params.data ? `${params.data.currency} ${params.data.pricePerPerson}` : "" },
    { headerName: t("validity_label"), minWidth: 190, flex: 1, filter: "agDateColumnFilter", valueGetter: (params) => `${params.data?.validFrom || ""} to ${params.data?.validTo || ""}`, filterValueGetter: (params) => toGridDate(params.data?.validFrom) },
    { headerName: t("status"), minWidth: 180, flex: 1, filter: "agTextColumnFilter", field: "status", filterValueGetter: (params) => params.data?.status || "", cellRenderer: (params: ICellRendererParams<any>) => params.data ? <div className="flex items-center gap-2"><Switch checked={params.data.status === "active"} onCheckedChange={(checked) => sightsStatusMutation.mutate({ id: params.data.id, status: checked ? "active" : "draft" })} disabled={sightsStatusMutation.isPending || params.data.status === "archived"} aria-label={t("status")} data-testid={`switch-sights-status-${params.data.id}`} /><Badge variant="outline" className="capitalize">{params.data.status}</Badge></div> : null },
    { headerName: t("actions"), width: 100, pinned: "right", sortable: false, filter: false, resizable: false, cellRenderer: (params: ICellRendererParams<any>) => params.data ? <div className="flex justify-end gap-2"><Button variant="ghost" size="icon" onClick={() => openRateDialog("sights", params.data)} data-testid={`button-edit-sights-${params.data.id}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-sights-${params.data.id}`} onClick={() => { if (confirm(t("confirm_delete_rate"))) deleteRate.mutate({ type: "sights", id: params.data.id }); }}><Trash2 className="h-4 w-4" /></Button></div> : null },
  ], [deleteRate, openRateDialog, sightsStatusMutation, t]);

  const airlineRateGridTheme = useMemo(() => agGridTheme, []);
  const airlineRateDefaultColDef = useMemo<ColDef<any>>(() => agGridDefaultColDef, []);
  const airlineRateColumnDefs = useMemo<ColDef<any>[]>(() => [
    { headerName: t("airline_label"), field: "airlineName", minWidth: 220, flex: 1, filter: "agTextColumnFilter" },
    { headerName: t("route_label"), minWidth: 220, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data ? `${params.data.routeFrom || "-"} → ${params.data.routeTo || "-"}` : "-" },
    { headerName: t("rate_label"), width: 150, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.price != null ? Number(params.data.price) : null, valueFormatter: (params) => params.data ? `${params.data.currency} ${params.data.price}` : "" },
    { headerName: t("validity_label"), minWidth: 190, flex: 1, filter: "agDateColumnFilter", valueGetter: (params) => `${params.data?.validFrom || ""} to ${params.data?.validTo || ""}`, filterValueGetter: (params) => toGridDate(params.data?.validFrom) },
    { headerName: t("status"), minWidth: 180, flex: 1, filter: "agTextColumnFilter", field: "status", filterValueGetter: (params) => params.data?.status || "", cellRenderer: (params: ICellRendererParams<any>) => params.data ? <div className="flex items-center gap-2"><Switch checked={params.data.status === "active"} onCheckedChange={(checked) => airlineStatusMutation.mutate({ id: params.data.id, status: checked ? "active" : "draft" })} disabled={airlineStatusMutation.isPending || params.data.status === "archived"} aria-label={t("status")} data-testid={`switch-airline-status-${params.data.id}`} /><Badge variant="outline" className="capitalize">{params.data.status}</Badge></div> : null },
    { headerName: t("actions"), width: 120, pinned: "right", sortable: false, filter: false, resizable: false, cellRenderer: (params: ICellRendererParams<any>) => params.data ? <div className="flex justify-end gap-2"><Button variant="ghost" size="icon" onClick={() => openRateDialog("airline", params.data)} data-testid={`button-edit-airline-rate-${params.data.id}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if (confirm(t("confirm_delete_rate"))) deleteRate.mutate({ type: "airline", id: params.data.id }); }}><Trash2 className="h-4 w-4" /></Button></div> : null },
  ], [airlineStatusMutation, deleteRate, openRateDialog, t]);

  // Sights rate dialog: attraction must come from the Sights Catalog (no free text)
  const [selectedAttraction, setSelectedAttraction] = useState("");
  const { data: catalogSights } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/master/sights"],
    enabled: rateDialogOpen && rateType === "sights",
  });
  const attractionOptions = useMemo(() => {
    const names = (catalogSights || []).map((s) => s.name).filter(Boolean);
    // keep the current value selectable even if it no longer exists in the catalog
    if (selectedAttraction && !names.includes(selectedAttraction)) names.push(selectedAttraction);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [catalogSights, selectedAttraction]);

  // Airline rate dialog: airline must come from the Airlines Catalog (no free text)
  const [selectedAirline, setSelectedAirline] = useState("");
  const { data: catalogAirlines } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/master/airline-agencies"],
    enabled: rateDialogOpen && rateType === "airline",
  });
  const airlineOptions = useMemo(() => {
    const names = (catalogAirlines || []).map((a) => a.name).filter(Boolean);
    // keep the current value selectable even if it no longer exists in the catalog
    if (selectedAirline && !names.includes(selectedAirline)) names.push(selectedAirline);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [catalogAirlines, selectedAirline]);


  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [uploadWorkflowId, setUploadWorkflowId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileUrl, setUploadFileUrl] = useState("");
  const [uploadDocType, setUploadDocType] = useState("voucher");
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const { data: bookingManifest, isLoading: manifestLoading } = useQuery<Booking & { 
    travelers: Traveler[]; 
    documents: Document[];
    tour?: { id: string; title: string; durationDays: number; durationNights: number; translations?: any };
    departure?: { id: string; startDate: string; endDate: string };
    hotels?: Array<{
      id: string;
      name: string;
      starRating?: number | null;
      address?: string | null;
      cityId?: string;
      checkinTime?: string | null;
      checkoutTime?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      imageUrl?: string | null;
      description?: string | null;
    }>;
    accommodationDetails?: {
      roomType?: string | null;
      roomsNeeded: number;
      roomAllocations?: any[];
      checkInDate?: string | null;
      checkOutDate?: string | null;
      nights?: number;
      assignedRooms?: Array<{ id: string; label: string; roomType: string; capacity: number; occupants: Array<{ id: string; firstName: string; lastName: string }> }>;
      specialRequests?: Array<{
        travelerName: string;
        roomingPreference?: string | null;
        dietaryNotes?: string | null;
        mobilityNotes?: string | null;
        specialNeeds?: string | null;
      }>;
    };
  }>({
    queryKey: [`/api/supplier/bookings/${selectedBookingId}`],
    enabled: !!selectedBookingId,
  });

  const { data: messages } = useQuery<any[]>({
    queryKey: [`/api/supplier/bookings/${selectedBookingId}/messages`],
    enabled: !!selectedBookingId,
  });

  const sendMessage = useMutation({
    mutationFn: (text: string) => apiRequest("POST", `/api/supplier/bookings/${selectedBookingId}/messages`, { messageText: text }),
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/bookings/${selectedBookingId}/messages`] });
    },
  });

  const uploadDocument = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/supplier/workflows/${uploadWorkflowId}/documents`, data),
    onSuccess: () => {
      setUploadWorkflowId(null);
      setUploadFileName("");
      setUploadFileUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/workflows"] });
      if (selectedBookingId) {
        queryClient.invalidateQueries({ queryKey: [`/api/supplier/bookings/${selectedBookingId}`] });
      }
      toast({ title: t("document_uploaded_successfully") });
    },
  });

  const config = ROLE_CONFIG[profile?.role || ""] || ROLE_CONFIG.admin;
  const DashboardIcon = config.icon;

  const pending = (workflows || []).filter((w) => w.status === "assigned" || w.status === "in_progress").length;
  const completed = (workflows || []).filter((w) => w.status === "completed").length;
  const blocked = (workflows || []).filter((w) => w.status === "blocked").length;

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-supplier-title">{config.title}</h1>
        <p className="text-muted-foreground text-sm">{config.subtitle}</p>
      </div>

      <SupplierNotifications />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-none shadow-sm bg-amber-500/5 border-l-4 border-l-amber-500">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm text-amber-700 dark:text-amber-400 font-medium">{t("active_tasks")}</p><p className="text-3xl font-bold text-amber-900 dark:text-amber-200">{pending}</p></div>
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center"><Clock className="h-6 w-6 text-amber-600" /></div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-none shadow-sm bg-emerald-500/5 border-l-4 border-l-emerald-500">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">{t("completed")}</p><p className="text-3xl font-bold text-emerald-900 dark:text-emerald-200">{completed}</p></div>
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 className="h-6 w-6 text-emerald-600" /></div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-none shadow-sm bg-rose-500/5 border-l-4 border-l-rose-500">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm text-rose-700 dark:text-rose-400 font-medium">{t("blocked_stat_label")}</p><p className="text-3xl font-bold text-rose-900 dark:text-rose-200">{blocked}</p></div>
                <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center"><AlertTriangle className="h-6 w-6 text-rose-600" /></div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
        <TabsContent value="service_requests">
          <SupplierServiceRequests />
        </TabsContent>

        <TabsContent value="tasks">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{t("assigned_workflows")}</h2>
              <p className="text-sm text-muted-foreground">{workflows?.length || 0} {t("tasks_assigned_suffix")}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-muted p-1 rounded-lg flex items-center gap-1 border">
                <Button 
                  size="sm" 
                  variant={tasksViewMode === "table" ? "secondary" : "ghost"}
                  className="h-8 px-2.5 text-xs gap-1.5"
                  onClick={() => setTasksViewMode("table")}
                  data-testid="button-view-table"
                >
                  <List className="h-3.5 w-3.5" />
                  <span>{t("table_view")}</span>
                </Button>
                <Button 
                  size="sm" 
                  variant={tasksViewMode === "cards" ? "secondary" : "ghost"}
                  className="h-8 px-2.5 text-xs gap-1.5"
                  onClick={() => setTasksViewMode("cards")}
                  data-testid="button-view-cards"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>{t("card_view")}</span>
                </Button>
              </div>
            </div>
          </div>

          {!workflows || workflows.length === 0 ? (
            <Card className="border-dashed border-2 bg-muted/30">
              <CardContent className="flex flex-col items-center py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Plane className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-semibold">{t("no_assignments_found")}</h3>
                <p className="text-muted-foreground max-w-xs">{t("no_assignments_message")}</p>
              </CardContent>
            </Card>
          ) : tasksViewMode === "table" ? (
            <div className="border rounded-xl overflow-hidden bg-card shadow-sm" data-testid="table-supplier-tasks">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-[140px]">{t("booking_code_label")}</TableHead>
                    <TableHead>{t("tour")} & {t("hotel_information")}</TableHead>
                    <TableHead className="w-[180px]">{t("room_type_and_count")}</TableHead>
                    <TableHead className="w-[170px]">{t("stay_dates")}</TableHead>
                    <TableHead className="w-[140px]">{t("status")}</TableHead>
                    <TableHead className="text-right w-[240px]">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workflows.map((wf) => {
                    const Icon = ROLE_CONFIG[wf.serviceType + "_manager"]?.icon || Plane;
                    const hotelNames = wf.hotels && wf.hotels.length > 0 
                      ? wf.hotels.map(h => h.name).join(", ") 
                      : null;
                    const roomTypeLabel = wf.booking?.roomType 
                      ? t((wf.booking.roomType === "matrimonial" ? "room_matrimonial" : wf.booking.roomType === "doble" ? "room_double" : "room_triple") as any) 
                      : "-";

                    return (
                      <TableRow key={wf.id} className="hover:bg-muted/30" data-testid={`row-task-${wf.id}`}>
                        <TableCell className="font-mono text-xs font-semibold align-top py-3.5">
                          <div className="space-y-1">
                            <span className="bg-muted px-2 py-0.5 rounded text-[11px] block w-fit font-mono font-bold">
                              {wf.booking?.bookingCode || `BK-${wf.bookingId?.slice(0, 8)}`}
                            </span>
                            {wf.booking?.groupName && (
                              <p className="text-[11px] text-muted-foreground truncate max-w-[130px]" title={wf.booking.groupName}>
                                {wf.booking.groupName}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-3.5">
                          <div className="space-y-1.5 max-w-[280px]">
                            <p className="font-semibold text-sm leading-snug line-clamp-1" title={wf.tour?.title}>
                              {wf.tour?.title || t("booking_details_unavailable")}
                            </p>
                            {wf.serviceType === "hotel" ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                                  <Hotel className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate" title={hotelNames || ""}>
                                    {hotelNames || t("no_hotels_assigned_tour")}
                                  </span>
                                </div>
                                {wf.hotels && wf.hotels[0]?.address && (
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {wf.hotels[0].address}
                                  </p>
                                )}
                              </div>
                            ) : wf.serviceType === "airline" ? (() => {
                              const flightSched = getFlightSchedule(
                                wf.departure?.startDate,
                                wf.departure?.endDate,
                                wf.tour?.countries,
                                wf.tour?.title
                              );
                              return (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 text-xs text-sky-700 dark:text-sky-300 font-semibold">
                                    <Plane className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                                    <span className="truncate" title={`${wf.booking?.departureCity || "Jakarta (CGK)"} → ${wf.tour?.countries?.join(", ") || wf.tour?.title || "Destinasi Tour"}`}>
                                      {wf.booking?.departureCity || "Jakarta (CGK)"} &rarr; {wf.tour?.countries?.join(", ") || wf.tour?.title || "Destinasi Tour"}
                                    </span>
                                    <Badge variant="outline" className={`text-[9px] px-1 py-0 ml-1 shrink-0 ${flightSched.isInternational ? "border-indigo-300 text-indigo-700 dark:text-indigo-300" : "border-emerald-300 text-emerald-700 dark:text-emerald-300"}`}>
                                      {flightSched.routeTypeLabel}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Ticket className="h-3 w-3" />
                                    {wf.booking?.partySizeExpected ?? 1} Tiket PP &bull; {flightSched.tagLabel}
                                  </p>
                                </div>
                              );
                            })() : (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="capitalize">{wf.serviceType}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-3.5">
                          {wf.serviceType === "airline" ? (
                            <div className="space-y-1 text-xs">
                              <div className="font-semibold flex items-center gap-1.5 text-sky-800 dark:text-sky-300">
                                <Ticket className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                                <span>{wf.booking?.partySizeExpected ?? 1} Tiket (Pax)</span>
                              </div>
                              <p className="text-muted-foreground text-[11px] truncate max-w-[170px]" title={wf.booking?.departureCity || "Jakarta (CGK)"}>
                                Hub: {wf.booking?.departureCity || "Jakarta (CGK)"}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-1 text-xs">
                              <div className="font-semibold flex items-center gap-1.5">
                                <Bed className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{wf.roomsNeeded || 1} {t("room_units_count")}</span>
                                <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">
                                  {roomTypeLabel}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
                                <Users className="h-3 w-3" />
                                <span>{wf.booking?.partySizeExpected ?? 1} {t("pax_suffix")}</span>
                              </p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top py-3.5">
                          {wf.serviceType === "airline" ? (() => {
                            const flightSched = getFlightSchedule(
                              wf.departure?.startDate,
                              wf.departure?.endDate,
                              wf.tour?.countries,
                              wf.tour?.title
                            );
                            return (
                              <div className="space-y-0.5 text-xs">
                                {flightSched.flightDepartureDate ? (
                                  <>
                                    <p className="font-medium text-sky-900 dark:text-sky-200">
                                      {format(flightSched.flightDepartureDate, "dd MMM yyyy")} <span className="text-[10px] text-sky-600 dark:text-sky-400">({flightSched.tagLabel})</span>
                                    </p>
                                    <p className="text-muted-foreground text-[11px]">
                                      {flightSched.flightReturnDate ? `→ ${format(flightSched.flightReturnDate, "dd MMM yyyy")}` : ""}
                                    </p>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </div>
                            );
                          })() : (
                            <div className="space-y-0.5 text-xs">
                              {wf.departure?.startDate ? (
                                <>
                                  <p className="font-medium text-slate-800 dark:text-slate-200">
                                    {format(new Date(wf.departure.startDate), "dd MMM yyyy")}
                                  </p>
                                  <p className="text-muted-foreground text-[11px]">
                                    {wf.departure?.endDate ? `→ ${format(new Date(wf.departure.endDate), "dd MMM yyyy")}` : ""}
                                    {wf.tour?.durationNights ? ` (${wf.tour.durationNights}N)` : ""}
                                  </p>
                                </>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top py-3.5">
                          {(() => {
                            const statusPres = getSupplierTaskStatus(wf.status);
                            const StatusIcon = statusPres.icon;
                            return (
                              <div className="space-y-1">
                                <Badge variant="outline" className={`gap-1 px-2 py-0.5 text-xs ${statusPres.badgeClass}`}>
                                  <StatusIcon className="h-3 w-3" />
                                  <span>{statusPres.label}</span>
                                </Badge>
                                {(wf.status === "assigned" || wf.status === "not_assigned" || !wf.status) && (
                                  <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                                    Tugas baru
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right align-top py-3.5">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {(wf.status === "assigned" || wf.status === "not_assigned" || !wf.status) ? (
                              <Button 
                                size="sm" 
                                className="h-8 px-2.5 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                                onClick={() => acceptTask.mutate(wf.id)}
                                disabled={acceptTask.isPending}
                                data-testid={`button-accept-task-${wf.id}`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Terima Tugas</span>
                              </Button>
                            ) : wf.status === "in_progress" ? (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="h-8 px-2.5 text-xs gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
                                onClick={() => completeTask.mutate(wf.id)}
                                disabled={completeTask.isPending}
                                data-testid={`button-complete-task-${wf.id}`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Selesaikan</span>
                              </Button>
                            ) : null}

                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="h-8 px-2.5 text-xs rounded-lg"
                              onClick={() => setSelectedBookingId(wf.bookingId || null)}
                              title={t("manifest_button")}
                              data-testid={`button-manifest-${wf.id}`}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              <span>{t("manifest_button")}</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 rounded-lg text-primary"
                              onClick={() => setUploadWorkflowId(wf.id)}
                              title={t("upload_button")}
                              data-testid={`button-upload-${wf.id}`}
                            >
                              <Upload className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {workflows.map((wf, index) => {
                  const Icon = ROLE_CONFIG[wf.serviceType + "_manager"]?.icon || Plane;
                  const hotelNames = wf.hotels && wf.hotels.length > 0 
                    ? wf.hotels.map(h => h.name).join(", ") 
                    : null;
                  const roomTypeLabel = wf.booking?.roomType 
                    ? t((wf.booking.roomType === "matrimonial" ? "room_matrimonial" : wf.booking.roomType === "doble" ? "room_double" : "room_triple") as any) 
                    : "-";

                  return (
                    <motion.div
                      key={wf.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 border-none shadow-md group">
                        <div className={`h-1 w-full ${
                          wf.status === 'completed' ? 'bg-emerald-500' : 
                          wf.status === 'blocked' ? 'bg-rose-500' : 'bg-amber-500'
                        }`} />
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start mb-2">
                            {(() => {
                              const statusPres = getSupplierTaskStatus(wf.status);
                              const StatusIcon = statusPres.icon;
                              return (
                                <Badge variant="outline" className={`gap-1 px-2 py-0.5 text-xs font-semibold ${statusPres.badgeClass}`}>
                                  <StatusIcon className="h-3 w-3" />
                                  <span>{statusPres.label}</span>
                                </Badge>
                              );
                            })()}
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">
                              {wf.booking?.bookingCode || `BK-${wf.bookingId?.slice(0, 8)}`}
                            </span>
                          </div>
                          <CardTitle className="text-lg flex items-center gap-2 group-hover:text-primary transition-colors">
                            <Icon className="h-5 w-5 text-primary/70" />
                            {wf.serviceType.toUpperCase()}
                          </CardTitle>
                          <CardDescription className="font-medium text-slate-900 dark:text-slate-200 truncate">
                            {wf.booking?.groupName || (wf.booking?.bookingCode ? `${t("booking_prefix")} ${wf.booking.bookingCode}` : t("booking_details_unavailable"))}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {wf.tour?.title && (
                              <p className="text-xs text-muted-foreground truncate font-medium">
                                {wf.tour.title}
                              </p>
                            )}

                            {wf.serviceType === "airline" && (() => {
                              const flightSched = getFlightSchedule(
                                wf.departure?.startDate,
                                wf.departure?.endDate,
                                wf.tour?.countries,
                                wf.tour?.title
                              );
                              return (
                                <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs space-y-1" data-testid={`card-airline-summary-${wf.id}`}>
                                  <div className="flex items-center justify-between gap-1 font-semibold text-sky-800 dark:text-sky-300">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Plane className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                                      <span className="truncate">
                                        {wf.booking?.departureCity || "Jakarta (CGK)"} &rarr; {wf.tour?.countries?.join(", ") || wf.tour?.title || "Destinasi Tour"}
                                      </span>
                                    </div>
                                    <Badge variant="outline" className={`text-[10px] px-1 py-0 shrink-0 ${flightSched.isInternational ? "border-indigo-300 text-indigo-700 dark:text-indigo-300" : "border-emerald-300 text-emerald-700 dark:text-emerald-300"}`}>
                                      {flightSched.routeTypeLabel}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                                    <span className="flex items-center gap-1">
                                      <Ticket className="h-3 w-3" />
                                      {wf.booking?.partySizeExpected ?? 1} Tiket (Pax)
                                    </span>
                                    {flightSched.flightDepartureDate && (
                                      <span>
                                        {format(flightSched.flightDepartureDate, "dd MMM")} ({flightSched.tagLabel}) - {flightSched.flightReturnDate ? format(flightSched.flightReturnDate, "dd MMM yyyy") : ""}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {wf.serviceType === "hotel" && hotelNames && (
                              <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-xs space-y-1">
                                <div className="flex items-center gap-1.5 font-semibold text-primary">
                                  <Hotel className="h-3.5 w-3.5" />
                                  <span className="truncate">{hotelNames}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span>{wf.roomsNeeded || 1} {t("room_units_count")} ({roomTypeLabel})</span>
                                  {wf.departure?.startDate && (
                                    <span>{format(new Date(wf.departure.startDate), "dd MMM")}</span>
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border bg-slate-50 dark:bg-slate-800/50 text-xs">
                              <div className="flex items-center gap-1.5 font-medium">
                                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{wf.booking?.partySizeExpected ?? "-"} {t("pax_suffix")}</span>
                              </div>
                              <span className="text-muted-foreground text-[11px]">
                                {wf.departure?.startDate ? format(new Date(wf.departure.startDate), "dd MMM yyyy") : "-"}
                              </span>
                            </div>

                            <div className="flex flex-col gap-2 pt-1">
                              {(wf.status === "assigned" || wf.status === "not_assigned" || !wf.status) ? (
                                <Button 
                                  size="sm" 
                                  className="w-full rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs gap-1.5 h-9"
                                  onClick={() => acceptTask.mutate(wf.id)}
                                  disabled={acceptTask.isPending}
                                  data-testid={`button-accept-task-card-${wf.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>Terima Tugas</span>
                                </Button>
                              ) : wf.status === "in_progress" ? (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="w-full rounded-full text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-semibold gap-1.5 h-9"
                                  onClick={() => completeTask.mutate(wf.id)}
                                  disabled={completeTask.isPending}
                                  data-testid={`button-complete-task-card-${wf.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>Tandai Selesai</span>
                                </Button>
                              ) : null}

                              <div className="flex gap-2">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="flex-1 rounded-full hover:bg-primary hover:text-white transition-colors"
                                  onClick={() => setSelectedBookingId(wf.bookingId || null)}
                                >
                                  {t("manifest_button")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="flex-1 rounded-full shadow-sm"
                                  onClick={() => setUploadWorkflowId(wf.id)}
                                >
                                  {t("upload_button")}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>

      <TabsContent value="hotels">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("hotels_catalog")}</CardTitle>
              <CardDescription>{t("manage_accommodation_bookings")}</CardDescription>
            </div>
            <Button size="sm" onClick={openCreateHotel}><Plus className="h-4 w-4 mr-2" /> {t("register_hotel")}</Button>
          </CardHeader>
          <CardContent>
            <div className="relative max-w-sm mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder={t("search_hotels_placeholder")} value={hotelSearch} onChange={(e) => setHotelSearch(e.target.value)} data-testid="input-search-hotels" /></div>
            {filteredHotels.length > 0 ? <div data-testid="grid-supplier-hotels" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<any> theme={hotelGridTheme} rowData={filteredHotels} columnDefs={hotelColumnDefs} defaultColDef={hotelDefaultColDef} getRowId={(params: GetRowIdParams<any>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{normalizedHotelSearch ? t("no_results") : t("no_hotels_found")}</TableCell></TableRow></TableBody></Table>}
          </CardContent>
        </Card>
      </TabsContent>

      <Dialog open={hotelDialogOpen} onOpenChange={setHotelDialogOpen}>
        <DialogContent className="flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingHotelId ? t("edit_hotel") : t("register_hotel")}</DialogTitle>
            <DialogDescription>{t("pending_approval")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
            <HotelFormFields value={hotelForm} onChange={setHotelForm} cities={cities} />
          </div>
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => { setHotelDialogOpen(false); setEditingHotelId(null); }}>{t("cancel")}</Button>
            <Button
              onClick={submitHotel}
              disabled={!hotelForm.name || !hotelForm.cityId || registerHotel.isPending || updateHotel.isPending}
            >
              {(registerHotel.isPending || updateHotel.isPending) ? t("saving") : editingHotelId ? t("save") : t("register_hotel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteHotelId} onOpenChange={(v) => !v && setDeleteHotelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirm_delete")}</DialogTitle>
            <DialogDescription>{t("delete_hotel_confirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteHotelId(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteHotelId && deleteHotel.mutate(deleteHotelId)} disabled={deleteHotel.isPending}>
              {deleteHotel.isPending ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TabsContent value="hotel_rates">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("hotel_rates_management")}</CardTitle>
              <CardDescription>{t("manage_room_types_pricing")}</CardDescription>
            </div>
            <Button size="sm" onClick={() => openRateDialog("hotel")}><Plus className="h-4 w-4 mr-2" /> {t("create_rate")}</Button>
           </CardHeader>
           <CardContent>
             <div className="relative max-w-sm mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder={t("search_hotel_rates_placeholder")} value={hotelRateSearch} onChange={(e) => setHotelRateSearch(e.target.value)} data-testid="input-search-hotel-rates" /></div>
             {filteredHotelRates.length > 0 ? <div data-testid="grid-supplier-hotel-rates" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<any> theme={hotelRateGridTheme} rowData={filteredHotelRates} columnDefs={hotelRateColumnDefs} defaultColDef={hotelRateDefaultColDef} getRowId={(params: GetRowIdParams<any>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{normalizedHotelRateSearch ? t("no_results") : t("no_rates_found_message")}</TableCell></TableRow></TableBody></Table>}
           </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="guide_rates">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("guide_rates_management")}</CardTitle>
              <CardDescription>{t("manage_service_rates_availability")}</CardDescription>
            </div>
            <Button size="sm" onClick={() => openRateDialog("guide")}><Plus className="h-4 w-4 mr-2" /> {t("create_rate")}</Button>
           </CardHeader>
           <CardContent>
             <div className="relative max-w-sm mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder={t("search_guide_rates_placeholder")} value={guideSearch} onChange={(e) => setGuideSearch(e.target.value)} data-testid="input-search-guide-rates" /></div>
             {filteredGuideRates.length > 0 ? <div data-testid="grid-supplier-guide-rates" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<any> theme={guideRateGridTheme} rowData={filteredGuideRates} columnDefs={guideRateColumnDefs} defaultColDef={guideRateDefaultColDef} getRowId={(params: GetRowIdParams<any>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{normalizedGuideSearch ? t("no_results") : t("no_rates_found_message")}</TableCell></TableRow></TableBody></Table>}
           </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sights_catalog">
        <Card>
          <CardHeader>
            <CardTitle>{t("sights_catalog")}</CardTitle>
            <CardDescription>{t("sights_catalog_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SightsTab />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sights_rates">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("sights_attractions_rates")}</CardTitle>
              <CardDescription>{t("manage_ticket_prices_slots")}</CardDescription>
            </div>
            <Button size="sm" onClick={() => openRateDialog("sights")}><Plus className="h-4 w-4 mr-2" /> {t("create_rate")}</Button>
           </CardHeader>
           <CardContent>
             <div className="relative max-w-sm mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder={t("search_sights_rates_placeholder")} value={sightsSearch} onChange={(e) => setSightsSearch(e.target.value)} data-testid="input-search-sights-rates" /></div>
             {filteredSightsRates.length > 0 ? <div data-testid="grid-supplier-sights-rates" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<any> theme={sightsRateGridTheme} rowData={filteredSightsRates} columnDefs={sightsRateColumnDefs} defaultColDef={sightsRateDefaultColDef} getRowId={(params: GetRowIdParams<any>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{normalizedSightsSearch ? t("no_results") : t("no_rates_found_message")}</TableCell></TableRow></TableBody></Table>}
           </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="airlines_catalog">
        <Card>
          <CardHeader>
            <CardTitle>{t("airlines_catalog")}</CardTitle>
            <CardDescription>{t("airlines_catalog_desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AirlinesCatalogTab />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="airline_rates">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("airline_rates_management")}</CardTitle>
              <CardDescription>{t("manage_ticket_fares_route_cabin")}</CardDescription>
            </div>
            <Button size="sm" onClick={() => openRateDialog("airline")}><Plus className="h-4 w-4 mr-2" /> {t("create_rate")}</Button>
           </CardHeader>
           <CardContent>
             <div className="relative max-w-sm mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder={t("search_airline_agencies_placeholder")} value={airlineSearch} onChange={(e) => setAirlineSearch(e.target.value)} data-testid="input-search-airline-rates" /></div>
             {filteredAirlineRates.length > 0 ? <div data-testid="grid-supplier-airline-rates" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<any> theme={airlineRateGridTheme} rowData={filteredAirlineRates} columnDefs={airlineRateColumnDefs} defaultColDef={airlineRateDefaultColDef} getRowId={(params: GetRowIdParams<any>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{normalizedAirlineSearch ? t("no_results") : t("no_rates_found_message")}</TableCell></TableRow></TableBody></Table>}
           </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

      {/* Manifest Modal */}
      <Dialog open={!!selectedBookingId} onOpenChange={(v) => !v && setSelectedBookingId(null)}>
        <DialogContent className="max-w-3xl border-none shadow-2xl overflow-hidden p-0 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-xl">
          <div className="bg-primary/5 p-6 border-b">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                {t("booking_details_manifest")}
              </DialogTitle>
              <DialogDescription>
                {t("booking_manifest_description")}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6">
            {manifestLoading ? (
              <div className="space-y-4 py-8">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <Tabs defaultValue={(workflows?.find(w => w.bookingId === selectedBookingId)?.serviceType === "hotel" || (bookingManifest?.hotels && bookingManifest.hotels.length > 0) || !!bookingManifest?.accommodationDetails) ? "accommodation" : "travelers"} className="w-full">
              <TabsList className={`grid w-full ${(workflows?.find(w => w.bookingId === selectedBookingId)?.serviceType === "hotel" || (bookingManifest?.hotels && bookingManifest.hotels.length > 0) || !!bookingManifest?.accommodationDetails) ? "grid-cols-4" : "grid-cols-3"} mb-4`}>
                {(workflows?.find(w => w.bookingId === selectedBookingId)?.serviceType === "hotel" || (bookingManifest?.hotels && bookingManifest.hotels.length > 0) || !!bookingManifest?.accommodationDetails) && (
                  <TabsTrigger value="accommodation" data-testid="tab-manifest-accommodation"><Hotel className="h-4 w-4 mr-2" /> {t("accommodation_details")}</TabsTrigger>
                )}
                <TabsTrigger value="travelers"><Users className="h-4 w-4 mr-2" /> {t("travelers_tab")}</TabsTrigger>
                <TabsTrigger value="documents"><FileCheck className="h-4 w-4 mr-2" /> {t("documents_tab")}</TabsTrigger>
                <TabsTrigger value="messages"><MessageSquare className="h-4 w-4 mr-2" /> {t("messages_tab")}</TabsTrigger>
              </TabsList>

              {(workflows?.find(w => w.bookingId === selectedBookingId)?.serviceType === "hotel" || (bookingManifest?.hotels && bookingManifest.hotels.length > 0) || !!bookingManifest?.accommodationDetails) && (
                <TabsContent value="accommodation" className="space-y-4">
                  {/* Summary Banner */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold">{t("tour_label")}</p>
                      <p className="font-medium text-foreground">{bookingManifest?.tour?.title || workflows?.find(w => w.bookingId === selectedBookingId)?.tour?.title || "-"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{bookingManifest?.bookingCode}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold">{t("stay_dates")}</p>
                      <p className="font-medium text-foreground">
                        {bookingManifest?.accommodationDetails?.checkInDate
                          ? `${format(new Date(bookingManifest.accommodationDetails.checkInDate), "dd MMM yyyy")} - ${bookingManifest.accommodationDetails?.checkOutDate ? format(new Date(bookingManifest.accommodationDetails.checkOutDate), "dd MMM yyyy") : ""}`
                          : "-"}
                      </p>
                      {bookingManifest?.accommodationDetails?.nights != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">{bookingManifest.accommodationDetails.nights} {t("days")}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-semibold">{t("rooms_reserved")}</p>
                      <p className="font-semibold text-primary">
                        {bookingManifest?.accommodationDetails?.roomsNeeded || workflows?.find(w => w.bookingId === selectedBookingId)?.roomsNeeded || 1} {t("rooms_summary")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {bookingManifest?.accommodationDetails?.roomType || "Standard"} • {bookingManifest?.partySizeExpected} {t("pax_suffix")}
                      </p>
                    </div>
                  </div>

                  {/* Hotel Info Cards */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                      <Building className="h-4 w-4 text-primary" /> {t("hotel_information")}
                    </h4>
                    {bookingManifest?.hotels && bookingManifest.hotels.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        {bookingManifest.hotels.map((h: any) => (
                          <div key={h.id} className="p-3.5 rounded-lg border bg-card/60 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-base text-foreground">{h.name}</span>
                                  {h.starRating && (
                                    <Badge variant="outline" className="text-amber-500 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-xs">
                                      {"★".repeat(h.starRating)} {h.starRating} Star
                                    </Badge>
                                  )}
                                </div>
                                {h.address && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                    <MapPin className="h-3 w-3 shrink-0" /> {h.address}
                                  </p>
                                )}
                              </div>
                              <div className="text-right text-xs space-y-0.5 shrink-0 bg-muted/40 p-2 rounded">
                                <p className="text-muted-foreground">{t("check_in")}: <span className="font-semibold text-foreground">{h.checkInTime || "14:00"}</span></p>
                                <p className="text-muted-foreground">{t("check_out")}: <span className="font-semibold text-foreground">{h.checkOutTime || "12:00"}</span></p>
                              </div>
                            </div>
                            {(h.phone || h.email) && (
                              <div className="flex flex-wrap items-center gap-3 pt-1 border-t text-xs text-muted-foreground">
                                {h.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {h.phone}</span>}
                                {h.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {h.email}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic p-3 border rounded bg-muted/20">
                        {t("no_hotels_assigned_tour")}
                      </p>
                    )}
                  </div>

                  {/* Rooming List */}
                  {bookingManifest?.accommodationDetails?.assignedRooms && bookingManifest.accommodationDetails.assignedRooms.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
                        <Bed className="h-4 w-4 text-primary" /> {t("room_assignments_tab")}
                      </h4>
                      <div className="border rounded-md overflow-hidden text-xs">
                        <table className="w-full">
                          <thead className="bg-muted text-muted-foreground font-medium">
                            <tr>
                              <th className="p-2 text-left">{t("room_type")}</th>
                              <th className="p-2 text-left">{t("travelers_tab")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bookingManifest.accommodationDetails.assignedRooms.map((r) => (
                              <tr key={r.id} className="border-t">
                                <td className="p-2 font-medium">
                                  {r.label} <span className="text-muted-foreground font-normal">({r.roomType})</span>
                                </td>
                                <td className="p-2">
                                  {r.occupants && r.occupants.length > 0
                                    ? r.occupants.map((o: any) => `${o.firstName} ${o.lastName}`).join(", ")
                                    : <span className="text-muted-foreground italic">-</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Special Requests */}
                  {bookingManifest?.accommodationDetails?.specialRequests && bookingManifest.accommodationDetails.specialRequests.length > 0 && (
                    <div className="p-3 rounded-lg border bg-amber-500/5 border-amber-500/20 text-xs space-y-1">
                      <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" /> {t("special_guest_notes")}
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-foreground">
                        {bookingManifest.accommodationDetails.specialRequests.map((req: any, idx: number) => (
                          <li key={idx}>
                            <span className="font-medium">{req.travelerName}:</span>{" "}
                            {[req.roomingPreference, req.dietaryNotes, req.mobilityNotes, req.specialNeeds].filter(Boolean).join(" • ")}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </TabsContent>
              )}

              <TabsContent value="travelers" className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm border rounded-md p-3 bg-muted/30">
                  <div><p className="text-muted-foreground">{t("booking_code_label")}</p><p className="font-semibold">{bookingManifest?.bookingCode}</p></div>
                  <div><p className="text-muted-foreground">{t("total_pax_label")}</p><p className="font-semibold">{bookingManifest?.partySizeExpected} {t("pax_suffix")}</p></div>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">{t("name_label")}</th>
                        <th className="p-2 text-left">{t("passport_label")}</th>
                        <th className="p-2 text-left">{t("nationality_label")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookingManifest?.travelers.map((tr) => (
                        <tr key={tr.id} className="border-t">
                          <td className="p-2">{tr.firstName} {tr.lastName}</td>
                          <td className="p-2">{tr.passportNumber || "-"}</td>
                          <td className="p-2">{tr.nationality || "-"}</td>
                        </tr>
                      ))}
                      {(!bookingManifest?.travelers || bookingManifest.travelers.length === 0) && (
                        <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">{t("no_travelers_found")}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="documents" className="space-y-4">
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">{t("document_label")}</th>
                        <th className="p-2 text-left">{t("type_label")}</th>
                        <th className="p-2 text-left">{t("status")}</th>
                        <th className="p-2 text-right">{t("action_label")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookingManifest?.documents?.map((d) => (
                        <tr key={d.id} className="border-t">
                          <td className="p-2 font-medium">{d.fileName}</td>
                          <td className="p-2 capitalize">{d.docType}</td>
                          <td className="p-2">
                            <Badge variant={d.status === 'approved' ? 'default' : d.status === 'rejected' ? 'destructive' : 'outline'}>
                              {d.status}
                            </Badge>
                          </td>
                          <td className="p-2 text-right">
                            {d.fileUrl && (
                              <Button size="icon" variant="ghost" asChild>
                                <a href={getFullImageUrl(d.fileUrl)} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(!bookingManifest?.documents || bookingManifest.documents?.length === 0) && (
                        <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{t("no_documents_uploaded")}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-center">
                   <Button size="sm" onClick={() => {
                     // Find the workflow ID for this booking
                     const wf = workflows?.find(w => w.bookingId === selectedBookingId);
                     if (wf) setUploadWorkflowId(wf.id);
                   }}>
                     <Upload className="h-4 w-4 mr-2" /> {t("upload_new_document")}
                   </Button>
                </div>
              </TabsContent>

              <TabsContent value="messages" className="space-y-4">
                <div className="border rounded-md p-3 h-64 overflow-y-auto space-y-3 bg-muted/20 flex flex-col">
                  {messages?.map((m) => (
                    <div key={m.id} className={`flex flex-col mb-2 ${m.senderUserId === profile?.userId ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[80%] rounded-lg p-2 text-sm ${
                        m.senderUserId === profile?.userId ? 'bg-primary text-primary-foreground' : 'bg-card border'
                      }`}>
                        <p className="font-semibold text-[10px] opacity-70 mb-1">
                          {m.senderUserId === profile?.userId ? t("you_label") : m.senderName} • {new Date(m.createdAt).toLocaleTimeString()}
                        </p>
                        <p className="whitespace-pre-wrap">{m.messageText}</p>
                      </div>
                    </div>
                  ))}
                  {(!messages || messages.length === 0) && (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                      {t("no_internal_messages")}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("type_message_placeholder")}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && newMessage && sendMessage.mutate(newMessage)}
                  />
                  <Button size="icon" disabled={!newMessage || sendMessage.isPending} onClick={() => sendMessage.mutate(newMessage)}>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>

      {/* Upload Document Modal */}
      <Dialog open={!!uploadWorkflowId} onOpenChange={(v) => !v && setUploadWorkflowId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("upload_document_voucher")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>{t("document_type_label")}</Label>
              <Select value={uploadDocType} onValueChange={setUploadDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="voucher">{t("voucher_option")}</SelectItem>
                  <SelectItem value="hotel_confirm">{t("hotel_confirmation_option")}</SelectItem>
                  <SelectItem value="eticket">{t("eticket_option")}</SelectItem>
                  <SelectItem value="pnr">{t("pnr_details_option")}</SelectItem>
                  <SelectItem value="other">{t("other_option")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("file_name_description_label")}</Label>
              <Input
                placeholder={t("file_name_placeholder_example")}
                value={uploadFileName}
                onChange={(e) => setUploadFileName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("file_upload_optional_label")}</Label>
              <Input
                type="file" 
                accept=".pdf,image/*"
                disabled={isUploadingFile}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsUploadingFile(true);
                  try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const res = await fetch("/api/upload-document", {
                      method: "POST",
                      body: formData,
                    });
                    if (!res.ok) throw new Error("Upload failed");
                    const data = await res.json();
                    setUploadFileUrl(data.url);
                    if (!uploadFileName) setUploadFileName(file.name);
                    toast({ title: t("file_uploaded_temporarily"), description: t("click_upload_document_save") });
                  } catch (err: any) {
                    toast({ title: err.message, variant: "destructive" });
                  } finally {
                    setIsUploadingFile(false);
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("file_url_label")}</Label>
              <Input
                placeholder={t("url_placeholder_example")}
                value={uploadFileUrl}
                onChange={(e) => setUploadFileUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadWorkflowId(null)}>{t("cancel")}</Button>
            <Button onClick={() => uploadDocument.mutate({ fileName: uploadFileName, fileUrl: uploadFileUrl, docType: uploadDocType })} disabled={!uploadFileName || !uploadFileUrl || uploadDocument.isPending}>
                {uploadDocument.isPending ? t("uploading_ellipsis") : t("upload_document_button")}
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate Dialog Form */}
      <Dialog open={rateDialogOpen} onOpenChange={setRateDialogOpen}>
        <DialogContent className="flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingRate ? t("edit_rate") : t("create_new_rate")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const data: any = {
              validFrom: fd.get("validFrom"),
              validTo: fd.get("validTo"),
            };
            // The server forces new rates to "draft" (they're activated via the
            // status switch afterwards). On edit, preserve the row's current
            // status so saving unrelated fields doesn't silently change it.
            if (editingRate) data.status = editingRate.status;
            if (rateType === "hotel") {
              const selectedHotel = (hotels || []).find((hotel: any) => hotel.id === selectedHotelId);
              if (!selectedHotel) {
                toast({ title: t("select_hotel"), variant: "destructive" });
                return;
              }
              data.hotelId = selectedHotel.id;
              data.hotelName = selectedHotel.name;
              data.roomType = fd.get("roomType");
              // price maps to a numeric column -> the insert schema expects a string
              data.pricePerRoomPerNight = fd.get("price");
            } else if (rateType === "guide") {
              data.guideName = fd.get("guideName");
              data.language = fd.get("language");
              // price maps to a numeric column -> the insert schema expects a string
              data.price = fd.get("price");
              data.email = fd.get("email") || null;
              data.phone = fd.get("phone") || null;
              data.photoUrl = guidePhotoUrl || null;
              const ageVal = fd.get("age") as string;
              data.age = ageVal ? parseInt(ageVal) : null;
            } else if (rateType === "airline") {
              if (!selectedAirline) {
                toast({ title: t("select_airline"), variant: "destructive" });
                return;
              }
              data.airlineName = selectedAirline;
              data.routeFrom = fd.get("routeFrom");
              data.routeTo = fd.get("routeTo");
              // price maps to a numeric column -> the insert schema expects a string
              data.price = fd.get("price");
            } else {
              if (!selectedAttraction) {
                toast({ title: t("select_attraction"), variant: "destructive" });
                return;
              }
              data.attractionName = selectedAttraction;
              data.ticketType = fd.get("ticketType");
              // pricePerPerson maps to a numeric column -> the insert schema expects a string
              data.pricePerPerson = fd.get("price");
            }
            saveRate.mutate({ type: rateType, id: editingRate?.id, data });
          }} className="flex flex-col overflow-hidden flex-1">
            <div className="space-y-4 pt-4 overflow-y-auto flex-1 pr-1 -mr-1">
            {rateType === "hotel" && (
              <>
                <div className="space-y-2">
                  <Label>{t("hotel_name")}</Label>
                  <Select value={selectedHotelId || "__none__"} onValueChange={(value) => setSelectedHotelId(value === "__none__" ? "" : value)}>
                    <SelectTrigger data-testid="select-hotel-name">
                      <SelectValue placeholder={t("select_placeholder")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="__none__">-- {t("select_placeholder")} --</SelectItem>
                      {(hotels || []).filter((hotel: any) => hotel.id && hotel.name).map((hotel: any) => (
                        <SelectItem key={hotel.id} value={hotel.id}>{hotel.name}</SelectItem>
                      ))}
                      {(hotels || []).length === 0 && <SelectItem value="__none__" disabled>{t("no_results")}</SelectItem>}
                    </SelectContent>
                  </Select>
                  {selectedHotelId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {(hotels || []).find((hotel: any) => hotel.id === selectedHotelId)?.name}
                    </p>
                  )}
                </div>
                <div className="space-y-2"><Label>{t("room_type")}</Label><Input name="roomType" defaultValue={editingRate?.roomType} required /></div>
                <div className="space-y-2"><Label>{t("price_per_night")}</Label><Input type="number" name="price" defaultValue={editingRate?.pricePerRoomPerNight} required /></div>
              </>
            )}
            {rateType === "guide" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t("guide_name")}</Label><Input name="guideName" defaultValue={editingRate?.guideName} required /></div>
                  <div className="space-y-2"><Label>{t("language")}</Label><Input name="language" defaultValue={editingRate?.language} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t("guide_email")}</Label><Input type="email" name="email" defaultValue={editingRate?.email} /></div>
                  <div className="space-y-2"><Label>{t("guide_phone")}</Label><Input name="phone" defaultValue={editingRate?.phone} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t("guide_age")}</Label><Input type="number" name="age" defaultValue={editingRate?.age ?? ""} /></div>
                  <div className="space-y-2"><Label>{t("price")}</Label><Input type="number" name="price" defaultValue={editingRate?.price} required /></div>
                </div>
                <div className="space-y-2">
                  <Label>{t("guide_photo")}</Label>
                  {guidePhotoUrl && (
                    <div className="flex items-center gap-3">
                      <img
                        src={getFullImageUrl(guidePhotoUrl)}
                        alt=""
                        className="h-16 w-16 rounded-full object-cover border shadow-sm"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                        data-testid="img-guide-photo-preview"
                      />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setGuidePhotoUrl(null)} data-testid="button-remove-guide-photo">
                        {t("remove_photo")}
                      </Button>
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    disabled={isUploadingPhoto}
                    onChange={handleGuidePhotoUpload}
                    data-testid="input-guide-photo-file"
                  />
                  {isUploadingPhoto && <p className="text-xs text-muted-foreground">{t("uploading")}</p>}
                </div>
              </>
            )}
            {rateType === "sights" && (
              <>
                <div className="space-y-2">
                  <Label>{t("attraction_name")}</Label>
                  <Select value={selectedAttraction} onValueChange={setSelectedAttraction} required>
                    <SelectTrigger data-testid="select-attraction-name">
                      <SelectValue placeholder={t("select_attraction")} />
                    </SelectTrigger>
                    <SelectContent>
                      {attractionOptions.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("no_sights_in_catalog")}</div>
                      )}
                      {attractionOptions.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{t("ticket_type_label")}</Label><Input name="ticketType" defaultValue={editingRate?.ticketType} required /></div>
                <div className="space-y-2"><Label>{t("price")}</Label><Input type="number" name="price" defaultValue={editingRate?.pricePerPerson} required /></div>
              </>
            )}
            {rateType === "airline" && (
              <>
                <div className="space-y-2">
                  <Label>{t("airline_name")}</Label>
                  <Select value={selectedAirline} onValueChange={setSelectedAirline} required>
                    <SelectTrigger data-testid="select-airline-name">
                      <SelectValue placeholder={t("select_airline")} />
                    </SelectTrigger>
                    <SelectContent>
                      {airlineOptions.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("no_airlines_in_catalog")}</div>
                      )}
                      {airlineOptions.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t("route_from")}</Label><Input name="routeFrom" defaultValue={editingRate?.routeFrom} required /></div>
                  <div className="space-y-2"><Label>{t("route_to")}</Label><Input name="routeTo" defaultValue={editingRate?.routeTo} required /></div>
                </div>
                <div className="space-y-2"><Label>{t("price")}</Label><Input type="number" name="price" defaultValue={editingRate?.price} required /></div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("valid_from_label")}</Label><Input type="date" name="validFrom" defaultValue={editingRate?.validFrom?.split("T")[0] || format(new Date(), "yyyy-MM-dd")} required /></div>
              <div className="space-y-2"><Label>{t("valid_to_label")}</Label><Input type="date" name="validTo" defaultValue={editingRate?.validTo?.split("T")[0]} required /></div>
            </div>
            </div>
            <DialogFooter className="shrink-0 pt-4">
              <Button type="button" variant="outline" onClick={() => setRateDialogOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={saveRate.isPending}>
                {saveRate.isPending ? t("saving_ellipsis") : t("save_rate_button")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function SupplierNotifications() {
  const { t } = useLanguage();
  const { data: notifications, isLoading } = useQuery<any[]>({ queryKey: ["/api/notifications"] });
  const { toast } = useToast();

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const unread = notifications?.filter(n => !n.read) || [];
  if (unread.length === 0) return null;

  return (
    <div className="space-y-3">
      {unread.map((n) => (
        <motion.div key={n.id} initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
          <div className="flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-lg shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full">
                <Bell className="h-4 w-4 text-primary animate-bounce" />
              </div>
              <div>
                <p className="text-sm font-bold">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.message}</p>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)}>{t("dismiss_button")}</Button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
