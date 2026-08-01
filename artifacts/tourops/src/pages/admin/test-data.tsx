import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Database, Play, Trash2, CheckCircle2, XCircle, ShieldAlert, Loader2 } from "lucide-react";
import type { UserProfile } from "@workspace/db";
import { useState } from "react";

interface ValidationCheck { name: string; passed: boolean; expected: string; actual: string }
interface SeedReport {
  environmentLabel: string;
  phases: { phase: string; created: number; updated: number; skipped: number; notes?: string[] }[];
  validation: ValidationCheck[];
  passed: boolean;
  accounts: { username: string; password: string; role: string; note?: string }[];
}

export default function AdminTestData() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [report, setReport] = useState<SeedReport | null>(null);
  const [checks, setChecks] = useState<ValidationCheck[] | null>(null);

  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/user-profile"] });
  const isSuperAdmin = profile?.role === "super_admin";

  const { data: status } = useQuery<{ testEnvironment: boolean; latestRun: any }>({
    queryKey: ["/api/test-data/status"],
    enabled: isSuperAdmin,
    retry: false,
  });

  const seed = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/test-data/seed");
      return (await res.json()) as SeedReport;
    },
    onSuccess: (r) => {
      setReport(r); setChecks(r.validation);
      queryClient.invalidateQueries({ queryKey: ["/api/test-data/status"] });
      toast({ title: r.passed ? t("test_seed_success") : t("test_seed_failed_validation"), variant: r.passed ? "default" : "destructive" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const reset = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/test-data/reset")).json(),
    onSuccess: () => {
      setReport(null); setChecks(null);
      queryClient.invalidateQueries({ queryKey: ["/api/test-data/status"] });
      toast({ title: t("test_data_reset_done") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const validate = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/test-data/validate")).json() as Promise<{ passed: boolean; checks: ValidationCheck[] }>,
    onSuccess: (r) => {
      setChecks(r.checks);
      toast({ title: r.passed ? t("validation_passed") : t("validation_failed"), variant: r.passed ? "default" : "destructive" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!isSuperAdmin) {
    return (
      <div className="p-8">
        <Card><CardContent className="p-8 flex items-center gap-3 text-muted-foreground">
          <ShieldAlert className="h-5 w-5" /> {t("test_data_super_admin_only")}
        </CardContent></Card>
      </div>
    );
  }

  const busy = seed.isPending || reset.isPending || validate.isPending;

  return (
    <div className="p-8 space-y-6" data-testid="page-test-data">
      <div className="flex items-center gap-3">
        <div className="bg-amber-500/10 p-3 rounded-xl"><Database className="h-6 w-6 text-amber-600" /></div>
        <div>
          <h1 className="text-2xl font-bold">{t("test_data_title")}</h1>
          <p className="text-sm text-muted-foreground">{t("test_data_subtitle")}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => seed.mutate()} disabled={busy} data-testid="button-run-seed">
          {seed.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {t("test_data_run_seed")}
        </Button>
        <Button variant="outline" onClick={() => validate.mutate()} disabled={busy} data-testid="button-validate">
          <CheckCircle2 className="h-4 w-4 mr-2" /> {t("test_data_validate")}
        </Button>
        <Button variant="destructive" onClick={() => { if (confirm(t("test_data_reset_confirm"))) reset.mutate(); }} disabled={busy} data-testid="button-reset">
          <Trash2 className="h-4 w-4 mr-2" /> {t("test_data_reset")}
        </Button>
      </div>

      {status?.latestRun && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("test_data_latest_run")}</CardTitle></CardHeader>
          <CardContent className="text-sm flex items-center gap-3">
            <Badge variant={status.latestRun.status === "completed" ? "default" : "destructive"}>{status.latestRun.status}</Badge>
            <span className="text-muted-foreground">{status.latestRun.action} — {status.latestRun.startedAt ? new Date(status.latestRun.startedAt).toLocaleString() : ""}</span>
            {status.latestRun.error && <span className="text-destructive">{status.latestRun.error}</span>}
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("test_data_phases")}</CardTitle>
            <CardDescription>{report.environmentLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("test_data_phase")}</TableHead><TableHead>{t("test_data_created")}</TableHead><TableHead>{t("test_data_skipped")}</TableHead><TableHead>{t("notes")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {report.phases.map(p => (
                  <TableRow key={p.phase}>
                    <TableCell className="font-medium">{p.phase}</TableCell>
                    <TableCell>{p.created}</TableCell>
                    <TableCell>{p.skipped}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.notes?.join("; ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {checks && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("test_data_validation_report")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead></TableHead><TableHead>{t("test_data_check")}</TableHead><TableHead>{t("test_data_expected")}</TableHead><TableHead>{t("test_data_actual")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {checks.map(c => (
                  <TableRow key={c.name} data-testid={`check-${c.name}`}>
                    <TableCell>{c.passed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell className="font-mono text-xs">{c.expected}</TableCell>
                    <TableCell className="font-mono text-xs">{c.actual}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("test_data_accounts")}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>{t("username")}</TableHead><TableHead>{t("password")}</TableHead><TableHead>{t("role")}</TableHead><TableHead>{t("notes")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {report.accounts.map(a => (
                  <TableRow key={a.username}>
                    <TableCell className="font-mono text-xs">{a.username}</TableCell>
                    <TableCell className="font-mono text-xs">{a.password}</TableCell>
                    <TableCell>{a.role}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
