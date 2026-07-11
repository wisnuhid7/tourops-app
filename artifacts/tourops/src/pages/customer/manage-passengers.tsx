import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Users, Trash2, Edit, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { Booking, Traveler } from "@workspace/db";
import { useLanguage } from "@/hooks/use-language";

export default function ManagePassengers() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: bookings, isLoading: loadingBookings } = useQuery<Booking[]>({ queryKey: ["/api/my-bookings"] });
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [expandedBookings, setExpandedBookings] = useState<Set<string>>(new Set());

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForBookingId, setAddForBookingId] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTraveler, setEditTraveler] = useState<Traveler | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [nationality, setNationality] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");

  const clearForm = () => {
    setFirstName(""); setLastName(""); setDob(""); setGender("");
    setNationality(""); setPassportNumber(""); setPassportExpiry("");
  };

  const openAddDialog = (bookingId: string) => {
    setAddForBookingId(bookingId);
    clearForm();
    setAddDialogOpen(true);
  };

  const openEditDialog = (traveler: Traveler) => {
    setEditTraveler(traveler);
    setFirstName(traveler.firstName);
    setLastName(traveler.lastName);
    setDob(traveler.dob || "");
    setGender(traveler.gender || "");
    setNationality(traveler.nationality || "");
    setPassportNumber(traveler.passportNumber || "");
    setPassportExpiry(traveler.passportExpiry || "");
    setEditDialogOpen(true);
  };

  const toggleBooking = (id: string) => {
    setExpandedBookings(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addTraveler = useMutation({
    mutationFn: (data: { bookingId: string; body: any }) =>
      apiRequest("POST", `/api/bookings/${data.bookingId}/travelers`, data.body),  // POST already has ownership check
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/my-bookings/${variables.bookingId}/travelers`] });
      setAddDialogOpen(false);
      clearForm();
      toast({ title: t("passenger_added_successfully") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateTraveler = useMutation({
    mutationFn: (data: { id: string; body: any }) =>
      apiRequest("PATCH", `/api/my-travelers/${data.id}`, data.body),
    onSuccess: () => {
      if (editTraveler) {
        queryClient.invalidateQueries({ queryKey: [`/api/my-bookings/${editTraveler.bookingId}/travelers`] });
      }
      setEditDialogOpen(false);
      setEditTraveler(null);
      clearForm();
      toast({ title: t("passenger_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteTraveler = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/my-travelers/${id}`),
    onSuccess: () => {
      bookings?.forEach(b => {
        queryClient.invalidateQueries({ queryKey: [`/api/my-bookings/${b.id}/travelers`] });
      });
      toast({ title: t("passenger_removed") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleAddSubmit = () => {
    if (!addForBookingId || !firstName.trim() || !lastName.trim()) {
      toast({ title: t("first_last_name_required"), variant: "destructive" });
      return;
    }
    addTraveler.mutate({
      bookingId: addForBookingId,
      body: {
        bookingId: addForBookingId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dob: dob || undefined,
        gender: gender || undefined,
        nationality: nationality || undefined,
        passportNumber: passportNumber || undefined,
        passportExpiry: passportExpiry || undefined,
      },
    });
  };

  const handleEditSubmit = () => {
    if (!editTraveler || !firstName.trim() || !lastName.trim()) {
      toast({ title: t("first_last_name_required"), variant: "destructive" });
      return;
    }
    updateTraveler.mutate({
      id: editTraveler.id,
      body: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dob: dob || undefined,
        gender: gender || undefined,
        nationality: nationality || undefined,
        passportNumber: passportNumber || undefined,
        passportExpiry: passportExpiry || undefined,
      },
    });
  };

  if (loadingBookings) {
    return <div className="p-6 space-y-4"><Skeleton className="h-12" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
  }

  const activeBookings = bookings?.filter(b => b.status !== "cancelled") || [];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-manage-passengers-title">{t("manage_passengers")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("manage_passengers_subtitle")}</p>
      </div>

      {activeBookings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">{t("no_bookings_yet")}</h3>
            <p className="text-muted-foreground text-sm mt-1">{t("once_booking_created_note")}</p>
          </CardContent>
        </Card>
      ) : (
        activeBookings.map((booking) => (
          <BookingPassengerCard
            key={booking.id}
            booking={booking}
            expanded={expandedBookings.has(booking.id)}
            onToggle={() => toggleBooking(booking.id)}
            onAddPassenger={() => openAddDialog(booking.id)}
            onEditPassenger={openEditDialog}
            onDeletePassenger={(id) => deleteTraveler.mutate(id)}
          />
        ))
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("add_new_passenger")}</DialogTitle></DialogHeader>
          <PassengerForm
            firstName={firstName} setFirstName={setFirstName}
            lastName={lastName} setLastName={setLastName}
            dob={dob} setDob={setDob}
            gender={gender} setGender={setGender}
            nationality={nationality} setNationality={setNationality}
            passportNumber={passportNumber} setPassportNumber={setPassportNumber}
            passportExpiry={passportExpiry} setPassportExpiry={setPassportExpiry}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add">{t("cancel")}</Button>
            <Button onClick={handleAddSubmit} disabled={addTraveler.isPending} data-testid="button-submit-add-passenger">
              {addTraveler.isPending ? t("adding") : t("add_passenger")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("edit_passenger")}</DialogTitle></DialogHeader>
          <PassengerForm
            firstName={firstName} setFirstName={setFirstName}
            lastName={lastName} setLastName={setLastName}
            dob={dob} setDob={setDob}
            gender={gender} setGender={setGender}
            nationality={nationality} setNationality={setNationality}
            passportNumber={passportNumber} setPassportNumber={setPassportNumber}
            passportExpiry={passportExpiry} setPassportExpiry={setPassportExpiry}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">{t("cancel")}</Button>
            <Button onClick={handleEditSubmit} disabled={updateTraveler.isPending} data-testid="button-submit-edit-passenger">
              {updateTraveler.isPending ? t("saving") : t("save_changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PassengerForm({
  firstName, setFirstName, lastName, setLastName,
  dob, setDob, gender, setGender,
  nationality, setNationality,
  passportNumber, setPassportNumber,
  passportExpiry, setPassportExpiry,
}: {
  firstName: string; setFirstName: (v: string) => void;
  lastName: string; setLastName: (v: string) => void;
  dob: string; setDob: (v: string) => void;
  gender: string; setGender: (v: string) => void;
  nationality: string; setNationality: (v: string) => void;
  passportNumber: string; setPassportNumber: (v: string) => void;
  passportExpiry: string; setPassportExpiry: (v: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("first_name")} *</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-passenger-first-name" /></div>
        <div><Label>{t("last_name")} *</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-passenger-last-name" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("date_of_birth")}</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} data-testid="input-passenger-dob" /></div>
        <div>
          <Label>{t("gender_label")}</Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger data-testid="select-passenger-gender"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="male">{t("male")}</SelectItem>
              <SelectItem value="female">{t("female")}</SelectItem>
              <SelectItem value="other">{t("other")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div><Label>{t("nationality_label")}</Label><Input value={nationality} onChange={(e) => setNationality(e.target.value)} data-testid="input-passenger-nationality" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("passport_number_label")}</Label><Input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} data-testid="input-passenger-passport" /></div>
        <div><Label>{t("passport_expiry_label")}</Label><Input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} data-testid="input-passenger-passport-expiry" /></div>
      </div>
    </div>
  );
}

function BookingPassengerCard({
  booking, expanded, onToggle, onAddPassenger, onEditPassenger, onDeletePassenger,
}: {
  booking: Booking;
  expanded: boolean;
  onToggle: () => void;
  onAddPassenger: () => void;
  onEditPassenger: (t: Traveler) => void;
  onDeletePassenger: (id: string) => void;
}) {
  const { t } = useLanguage();
  const { data: travelers, isLoading } = useQuery<Traveler[]>({
    queryKey: [`/api/my-bookings/${booking.id}/travelers`],
    enabled: expanded,
  });

  return (
    <Card data-testid={`card-booking-passengers-${booking.id}`}>
      <div
        className="p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer hover-elevate"
        onClick={onToggle}
        data-testid={`button-toggle-booking-${booking.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Users className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{booking.bookingCode}</p>
            <p className="text-xs text-muted-foreground truncate">{booking.groupName || booking.bookingType}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{booking.status}</Badge>
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); onAddPassenger(); }}
            data-testid={`button-add-passenger-${booking.id}`}
          >
            <UserPlus className="h-3 w-3 mr-1" />{t("add_passenger")}
          </Button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {isLoading ? (
            <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : !travelers || travelers.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-sm">
              {t("no_passengers_click_add")}
            </div>
          ) : (
            <div className="space-y-2">
              {travelers.map((trav) => (
                <div
                  key={trav.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md border"
                  data-testid={`row-passenger-${trav.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm" data-testid={`text-passenger-name-${trav.id}`}>{trav.firstName} {trav.lastName}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      {trav.gender && <span className="text-xs text-muted-foreground capitalize">{trav.gender}</span>}
                      {trav.nationality && <span className="text-xs text-muted-foreground">{trav.nationality}</span>}
                      {trav.passportNumber && <Badge variant="secondary" className="text-xs">{t("passport_prefix")} {trav.passportNumber}</Badge>}
                      {trav.dob && <span className="text-xs text-muted-foreground">{t("dob_prefix")} {trav.dob}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEditPassenger(trav)}
                      data-testid={`button-edit-passenger-${trav.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDeletePassenger(trav.id)}
                      data-testid={`button-delete-passenger-${trav.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
