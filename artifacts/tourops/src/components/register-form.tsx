import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { UserPlus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RegisterFormProps {
  onShowLogin?: () => void;
}

export function RegisterForm({ onShowLogin }: RegisterFormProps) {
  const { t } = useLanguage();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountType, setAccountType] = useState("individual");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { refetch } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("passwords_do_not_match"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password, firstName, lastName: lastName || undefined, email: email || undefined, accountType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("registration_failed"));
        return;
      }
      await refetch();
      const searchParams = new URLSearchParams(window.location.search);
      const redirectParam = searchParams.get("redirect");
      if (redirectParam && redirectParam.startsWith("/")) {
        window.location.href = redirectParam;
        return;
      }
      window.location.href = "/";
    } catch {
      setError(t("network_error_try_again"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-8 space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <UserPlus className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-1">{t("create_your_account")}</h2>
          <p className="text-sm text-muted-foreground">{t("join_tourops_subtitle")}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="reg-firstName">{t("first_name")} <span className="text-destructive">*</span></Label>
              <Input
                id="reg-firstName"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-lastName">{t("last_name")}</Label>
              <Input
                id="reg-lastName"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-username">{t("username")} <span className="text-destructive">*</span></Label>
            <Input
              id="reg-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="janedoe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-email">{t("email")} <span className="text-muted-foreground text-xs">{t("optional_label")}</span></Label>
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-account-type">{t("account_type")}</Label>
            <Select value={accountType} onValueChange={setAccountType}>
              <SelectTrigger id="reg-account-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="individual">{t("account_type_individual")}</SelectItem>
                <SelectItem value="family_organizer">{t("account_type_family_organizer")}</SelectItem>
                <SelectItem value="group_organizer">{t("account_type_group_organizer")}</SelectItem>
                <SelectItem value="tour_leader">{t("account_type_tour_leader")}</SelectItem>
                <SelectItem value="organization">{t("account_type_organization")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-password">{t("password")} <span className="text-destructive">*</span></Label>
            <Input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={t("min_characters_placeholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-confirm-password">{t("confirm_password_label")} <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Input
                id="reg-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder={t("reenter_password_placeholder")}
                className={confirmPassword && password === confirmPassword ? "pr-10 border-green-500" : ""}
              />
              {confirmPassword && password === confirmPassword && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
              )}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
            {t("create_account_button")}
          </Button>
        </form>
        <div className="text-center text-sm">
          <span className="text-muted-foreground">{t("already_have_account")} </span>
          <button
            type="button"
            className="text-primary hover:underline font-medium"
            onClick={onShowLogin}
          >
            {t("sign_in")}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
