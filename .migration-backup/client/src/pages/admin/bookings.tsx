import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";
import { Search, BookOpen, Filter, ArrowRight, Users, Calendar, MapPin, CheckSquare, Square, Plus, Trash2 } from "lucide-react";
import { BOOKING_TYPES, BOOKING_STATUSES, FULFILLMENT_STATUSES } from "@/lib/constants";
import type { Booking, UserProfile } from "@shared/schema";
import * as XLSX from "xlsx";
import { Download, Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function AdminBookings() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedTourId, setSelectedTourId] = useState("");
  const [selectedDepartureId, setSelectedDepartureId] = useState("");
  const [bookingType, setBookingType] = useState("join_public_group");
  const [groupName, setGroupName] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [notes, setNotes] = useState("");

  const { data: currentUserProfile } = useQuery<UserProfile>({ queryKey: ["/api/user-profile"] });
  const isAdmin = currentUserProfile?.role === "admin" || currentUserProfile?.role === "super_admin";

  const { data: bookings, isLoading } = useQuery<Booking[]>({ queryKey: ["/api/bookings"] });

  const { data: profiles } = useQuery<any[]>({
    queryKey: ["/api/user-profiles"],
    enabled: isCreateOpen,
  });

  const { data: tours } = useQuery<any[]>({
    queryKey: ["/api/tours"],
    enabled: isCreateOpen,
  });

  const { data: departures } = useQuery<any[]>({
    queryKey: ["/api/tours", selectedTourId, "departures"],
    enabled: isCreateOpen && !!selectedTourId,
  });

  const customers = profiles?.filter(p => p.role === "customer") || [];

  const createBookingMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/bookings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      setIsCreateOpen(false);
      toast({ title: t("success"), description: t("booking_created") });
      // Reset form fields
      setSelectedCustomerId("");
      setSelectedTourId("");
      setSelectedDepartureId("");
      setBookingType("join_public_group");
      setGroupName("");
      setPartySize(1);
      setNotes("");
    },
    onError: (err: any) => {
      toast({ title: t("error_creating_booking"), description: err.message || t("something_went_wrong"), variant: "destructive" });
    }
  });

  const handleCreateBooking = () => {
    if (!selectedCustomerId) {
      toast({ title: t("validation_error"), description: t("please_select_customer"), variant: "destructive" });
      return;
    }
    if (!selectedTourId) {
      toast({ title: t("validation_error"), description: t("please_select_tour"), variant: "destructive" });
      return;
    }
    if (!selectedDepartureId) {
      toast({ title: t("validation_error"), description: t("please_select_departure"), variant: "destructive" });
      return;
    }

    const tour = tours?.find(t => t.id === selectedTourId);
    const dep = departures?.find(d => d.id === selectedDepartureId);
    const pricePerPerson = dep?.pricePerPerson || parseInt(tour?.basePrice || "0");
    const totalPrice = pricePerPerson * partySize;

    createBookingMutation.mutate({
      customerId: selectedCustomerId,
      tourId: selectedTourId,
      departureId: selectedDepartureId,
      bookingType,
      groupName: bookingType === "leader_group" ? groupName : undefined,
      partySizeExpected: partySize,
      notes,
      totalPrice,
    });
  };

  const filtered = (bookings || []).filter((b) => {
    const matchSearch = !search || 
      (b.bookingCode || "").toLowerCase().includes(search.toLowerCase()) || 
      (b.groupName || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    const matchType = typeFilter === "all" || b.bookingType === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const deleteBookingMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/bookings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: t("booking_deleted") });
    },
    onError: () => toast({ title: t("failed_to_delete_booking"), variant: "destructive" }),
  });

  const bulkInitMutation = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/bookings/bulk-initialize", { bookingIds: ids }),
    onSuccess: (res) => {
      res.json().then(data => {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
        setSelectedIds([]);
        toast({ title: t("success"), description: `${t("initialized_workflows_prefix")} ${data.initialized} ${t("initialized_workflows_suffix")}` });
      });
    },
    onError: () => toast({ title: t("bulk_operation_failed"), variant: "destructive" }),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(b => b.id));
    }
  };

  const handleExport = () => {
    const data = (selectedIds.length > 0 ? filtered.filter(b => selectedIds.includes(b.id)) : filtered).map((b) => ({
      "Booking Code": b.bookingCode,
      "Type": BOOKING_TYPES[b.bookingType],
      "Status": BOOKING_STATUSES[b.status || "submitted"],
      "Fulfillment": FULFILLMENT_STATUSES[b.fulfillmentStatus || "pending"],
      "Group Name": b.groupName || "-",
      "Party Size": b.partySizeExpected,
      "Total Price": b.totalPrice || 0,
      "Created At": b.createdAt ? new Date(b.createdAt).toLocaleString() : "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bookings");
    XLSX.writeFile(wb, `bookings_report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif">{t("bookings")}</h1>
          <p className="text-muted-foreground text-sm">{t("manage_all_bookings")}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" data-testid="button-create-booking">
                <Plus className="h-4 w-4 mr-2" />
                {t("create_booking")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t("create_new_booking")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Customer Selection */}
                <div className="space-y-2">
                  <Label>{t("customer")}</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger data-testid="select-create-customer">
                      <SelectValue placeholder={t("select_customer_placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.userId} value={c.userId}>
                          {c.user?.firstName ? `${c.user.firstName} ${c.user.lastName || ""}` : c.user?.username} (@{c.user?.username})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tour Selection */}
                <div className="space-y-2">
                  <Label>{t("tour")}</Label>
                  <Select value={selectedTourId} onValueChange={(val) => { setSelectedTourId(val); setSelectedDepartureId(""); }}>
                    <SelectTrigger data-testid="select-create-tour">
                      <SelectValue placeholder={t("select_tour_placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {tours?.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Departure Selection */}
                <div className="space-y-2">
                  <Label>{t("departure_date")}</Label>
                  <Select
                    value={selectedDepartureId}
                    onValueChange={setSelectedDepartureId}
                    disabled={!selectedTourId}
                  >
                    <SelectTrigger data-testid="select-create-departure">
                      <SelectValue placeholder={selectedTourId ? t("select_departure_placeholder") : t("select_tour_first")} />
                    </SelectTrigger>
                    <SelectContent>
                      {departures?.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.startDate} to {d.endDate} ({d.pricePerPerson ? `$${d.pricePerPerson}` : t("base_price")} / person)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Booking Type */}
                <div className="space-y-2">
                  <Label>{t("booking_type")}</Label>
                  <Select value={bookingType} onValueChange={setBookingType}>
                    <SelectTrigger data-testid="select-create-booking-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="join_public_group">{t("join_public_group")}</SelectItem>
                      <SelectItem value="leader_group">{t("create_leader_group")}</SelectItem>
                      <SelectItem value="private_family">{t("private_family")}</SelectItem>
                      <SelectItem value="custom_leader">{t("custom_leader")}</SelectItem>
                      <SelectItem value="custom_family">{t("custom_family")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Group Name (Conditional) */}
                {bookingType === "leader_group" && (
                  <div className="space-y-2">
                    <Label>{t("group_name")}</Label>
                    <Input
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder={t("my_travel_group_placeholder")}
                      data-testid="input-create-group-name"
                    />
                  </div>
                )}

                {/* Party Size */}
                <div className="space-y-2">
                  <Label>{t("party_size")}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={partySize}
                    onChange={(e) => setPartySize(parseInt(e.target.value) || 1)}
                    data-testid="input-create-party-size"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>{t("notes_optional")}</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("special_requests_placeholder")}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  {t("cancel")}
                </Button>
                <Button
                  onClick={handleCreateBooking}
                  disabled={createBookingMutation.isPending}
                  data-testid="button-submit-create-booking"
                >
                  {createBookingMutation.isPending ? t("creating") : t("create_booking")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
          {selectedIds.length > 0 && (
            <Button
              variant="default"
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-600/20"
              onClick={() => bulkInitMutation.mutate(selectedIds)}
              disabled={bulkInitMutation.isPending}
            >
              <Zap className="h-4 w-4 mr-2" />
              {bulkInitMutation.isPending ? t("initializing") : `${t("initialize_prefix")} ${selectedIds.length} ${t("workflows_suffix")}`}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            {selectedIds.length > 0 ? `${t("export_selected")} (${selectedIds.length})` : t("export_all")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex items-center gap-2 mr-2">
          <Checkbox 
            checked={selectedIds.length === filtered.length && filtered.length > 0} 
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("select_all")}</span>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("search_by_code_or_name")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-bookings" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_status")}</SelectItem>
            {Object.entries(BOOKING_STATUSES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
            <SelectValue placeholder={t("type_label")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_types")}</SelectItem>
            {Object.entries(BOOKING_TYPES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold mb-1">{t("no_bookings_found")}</h3>
            <p className="text-sm text-muted-foreground">{t("adjust_filters_or_wait")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((booking) => (
            <div key={booking.id} className="flex items-center gap-3">
              <Checkbox 
                checked={selectedIds.includes(booking.id)} 
                onCheckedChange={() => toggleSelect(booking.id)}
              />
              <Link href={`/admin/bookings/${booking.id}`} className="flex-1">
                <Card className={`hover-elevate cursor-pointer transition-all ${selectedIds.includes(booking.id) ? 'border-primary bg-primary/5 shadow-md' : ''}`} data-testid={`card-booking-${booking.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{booking.bookingCode}</span>
                          <Badge variant="outline" className="text-xs">{BOOKING_TYPES[booking.bookingType]}</Badge>
                        </div>
                        {booking.groupName && <p className="text-sm text-muted-foreground">{booking.groupName}</p>}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{booking.partySizeExpected} {t("travelers_suffix")}</span>
                          {booking.createdAt && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(booking.createdAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={booking.status === "confirmed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"}>
                          {BOOKING_STATUSES[booking.status || "submitted"]}
                        </Badge>
                        <Badge variant={booking.fulfillmentStatus === "completed" ? "default" : booking.fulfillmentStatus === "blocked" ? "destructive" : "outline"}>
                          {FULFILLMENT_STATUSES[booking.fulfillmentStatus || "pending"]}
                        </Badge>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteBookingMutation.mutate(booking.id); }}
                            disabled={deleteBookingMutation.isPending}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
