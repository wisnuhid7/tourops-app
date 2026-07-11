import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Users, Search, Shield, Plus, KeyRound } from "lucide-react";
import { USER_ROLES } from "@/lib/constants";
import type { UserProfile } from "@workspace/db";
import type { User } from "@workspace/db";

export default function AdminUsers() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ username: "", password: "", firstName: "", lastName: "", email: "", role: "customer", phone: "", companyName: "", countryCode: "" });
  const [newPassword, setNewPassword] = useState("");

  const { data: currentUserProfile } = useQuery<UserProfile>({ queryKey: ["/api/user-profile"] });
  const isAdmin = currentUserProfile?.role === "admin" || currentUserProfile?.role === "super_admin";

  const { data: profiles, isLoading } = useQuery<(UserProfile & { user?: User })[]>({ queryKey: ["/api/user-profiles"] });

  const updateRole = useMutation({
    mutationFn: ({ profileId, role }: { profileId: string; role: string }) =>
      apiRequest("PATCH", `/api/user-profiles/${profileId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profiles"] });
      toast({ title: t("role_updated") });
    },
  });

  const createUser = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/users", newUser),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profiles"] });
      toast({ title: t("user_created_successfully") });
      setCreateOpen(false);
      setNewUser({ username: "", password: "", firstName: "", lastName: "", email: "", role: "customer", phone: "", companyName: "", countryCode: "" });
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

  const filtered = (profiles || []).filter((p: any) =>
    !search || p.userId.toLowerCase().includes(search.toLowerCase()) ||
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
            <DialogContent>
            <DialogHeader><DialogTitle>{t("create_new_user")}</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cu-username">{t("username")}</Label>
                  <Input id="cu-username" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required data-testid="input-create-username" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cu-password">{t("password")}</Label>
                  <Input id="cu-password" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required data-testid="input-create-password" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cu-firstName">{t("first_name")}</Label>
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
                <Label htmlFor="cu-role">{t("role")}</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger data-testid="select-create-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(USER_ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
          {filtered.map((profile) => (
            <Card key={profile.id} data-testid={`card-user-${profile.id}`}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm" data-testid={`text-user-name-${profile.id}`}>
                      {profile.user?.firstName && profile.user?.lastName
                        ? `${profile.user.firstName} ${profile.user.lastName}`
                        : profile.companyName || profile.userId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {profile.user?.username ? `@${profile.user.username}` : ""}
                      {profile.user?.email ? ` | ${profile.user.email}` : ""}
                      {profile.phone ? ` | ${profile.phone}` : ""}
                      {profile.countryCode ? ` | ${profile.countryCode}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {profile.isTourLeader && <Badge variant="outline">{t("tour_leader")}</Badge>}
                  <Select
                    value={profile.role}
                    onValueChange={(v) => updateRole.mutate({ profileId: profile.id, role: v })}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger className="w-[180px]" data-testid={`select-role-${profile.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(USER_ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {isAdmin && (
                    <Dialog open={resetOpen === profile.userId} onOpenChange={(open) => { setResetOpen(open ? profile.userId : null); setNewPassword(""); }}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="icon" data-testid={`button-reset-password-${profile.id}`}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>{t("reset_password")}</DialogTitle></DialogHeader>
                        <form onSubmit={(e) => { e.preventDefault(); if (newPassword.length < 4) return; resetPassword.mutate(profile.userId); }} className="space-y-4">
                          <p className="text-sm text-muted-foreground">
                            {t("reset_password_for")} {profile.user?.firstName || profile.user?.username || profile.userId}
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
