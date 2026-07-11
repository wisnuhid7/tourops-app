import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, MapPin, Calendar, ArrowRight, Search } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useLanguage } from "@/hooks/use-language";

export default function JoinGroups() {
  const { t } = useLanguage();
  const { data: groups, isLoading } = useQuery<any[]>({
    queryKey: ["/api/public-groups"],
  });

  const [searchTerm, setSearchTerm] = useState("");

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      </div>
    );
  }

  const filteredGroups = (groups || []).filter(g => 
    (g.groupName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.tourTitle || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.joinCode || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 bg-slate-50/50 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("join_a_travel_group")}</h1>
        <p className="text-muted-foreground mt-1">{t("browse_groups_subtitle")}</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("search_groups_placeholder")}
          className="pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredGroups?.map((group) => (
          <Card key={group.id} className="group hover:shadow-xl transition-all duration-300 border-none shadow-sm overflow-hidden bg-white">
            <CardHeader className="bg-primary/5 pb-4">
              <div className="flex justify-between items-start gap-4">
                <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">{group.groupName}</CardTitle>
                <Badge variant="secondary" className="font-mono text-xs">{group.joinCode}</Badge>
              </div>
              <CardDescription className="flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3" />
                {group.tourTitle}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{t("departure")} {group.departureId}</span>
                </div>
                <div className="flex items-center gap-1 font-semibold text-slate-700">
                  <Users className="h-4 w-4" />
                  {group.partySizeExpected} {t("pax_suffix")}
                </div>
              </div>

              <Button className="w-full group-hover:shadow-lg transition-all" asChild>
                <Link href={`/tours/${group.tourId}?joinCode=${group.joinCode}`}>
                  {t("join_this_group")} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}

        {filteredGroups?.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-10 w-10 text-slate-300" />
            </div>
            <h3 className="text-lg font-medium">{t("no_joinable_groups")}</h3>
            <p className="text-muted-foreground">{t("try_different_search_or_start_group")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
