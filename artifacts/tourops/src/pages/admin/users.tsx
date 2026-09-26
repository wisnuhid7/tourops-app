import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Users, Search, Shield, Plus, KeyRound, MapPin, Pencil, Trash2, UserX, UserCheck } from "lucide-react";
import { USER_ROLES } from "@/lib/constants";
import type { UserProfile, City } from "@workspace/db";
import type { User } from "@workspace/db";

interface EditUserForm {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  phone: string;
  companyName: string;
  countryCode: string;
  cityId: string;
  isActive: boolean;
  isTourLeader: boolean;
}

const emptyEditForm: EditUserForm = {
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  role: "customer",
  phone: "",
  companyName: "",
  countryCode: "",
  cityId: "",
  isActive: true,
  isTourLeader: false,
};

export default function AdminUsers() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<(UserProfile & { user?: User }) | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>(emptyEditForm);

  // Delete User Confirmation Modal State
  const [deletingUser, setDeletingUser] = useState<(UserProfile & { user?: User }) | null>(null);

  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    email: "",
    role: "customer",
    phone: "",
    companyName: "",
    countryCode: "",
    cityId: "",
  });

  const { data: currentUserProfile } = useQuery<UserProfile>({ queryKey: ["/api/user-profile"] });
  const isAdmin = currentUserProfile?.role === "admin" || currentUserProfile?.role === "super_admin";

  const { data: profiles, isLoading } = useQuery<(UserProfile & { user?: User })[]>({ queryKey: ["/api/user-profiles"] });
  const { data: cities } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });

  const isProtectedUser = (profile: UserProfile & { user?: User }) => {
    // Cannot delete or disable own logged-in account
    if (profile.userId === currentUserProfile?.userId) return true;
    // Cannot delete or disable primary super administrator
    if (profile.user?.username === "superadmin1" || profile.userId === "user-super_admin-1") return true;
    return false;
  };

  const updateRole = useMutation({
    mutationFn: ({ profileId, role }: { profileId: string; role: string }) =>
      apiRequest("PATCH", `/api/user-profiles/${profileId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profiles"] });
      toast({ title: t("role_updated") });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const updateCity = useMutation({
    mutationFn: ({ profileId, cityId }: { profileId: string; cityId: string | null }) =>
      apiRequest("PATCH", `/api/user-profiles/${profileId}`, { cityId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profiles"] });
      toast({ title: t("city_updated") });
    },
    onError: (err: any) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ profileId, isActive }: { profileId: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/user-profiles/${profileId}`, { isActive }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profiles"] });
      toast({ title: vars.isActive ? "User activated" : "User disabled" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update user status", description: err.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: Record<string, any> }) =>
      apiRequest("PATCH", `/api/admin/users/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profiles"] });
      toast({ title: "User updated successfully" });
      setEditingUser(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update user", description: err.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => apiRequest("DELETE", `/api/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profiles"] });
      toast({ title: "User deleted successfully" });
      setDeletingUser(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete user", description: err.message, variant: "destructive" });
    },
  });

  const createUser = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/users", { ...newUser, cityId: newUser.cityId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profiles"] });
      toast({ title: t("user_created_successfully") });
      setCreateOpen(false);
      setNewUser({ username: "", password: "", firstName: "", lastName: "", email: "", role: "customer", phone: "", companyName: "", countryCode: "", cityId: "" });
    },
    onError: (err: any) => {
      toast({ title: t("failed_to_create_user"), description: err.message, variant: "destructive" });
    },
  });

  const resetPassword = useMutation({
    mutationFn: (userId: string) => apiRequest("PATCH", `/api/admin/users/${userId}/password`, { password: newPassword }),
    onSuccess: () => {
      toast({ title: t("password_reset_successfully") });
      setResetOpen(null);
      setNewPassword("");
    },
    onError: (err: any) => {
      toast({ title: t("failed_to_reset_password"), description: err.message, variant: "destructive" });
    },
  });

  const handleOpenEdit = (profile: UserProfile & { user?: User }) => {
    setEditingUser(profile);
    setEditForm({
      firstName: profile.user?.firstName || "",
      lastName: profile.user?.lastName || "",
      username: profile.user?.username || "",
      email: profile.user?.email || "",
      role: profile.role || "customer",
      phone: profile.phone || "",
      companyName: profile.companyName || "",
      countryCode: profile.countryCode || "",
      cityId: profile.cityId || "",
      isActive: profile.isActive ?? true,
      isTourLeader: profile.isTourLeader ?? false,
    });
  };

  const filtered = (profiles || []).filter((p: any) =>
    !search ||
    p.userId.toLowerCase().includes(search.toLowerCase()) ||
    (p.companyName || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.role || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.user?.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.user?.firstName || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.user?.lastName || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.user?.username || "").toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif">{t("users_roles")}</h1>
          <p className="text-muted-foreground text-sm">{t("manage_user_accounts_desc")}</p>
        </div>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-user"><Plus className="h-4 w-4 mr-2" />{t("create_user")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t("create_new_user")}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cu-username">{t("username")} *</Label>
                    <Input id="cu-username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required data-testid="input-create-username" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cu-password">{t("password")} *</Label>
                    <Input id="cu-password" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required data-testid="input-create-password" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cu-firstName">{t("first_name")} *</Label>
                    <Input id="cu-firstName" value={newUser.firstName} onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })} required data-testid="input-create-firstname" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cu-lastName">{t("last_name")}</Label>
                    <Input id="cu-lastName" value={newUser.lastName} onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })} data-testid="input-create-lastname" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cu-email">{t("email")}</Label>
                  <Input id="cu-email" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} data-testid="input-create-email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cu-role">{t("role")} *</Label>
                  <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                    <SelectTrigger data-testid="select-create-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(USER_ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {newUser.role === "city_manager" && (
                  <div className="space-y-2">
                    <Label htmlFor="cu-city">{t("city") || "Assigned City"}</Label>
                    <Select value={newUser.cityId || "none"} onValueChange={(v) => setNewUser({ ...newUser, cityId: v === "none" ? "" : v })}>
                      <SelectTrigger id="cu-city" data-testid="select-create-city"><SelectValue placeholder="Select a city to assign..." /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        <SelectItem value="none">— Select a city —</SelectItem>
                        {cities?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cu-phone">{t("phone")}</Label>
                    <Input id="cu-phone" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} data-testid="input-create-phone" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cu-company">{t("company")}</Label>
                    <Input id="cu-company" value={newUser.companyName} onChange={(e) => setNewUser({ ...newUser, companyName: e.target.value })} data-testid="input-create-company" />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createUser.isPending} data-testid="button-submit-create-user">
                  {createUser.isPending ? t("creating") : t("create_user")}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("search_users_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-users" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-16"><Users className="h-12 w-12 text-muted-foreground/40 mb-4" /><h3 className="font-semibold mb-1">{t("no_users_found")}</h3></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((profile) => {
            const isProtected = isProtectedUser(profile);
            const isAccountDisabled = profile.isActive === false;

            return (
              <Card
                key={profile.id}
                className={isAccountDisabled ? "border-dashed opacity-80 bg-slate-50/50 dark:bg-slate-900/30" : ""}
                data-testid={`card-user-${profile.id}`}
              >
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isAccountDisabled ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"}`}>
                      {isAccountDisabled ? <UserX className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm" data-testid={`text-user-name-${profile.id}`}>
                          {profile.user?.firstName && profile.user?.lastName
                            ? `${profile.user.firstName} ${profile.user.lastName}`
                            : profile.companyName || profile.userId}
                        </p>
                        {isAccountDisabled ? (
                          <Badge variant="destructive" className="text-[10px] uppercase font-bold py-0 h-4">
                            Disabled
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] uppercase font-bold py-0 h-4">
                            Active
                          </Badge>
                        )}
                        {profile.isTourLeader && <Badge variant="outline" className="text-[10px] py-0 h-4">{t("tour_leader")}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {profile.user?.username ? `@${profile.user.username}` : ""}
                        {profile.user?.email ? ` | ${profile.user.email}` : ""}
                        {profile.phone ? ` | ${profile.phone}` : ""}
                        {profile.countryCode ? ` | ${profile.countryCode}` : ""}
                        {profile.cityId && cities?.find((c) => c.id === profile.cityId) ? ` | City: ${cities.find((c) => c.id === profile.cityId)?.name}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Quick City assign for city_manager */}
                    {profile.role === "city_manager" && (
                      <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800/80 border rounded-md px-2 py-1">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        <Select
                          value={profile.cityId || "unassigned"}
                          onValueChange={(val) => updateCity.mutate({ profileId: profile.id, cityId: val === "unassigned" ? null : val })}
                          disabled={!isAdmin || updateCity.isPending}
                        >
                          <SelectTrigger className="h-7 w-[140px] text-xs border-0 bg-transparent p-0 focus:ring-0" data-testid={`select-city-${profile.id}`}>
                            <SelectValue placeholder="Assign City..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            <SelectItem value="unassigned">— Unassigned —</SelectItem>
                            {cities?.map((city) => (
                              <SelectItem key={city.id} value={city.id}>
                                {city.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Quick Role Select */}
                    <Select
                      value={profile.role}
                      onValueChange={(v) => updateRole.mutate({ profileId: profile.id, role: v })}
                      disabled={!isAdmin || isProtected}
                    >
                      <SelectTrigger className="w-[160px] h-9 text-xs" data-testid={`select-role-${profile.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(USER_ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {isAdmin && (
                      <>
                        {/* Quick Disable / Enable button */}
                        <Button
                          variant="outline"
                          size="icon"
                          title={isAccountDisabled ? "Activate User" : "Disable User"}
                          className={`h-9 w-9 ${isAccountDisabled ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20" : "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"}`}
                          disabled={isProtected || toggleActiveMutation.isPending}
                          onClick={() => toggleActiveMutation.mutate({ profileId: profile.id, isActive: isAccountDisabled })}
                          data-testid={`button-toggle-active-${profile.id}`}
                        >
                          {isAccountDisabled ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                        </Button>

                        {/* Edit User Modal Button */}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          title={t("edit")}
                          onClick={() => handleOpenEdit(profile)}
                          data-testid={`button-edit-user-${profile.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        {/* Reset Password Button */}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          title={t("reset_password")}
                          onClick={() => { setResetOpen(profile.userId); setNewPassword(""); }}
                          data-testid={`button-reset-password-${profile.id}`}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>

                        {/* Delete User Button */}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-700"
                          title={isProtected ? "Protected account cannot be deleted" : t("delete")}
                          disabled={isProtected || deleteUserMutation.isPending}
                          onClick={() => setDeletingUser(profile)}
                          data-testid={`button-delete-user-${profile.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit User Modal Popup */}
      <Dialog open={Boolean(editingUser)} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              {t("edit")} User — @{editingUser?.user?.username || editingUser?.userId}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingUser) return;
              updateUserMutation.mutate({
                userId: editingUser.userId,
                data: {
                  ...editForm,
                  cityId: editForm.cityId || null,
                  countryCode: editForm.countryCode || null,
                  phone: editForm.phone || null,
                  companyName: editForm.companyName || null,
                },
              });
            }}
            className="space-y-4 pt-2"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eu-firstname">{t("first_name")} *</Label>
                <Input
                  id="eu-firstname"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-lastname">{t("last_name")}</Label>
                <Input
                  id="eu-lastname"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eu-username">{t("username")} *</Label>
                <Input
                  id="eu-username"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  required
                  minLength={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-email">{t("email")}</Label>
                <Input
                  id="eu-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="eu-role">{t("role")} *</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm({ ...editForm, role: v })}
              >
                <SelectTrigger id="eu-role"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {Object.entries(USER_ROLES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editForm.role === "city_manager" && (
              <div className="space-y-2">
                <Label htmlFor="eu-city">{t("city") || "Assigned City"}</Label>
                <Select
                  value={editForm.cityId || "none"}
                  onValueChange={(v) => setEditForm({ ...editForm, cityId: v === "none" ? "" : v })}
                >
                  <SelectTrigger id="eu-city"><SelectValue placeholder="Select assigned city..." /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {cities?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eu-phone">{t("phone")}</Label>
                <Input
                  id="eu-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eu-company">{t("company")}</Label>
                <Input
                  id="eu-company"
                  value={editForm.companyName}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                />
              </div>
            </div>

            {/* Account Status & Features */}
            <div className="p-3.5 rounded-lg border bg-slate-50 dark:bg-slate-900/50 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="eu-active" className="font-semibold text-sm cursor-pointer flex items-center gap-1.5">
                    {editForm.isActive ? <UserCheck className="h-4 w-4 text-emerald-600" /> : <UserX className="h-4 w-4 text-red-500" />}
                    Account Status: {editForm.isActive ? "Active" : "Disabled"}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {editForm.isActive
                      ? "User is active and allowed to log in."
                      : "User is disabled and will be rejected from logging in."}
                  </p>
                </div>
                <Switch
                  id="eu-active"
                  checked={editForm.isActive}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, isActive: checked })}
                />
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t">
                <div>
                  <Label htmlFor="eu-tourleader" className="font-medium text-sm cursor-pointer">
                    Tour Leader Capability
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Allow assigning this user as a tour leader for trip departures.
                  </p>
                </div>
                <Switch
                  id="eu-tourleader"
                  checked={editForm.isTourLeader}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, isTourLeader: checked })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? t("saving_ellipsis") : t("save")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Modal */}
      <AlertDialog open={Boolean(deletingUser)} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              {t("confirm_delete") || "Delete User"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 pt-2 text-sm">
              <span>
                Are you sure you want to permanently delete user account{" "}
                <strong className="text-foreground">
                  @{deletingUser?.user?.username || deletingUser?.userId}
                </strong>
                {deletingUser?.user?.firstName ? ` (${deletingUser.user.firstName} ${deletingUser.user.lastName || ""})` : ""}?
              </span>
              <span className="block text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-2 rounded border border-red-200 dark:border-red-900 mt-2">
                ⚠️ All associated user profiles, credentials, and authentication sessions will be permanently deleted. This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteUserMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!deletingUser) return;
                deleteUserMutation.mutate(deletingUser.userId);
              }}
            >
              {deleteUserMutation.isPending ? t("deleting_ellipsis") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Password Reset Modal */}
      {isAdmin && (
        <Dialog open={Boolean(resetOpen)} onOpenChange={(open) => { if (!open) setResetOpen(null); setNewPassword(""); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("reset_password")}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); if (newPassword.length < 4 || !resetOpen) return; resetPassword.mutate(resetOpen); }} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("reset_password_for")} user ID: {resetOpen}
              </p>
              <div className="space-y-2">
                <Label htmlFor="rp-password">{t("new_password")}</Label>
                <Input id="rp-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={4} data-testid="input-reset-password" />
              </div>
              <Button type="submit" className="w-full" disabled={resetPassword.isPending} data-testid="button-submit-reset-password">
                {resetPassword.isPending ? t("resetting") : t("reset_password")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
