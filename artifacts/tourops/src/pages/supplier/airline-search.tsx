import { useState } from "react";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/use-language";
import { Plane, Search, TrendingDown, DollarSign, Plus, Trash2, ArrowRight } from "lucide-react";
import type { City } from "@workspace/db";

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <div className="bg-destructive/10 text-destructive p-4 rounded-md">
            <h2 className="font-bold">Something went wrong.</h2>
            <p className="text-sm font-mono mt-2">{String(this.state.error)}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AirlineSearchTab() {
  const { t } = useLanguage();
  const [legs, setLegs] = useState([{ origin: "", destination: "", date: "" }]);
  const [searching, setSearching] = useState(false);

  const { data: cities } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });

  const { data: results, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["multi-leg-flights", legs],
    queryFn: async () => {
      const allResults = await Promise.all(
        legs.map(async (leg) => {
          const res = await fetch(`/api/flights/search?origin=${encodeURIComponent(leg.origin)}&destination=${encodeURIComponent(leg.destination)}&date=${encodeURIComponent(leg.date)}`);
          if (!res.ok) throw new Error("Search failed");
          return res.json();
        })
      );
      return allResults;
    },
    enabled: false,
  });

  const addLeg = () => {
    if (legs.length < 5) {
      setLegs([...legs, { origin: "", destination: "", date: "" }]);
    }
  };

  const removeLeg = (index: number) => {
    if (legs.length > 1) {
      setLegs(legs.filter((_, i) => i !== index));
    }
  };

  const updateLeg = (index: number, field: string, value: string) => {
    const newLegs = [...legs];
    (newLegs[index] as any)[field] = value;
    setLegs(newLegs);
  };

  const handleSearch = () => {
    const isValid = legs.every(l => l.origin && l.destination && l.date);
    if (!isValid) return;
    setSearching(true);
    refetch().finally(() => setSearching(false));
  };

  return (
    <ErrorBoundary>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2">
            <Plane className="h-6 w-6 text-primary" />
            {t("global_multi_city_flight_search")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("compare_realtime_prices_desc")}</p>
        </div>
        <Button onClick={addLeg} variant="outline" className="gap-2 border-primary/50 text-primary hover:bg-primary/5">
          <Plus className="h-4 w-4" /> {t("add_leg")}
        </Button>
      </div>

      <div className="space-y-4">
        {legs.map((leg, idx) => (
          <Card key={idx} className="border-primary/10 shadow-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20" />
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-1 flex items-center justify-center">
                  <Badge variant="outline" className="h-8 w-8 rounded-full p-0 flex items-center justify-center font-bold">
                    {idx + 1}
                  </Badge>
                </div>
                <div className="md:col-span-3 space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">{t("origin")}</Label>
                  <Select value={leg.origin} onValueChange={(v) => updateLeg(idx, "origin", v)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={t("origin")} />
                    </SelectTrigger>
                    <SelectContent>
                      {cities?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-1 flex items-center justify-center pb-2">
                   <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="md:col-span-3 space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">{t("destination")}</Label>
                  <Select value={leg.destination} onValueChange={(v) => updateLeg(idx, "destination", v)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={t("destination")} />
                    </SelectTrigger>
                    <SelectContent>
                      {cities?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3 space-y-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">{t("date")}</Label>
                  <Input type="date" value={leg.date} onChange={(e) => updateLeg(idx, "date", e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="md:col-span-1 flex justify-end">
                  {legs.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeLeg(idx)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-center pt-4">
        <Button onClick={handleSearch} disabled={searching || isFetching} className="gap-2 px-8 h-12 text-lg shadow-xl shadow-primary/20">
          <Search className="h-5 w-5" />
          {searching ? t("consulting_global_gds") : t("search_all_legs")}
        </Button>
      </div>

      {(isFetching || results) && (
        <Card className="border-none shadow-xl bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-green-500" />
              {t("integrated_route_offers")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isFetching ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : results && results.length > 0 ? (
              <div className="space-y-6">
                {results.map((segmentResults, legIdx) => (
                  <div key={legIdx} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{t("leg_label")} {legIdx + 1}</Badge>
                      <span className="text-sm font-bold">{legs[legIdx]?.origin} to {legs[legIdx]?.destination}</span>
                    </div>
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-[200px]">{t("airline_header")}</TableHead>
                          <TableHead>{t("flight_no_header")}</TableHead>
                          <TableHead>{t("dep_arr_header")}</TableHead>
                          <TableHead>{t("price")}</TableHead>
                          <TableHead className="text-right">{t("action_header")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(segmentResults.flights || segmentResults).map((flight: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 bg-slate-100 rounded flex items-center justify-center text-[10px] font-bold">
                                  {flight.airlineName ? flight.airlineName.slice(0, 2).toUpperCase() : "UN"}
                                </div>
                                {flight.airlineName}
                              </div>
                            </TableCell>
                            <TableCell>{flight.flightNumber}</TableCell>
                            <TableCell className="text-xs">
                              <div>{flight.departureTime}</div>
                              <div className="text-muted-foreground">{flight.arrivalTime}</div>
                            </TableCell>
                            <TableCell className="font-bold text-primary">
                              {flight.price} {flight.currency}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant={i === 0 ? "default" : "outline"} className="h-7 text-[10px]">{t("select_label")}</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                <Plane className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <h3 className="font-bold text-slate-900 dark:text-white">{t("no_flights_found")}</h3>
                <p className="text-sm">{t("try_adjusting_dates_routes")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
    </ErrorBoundary>
  );
}
