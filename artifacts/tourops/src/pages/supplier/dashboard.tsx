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
  DollarSign, ClipboardList, Bell, Plus, Trash2, Pencil
} from "lucide-react";
import { WORKFLOW_STATUSES } from "@/lib/constants";
import type { BookingWorkflow, Booking, UserProfile, Traveler, Document } from "@workspace/db";
import { Link, useSearch } from "wouter";
import { useState, useEffect } from "react";
import { getFullImageUrl } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useLanguage } from "@/hooks/use-language";
import { HotelFormFields, emptyHotelFormValues, hotelToFormValues, hotelFormToPayload, type HotelFormValues } from "@/components/hotel-form-fields";

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

  const { data: workflows, isLoading } = useQuery<(BookingWorkflow & { booking?: Booking })[]>({
    queryKey: ["/api/supplier/workflows"],
  });

  const updateWorkflow = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/workflows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/workflows"] });
      toast({ title: t("workflow_updated") });
    },
  });

  const search = useSearch();
  // Deep-link support: /supplier?tab=guide_rates opens directly on that tab
  // (used by the admin/super_admin "Guides" sidebar link).
  const initialTab = new URLSearchParams(search).get("tab") || "tasks";

  const { data: hotelRates } = useQuery<any[]>({ queryKey: ["/api/rates/hotel"] });
  const canRegisterHotels = profile?.role === "hotel_manager" || profile?.role === "admin" || profile?.role === "super_admin";
  const { data: hotels } = useQuery<any[]>({ queryKey: ["/api/hotels"], enabled: canRegisterHotels });
  const { data: cities } = useQuery<any[]>({ queryKey: ["/api/master/cities"], enabled: canRegisterHotels });

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

  const { data: guideRates } = useQuery<any[]>({ queryKey: ["/api/rates/guide"] });
  const { data: sightsRates } = useQuery<any[]>({ queryKey: ["/api/rates/sights"] });
  const { data: airlineRates } = useQuery<any[]>({ queryKey: ["/api/rates/airline"] });

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

  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [rateType, setRateType] = useState<"hotel" | "guide" | "sights" | "airline">("hotel");
  const [editingRate, setEditingRate] = useState<any>(null);
  const [guidePhotoUrl, setGuidePhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Sync the guide photo with whichever record the rate dialog opens for.
  useEffect(() => {
    if (rateDialogOpen) setGuidePhotoUrl(editingRate?.photoUrl || null);
  }, [rateDialogOpen, editingRate]);

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
    setRateDialogOpen(true);
  };


  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [uploadWorkflowId, setUploadWorkflowId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileUrl, setUploadFileUrl] = useState("");
  const [uploadDocType, setUploadDocType] = useState("voucher");
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const { data: bookingManifest, isLoading: manifestLoading } = useQuery<Booking & { travelers: Traveler[], documents: Document[] }>({
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

      <Tabs defaultValue={initialTab} className="mt-8">
        <TabsList className="mb-6 bg-white/50 backdrop-blur-sm border shadow-sm p-1">
          <TabsTrigger value="tasks" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-md px-6 py-2 transition-all">
            <ClipboardList className="h-4 w-4 mr-2" />
            {t("tasks_tab")}
          </TabsTrigger>
          {(profile?.role === "hotel_manager" || profile?.role === "admin" || profile?.role === "super_admin") && (
            <TabsTrigger value="hotels" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-md px-6 py-2 transition-all">
              <Hotel className="h-4 w-4 mr-2" />
              {t("hotels_catalog")}
            </TabsTrigger>
          )}
          {(profile?.role === "hotel_manager" || profile?.role === "admin" || profile?.role === "super_admin") && (
            <TabsTrigger value="hotel_rates" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-md px-6 py-2 transition-all">
              <Hotel className="h-4 w-4 mr-2" />
              {t("hotel_rates_tab")}
            </TabsTrigger>
          )}
          {(profile?.role === "guide_manager" || profile?.role === "admin" || profile?.role === "super_admin") && (
            <TabsTrigger value="guide_rates" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-md px-6 py-2 transition-all">
              <UserCheck className="h-4 w-4 mr-2" />
              {t("guide_rates_tab")}
            </TabsTrigger>
          )}
          {(profile?.role === "sights_manager" || profile?.role === "admin" || profile?.role === "super_admin") && (
            <TabsTrigger value="sights_rates" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-md px-6 py-2 transition-all">
              <Ticket className="h-4 w-4 mr-2" />
              {t("sights_rates_tab")}
            </TabsTrigger>
          )}
          {(profile?.role === "airline_supplier" || profile?.role === "admin" || profile?.role === "super_admin") && (
            <TabsTrigger value="airline_rates" className="data-[state=active]:bg-primary data-[state=active]:text-white rounded-md px-6 py-2 transition-all">
              <Plane className="h-4 w-4 mr-2" />
              {t("airline_rates_tab")}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="tasks">
          <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold tracking-tight">{t("assigned_workflows")}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="flex -space-x-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-background bg-slate-200" />
              ))}
            </div>
            <span>{workflows?.length || 0} {t("tasks_assigned_suffix")}</span>
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {workflows.map((wf, index) => {
                const Icon = ROLE_CONFIG[wf.serviceType + "_manager"]?.icon || Plane;
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
                          <Badge variant="outline" className={`capitalize font-bold border-none px-2 py-0.5 ${
                            wf.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
                            wf.status === 'blocked' ? 'bg-rose-100 text-rose-700' : 
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {(wf.status || 'pending').replace('_', ' ')}
                          </Badge>
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">
                            BK-{wf.bookingId?.slice(0, 8)}
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
                          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border">
                            <div>
                              <p className="text-muted-foreground font-bold uppercase tracking-tighter mb-0.5">{t("participants_label")}</p>
                              <p className="font-bold flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {wf.booking?.partySizeExpected ?? "-"} {t("pax_suffix")}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground font-bold uppercase tracking-tighter mb-0.5">{t("step_label")}</p>
                              <p className="font-bold truncate">{wf.currentStep || t("awaiting_action_label")}</p>
                            </div>
                          </div>

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
                              className="flex-1 rounded-full shadow-sm"
                              onClick={() => setUploadWorkflowId(wf.id)}
                            >
                              {t("upload_button")}
                            </Button>
                          </div>
                          
                          <div className="pt-2 border-t">
                            <Select
                              value={wf.status || "assigned"}
                              onValueChange={(v) => updateWorkflow.mutate({ id: wf.id, status: v })}
                            >
                              <SelectTrigger className="h-8 text-xs rounded-full border-none bg-slate-100 dark:bg-slate-800">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(WORKFLOW_STATUSES).map(([k, v]) => (
                                  <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("hotel_name")}</TableHead>
                    <TableHead>{t("stars_label")}</TableHead>
                    <TableHead>{t("base_price_label")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hotels?.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell>{h.starRating} ⭐</TableCell>
                      <TableCell>{h.basePrice ? `${h.currency} ${h.basePrice}` : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={h.status === "approved" || h.status === "published" ? "default" : "secondary"} className="capitalize">
                          {h.status === "approved" ? t("approved_status") : h.status === "draft" ? t("pending_approval") : h.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEditHotel(h)} data-testid={`button-edit-hotel-${h.id}`}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteHotelId(h.id)} data-testid={`button-delete-hotel-${h.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!hotels || hotels.length === 0) && (
                    <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">{t("no_hotels_found")}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
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
             <div className="border rounded-md">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>{t("hotel_name")}</TableHead>
                     <TableHead>{t("room_type")}</TableHead>
                     <TableHead>{t("rate_label")}</TableHead>
                     <TableHead>{t("validity_label")}</TableHead>
                     <TableHead>{t("status")}</TableHead>
                     <TableHead className="text-right">{t("actions")}</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {hotelRates?.map(r => (
                     <TableRow key={r.id}>
                       <TableCell className="font-medium">{r.hotelName}</TableCell>
                       <TableCell>{r.roomType}</TableCell>
                       <TableCell>{r.currency} {r.pricePerRoomPerNight}</TableCell>
                       <TableCell>{r.validFrom} to {r.validTo}</TableCell>
                       <TableCell><Badge variant="outline" className="capitalize">{r.status}</Badge></TableCell>
                       <TableCell className="text-right flex justify-end gap-2">
                         <Button variant="ghost" size="icon" onClick={() => openRateDialog("hotel", r)}><Plus className="h-4 w-4 rotate-45" /></Button>
                         <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                           if(confirm(t("confirm_delete_rate"))) deleteRate.mutate({ type: "hotel", id: r.id });
                         }}><Trash2 className="h-4 w-4" /></Button>
                       </TableCell>
                     </TableRow>
                   ))}
                   {(!hotelRates || hotelRates.length === 0) && (
                     <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("no_rates_found_message")}</TableCell></TableRow>
                   )}
                 </TableBody>
               </Table>
             </div>
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
             <div className="border rounded-md">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>{t("guide_name")}</TableHead>
                     <TableHead>{t("language")}</TableHead>
                     <TableHead>{t("rate_label")}</TableHead>
                     <TableHead>{t("validity_label")}</TableHead>
                     <TableHead>{t("status")}</TableHead>
                     <TableHead className="text-right">{t("actions")}</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {guideRates?.map(r => (
                     <TableRow key={r.id}>
                       <TableCell className="font-medium">{r.guideName}</TableCell>
                       <TableCell>{r.language}</TableCell>
                       <TableCell>{r.currency} {r.price}</TableCell>
                       <TableCell>{r.validFrom} to {r.validTo}</TableCell>
                       <TableCell>
                         <div className="flex items-center gap-2">
                           <Switch
                           checked={r.status === "active"}
                           onCheckedChange={(checked) => guideStatusMutation.mutate({ id: r.id, status: checked ? "active" : "draft" })}
                           disabled={guideStatusMutation.isPending || r.status === "archived"}
                           aria-label={t("status")}
                           data-testid={`switch-guide-status-${r.id}`}
                           />
                           <Badge variant="outline" className="capitalize">{r.status}</Badge>
                         </div>
                       </TableCell>
                       <TableCell className="text-right flex justify-end gap-2">
                         <Button variant="ghost" size="icon" onClick={() => openRateDialog("guide", r)} data-testid={`button-edit-guide-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                         <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-guide-${r.id}`} onClick={() => {
                           if(confirm(t("delete_guide_confirm"))) deleteRate.mutate({ type: "guide", id: r.id });
                         }}><Trash2 className="h-4 w-4" /></Button>
                       </TableCell>
                     </TableRow>
                   ))}
                   {(!guideRates || guideRates.length === 0) && (
                     <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("no_rates_found_message")}</TableCell></TableRow>
                   )}
                 </TableBody>
               </Table>
             </div>
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
             <div className="border rounded-md">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>{t("attraction_label")}</TableHead>
                     <TableHead>{t("ticket_type_label")}</TableHead>
                     <TableHead>{t("price")}</TableHead>
                     <TableHead>{t("validity_label")}</TableHead>
                     <TableHead>{t("status")}</TableHead>
                     <TableHead className="text-right">{t("actions")}</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {sightsRates?.map(r => (
                     <TableRow key={r.id}>
                       <TableCell className="font-medium">{r.attractionName}</TableCell>
                       <TableCell>{r.ticketType}</TableCell>
                       <TableCell>{r.currency} {r.pricePerPerson}</TableCell>
                       <TableCell>{r.validFrom} to {r.validTo}</TableCell>
                       <TableCell>
                         <div className="flex items-center gap-2">
                           <Switch
                             checked={r.status === "active"}
                             onCheckedChange={(checked) => sightsStatusMutation.mutate({ id: r.id, status: checked ? "active" : "draft" })}
                             disabled={sightsStatusMutation.isPending || r.status === "archived"}
                             aria-label={t("status")}
                             data-testid={`switch-sights-status-${r.id}`}
                           />
                           <Badge variant="outline" className="capitalize">{r.status}</Badge>
                         </div>
                       </TableCell>
                       <TableCell className="text-right flex justify-end gap-2">
                         <Button variant="ghost" size="icon" onClick={() => openRateDialog("sights", r)} data-testid={`button-edit-sights-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                         <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-sights-${r.id}`} onClick={() => {
                           if(confirm(t("confirm_delete_rate"))) deleteRate.mutate({ type: "sights", id: r.id });
                         }}><Trash2 className="h-4 w-4" /></Button>
                       </TableCell>
                     </TableRow>
                   ))}
                   {(!sightsRates || sightsRates.length === 0) && (
                     <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("no_rates_found_message")}</TableCell></TableRow>
                   )}
                 </TableBody>
               </Table>
             </div>
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
             <div className="border rounded-md">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>{t("airline_label")}</TableHead>
                     <TableHead>{t("route_label")}</TableHead>
                     <TableHead>{t("rate_label")}</TableHead>
                     <TableHead>{t("validity_label")}</TableHead>
                     <TableHead>{t("status")}</TableHead>
                     <TableHead className="text-right">{t("actions")}</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {airlineRates?.map(r => (
                     <TableRow key={r.id}>
                       <TableCell className="font-medium">{r.airlineName}</TableCell>
                       <TableCell>{r.routeFrom} → {r.routeTo}</TableCell>
                       <TableCell>{r.currency} {r.price}</TableCell>
                       <TableCell>{r.validFrom} to {r.validTo}</TableCell>
                       <TableCell><Badge variant="outline" className="capitalize">{r.status}</Badge></TableCell>
                       <TableCell className="text-right flex justify-end gap-2">
                         <Button variant="ghost" size="icon" onClick={() => openRateDialog("airline", r)}><Plus className="h-4 w-4 rotate-45" /></Button>
                         <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                           if(confirm(t("confirm_delete_rate"))) deleteRate.mutate({ type: "airline", id: r.id });
                         }}><Trash2 className="h-4 w-4" /></Button>
                       </TableCell>
                     </TableRow>
                   ))}
                   {(!airlineRates || airlineRates.length === 0) && (
                     <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("no_rates_found_message")}</TableCell></TableRow>
                   )}
                 </TableBody>
               </Table>
             </div>
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
              <Tabs defaultValue="travelers" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="travelers"><Users className="h-4 w-4 mr-2" /> {t("travelers_tab")}</TabsTrigger>
                <TabsTrigger value="documents"><FileCheck className="h-4 w-4 mr-2" /> {t("documents_tab")}</TabsTrigger>
                <TabsTrigger value="messages"><MessageSquare className="h-4 w-4 mr-2" /> {t("messages_tab")}</TabsTrigger>
              </TabsList>

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
                                <a href={d.fileUrl} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
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
                disabled={isUploadingFile}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsUploadingFile(true);
                  try {
                    const formData = new FormData();
                    formData.append("image", file);
                    const res = await fetch("/api/upload", {
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
              data.hotelName = fd.get("hotelName");
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
              data.airlineName = fd.get("airlineName");
              data.routeFrom = fd.get("routeFrom");
              data.routeTo = fd.get("routeTo");
              // price maps to a numeric column -> the insert schema expects a string
              data.price = fd.get("price");
            } else {
              data.attractionName = fd.get("attractionName");
              data.ticketType = fd.get("ticketType");
              // pricePerPerson maps to a numeric column -> the insert schema expects a string
              data.pricePerPerson = fd.get("price");
            }
            saveRate.mutate({ type: rateType, id: editingRate?.id, data });
          }} className="flex flex-col overflow-hidden flex-1">
            <div className="space-y-4 pt-4 overflow-y-auto flex-1 pr-1 -mr-1">
            {rateType === "hotel" && (
              <>
                <div className="space-y-2"><Label>{t("hotel_name")}</Label><Input name="hotelName" defaultValue={editingRate?.hotelName} required /></div>
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
                <div className="space-y-2"><Label>{t("attraction_name")}</Label><Input name="attractionName" defaultValue={editingRate?.attractionName} required /></div>
                <div className="space-y-2"><Label>{t("ticket_type_label")}</Label><Input name="ticketType" defaultValue={editingRate?.ticketType} required /></div>
                <div className="space-y-2"><Label>{t("price")}</Label><Input type="number" name="price" defaultValue={editingRate?.pricePerPerson} required /></div>
              </>
            )}
            {rateType === "airline" && (
              <>
                <div className="space-y-2"><Label>{t("airline_name")}</Label><Input name="airlineName" defaultValue={editingRate?.airlineName} required /></div>
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
