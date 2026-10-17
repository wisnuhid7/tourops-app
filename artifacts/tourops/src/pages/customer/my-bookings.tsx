import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { BookOpen, Calendar, Users, ArrowRight, Link2, MapPin } from "lucide-react";
import type { Booking, Tour } from "@workspace/db";
import { useLanguage } from "@/hooks/use-language";
import { LanguageSwitcher } from "@/components/language-switcher";

import React from "react";

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

export default function MyBookings() {
  const { t, lt } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("joinCode");
    if (code) {
      setJoinCode(code);
      setShowJoin(true);
      // Clear the query param from URL without refreshing
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  const { data: bookings, isLoading } = useQuery<Booking[]>({ queryKey: ["/api/my-bookings"] });
  const { data: tours } = useQuery<Tour[]>({ queryKey: ["/api/tours/public"] });

  const joinMutation = useMutation({
    mutationFn: (code: string) => apiRequest("POST", "/api/bookings/join", { joinCode: code }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      setShowJoin(false);
      setJoinCode("");
      toast({ title: t("successfully_joined_group") });
    },
    onError: (err: any) => {
      // Surface the server's specific reason (already joined, group closed,
      // full departure) instead of a blanket "invalid code" message.
      const serverMsg = String(err?.message || "").replace(/^\d{3}:\s*/, "");
      let title = t("invalid_join_code");
      try {
        const parsed = JSON.parse(serverMsg);
        if (parsed?.message) title = parsed.message;
      } catch {
        if (serverMsg && !/^\s*</.test(serverMsg)) title = serverMsg;
      }
      toast({ title, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-48" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  }

  const tourNames = new Map((tours || []).map((tour) => [tour.id, lt(tour, "title")]));

  return (
    <ErrorBoundary>
      <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif" data-testid="text-my-bookings-title">{t("my_bookings")}</h1>
          <p className="text-muted-foreground text-sm">{t("view_manage_bookings_subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          <Dialog open={showJoin} onOpenChange={setShowJoin}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-join-group"><Link2 className="h-4 w-4 mr-2" />{t("join_group")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{t("join_a_group_tour")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{t("enter_invite_code_desc")}</p>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder={t("enter_join_code_placeholder")}
                  data-testid="input-join-code"
                />
                <Button
                  className="w-full"
                  onClick={() => joinMutation.mutate(joinCode)}
                  disabled={!joinCode.trim() || joinMutation.isPending}
                  data-testid="button-submit-join"
                >
                  {joinMutation.isPending ? t("joining") : t("join_group")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button asChild data-testid="button-browse-tours">
            <Link href="/tours">
              <div className="flex items-center">
                <MapPin className="h-4 w-4 mr-2" />{t("browse_tours")}
              </div>
            </Link>
          </Button>
        </div>
      </div>

      {!Array.isArray(bookings) || bookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold mb-1">{t("no_bookings_yet")}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t("browse_tours_book_adventure")}</p>
            <Button asChild>
              <Link href="/tours">{t("explore_tours")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <Link key={booking.id} href={`/my-bookings/${booking.id}`}>
              <Card className="hover-elevate cursor-pointer" data-testid={`card-my-booking-${booking.id}`}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <p className="font-semibold text-base">
                        {tourNames.get(booking.tourId || "") || booking.groupName || t("trip_summary")}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{booking.bookingCode}</span>
                        <Badge variant="outline" className="text-xs">{t(`booking_type_${booking.bookingType}` as any)}</Badge>
                      </div>
                      {tourNames.get(booking.tourId || "") && booking.groupName && (
                        <p className="text-sm text-muted-foreground">{booking.groupName}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{booking.partySizeExpected} {t("travelers_suffix")}</span>
                        {booking.createdAt && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{t("booked_on")} {new Date(booking.createdAt).toLocaleDateString()}</span>}
                        {booking.joinCode && (
                          <span className="flex items-center gap-1 font-mono"><Link2 className="h-3 w-3" />{booking.joinCode}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={booking.status === "confirmed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"}>
                          {t(`booking_status_${booking.status || "submitted"}` as any)}
                        </Badge>
                        <span className="text-xs font-medium text-primary flex items-center gap-1">
                          {t("view_booking")} <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
