import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { FileText, CreditCard, MessageSquare, ArrowRight, MapPin, Copy, Check } from "lucide-react";
import type { Booking, Tour } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

interface DashboardData {
  bookings: Booking[];
  alerts: {
    missingDocs: number;
    pendingPayments: number;
    unreadMessages: number;
  };
}

export default function LeaderDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [copiedJoinCode, setCopiedJoinCode] = useState<string | undefined>(undefined);

  const { data: dashboardData, isLoading: isDashboardLoading } = useQuery<DashboardData>({
    queryKey: ["/api/leader/dashboard"],
  });

  const { data: tours, isLoading: isToursLoading } = useQuery<Tour[]>({
    queryKey: ["/api/tours/public"],
  });

  const isLoading = isDashboardLoading || isToursLoading;
  const bookings = dashboardData?.bookings || [];
  const alerts = dashboardData?.alerts || { missingDocs: 0, pendingPayments: 0, unreadMessages: 0 };

  const getTourName = (tourId?: string | null) => {
    if (!tourId || !tours) return t("custom_tour");
    const tour = tours.find((tr) => tr.id === tourId);
    return tour?.title || t("custom_tour");
  };

  const copyJoinCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedJoinCode(code);
    toast({ title: t("join_code_copied_clipboard") });
    setTimeout(() => setCopiedJoinCode(undefined), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif" data-testid="text-leader-dashboard-title">
            {t("leader_dashboard")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("leader_dashboard_subtitle")}</p>
        </div>
        <Link href="/leader-payments">
          <Button variant="outline" size="sm" data-testid="button-leader-payment-report">
            <CreditCard className="h-4 w-4 mr-1" />{t("payment_report")}
          </Button>
        </Link>
      </div>

      {/* Alert Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-wrap">
        <Link href={bookings.length > 0 ? `/my-bookings/${bookings[0].id}` : "/my-bookings"}>
          <Card className="hover-elevate cursor-pointer" data-testid="card-alert-missing-docs">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t("missing_documents")}</p>
                  <p className="text-3xl font-bold" data-testid="text-alert-missing-docs">
                    {alerts.missingDocs}
                  </p>
                </div>
                <FileText className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={bookings.length > 0 ? `/my-bookings/${bookings[0].id}` : "/my-bookings"}>
          <Card className="hover-elevate cursor-pointer" data-testid="card-alert-pending-payments">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t("pending_payments")}</p>
                  <p className="text-3xl font-bold" data-testid="text-alert-pending-payments">
                    {alerts.pendingPayments}
                  </p>
                </div>
                <CreditCard className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href={bookings.length > 0 ? `/my-bookings/${bookings[0].id}` : "/my-bookings"}>
          <Card className="hover-elevate cursor-pointer" data-testid="card-alert-messages">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <p className="text-sm font-medium text-muted-foreground">{t("tab_messages")}</p>
                  <p className="text-3xl font-bold" data-testid="text-alert-messages">
                    {alerts.unreadMessages}
                  </p>
                </div>
                <MessageSquare className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Your Bookings Section */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t("your_bookings")}</h2>

        {bookings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <MapPin className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="font-semibold mb-2">{t("no_bookings_yet")}</h3>
              <p className="text-sm text-muted-foreground mb-6">{t("start_creating_joining_group")}</p>
              <Link href="/tours">
                <Button data-testid="button-browse-tours">{t("browse_tours")}</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <Card key={booking.id} className="hover-elevate" data-testid={`card-leader-booking-${booking.id}`}>
                <CardContent className="p-5">
                  <div className="space-y-3">
                    {/* Top row: Code, Tour, Group Name */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm">{booking.bookingCode}</span>
                          <Badge variant="outline" className="text-xs">
                            {t(`booking_type_${booking.bookingType}` as any)}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{getTourName(booking.tourId)}</p>
                        {booking.groupName && (
                          <p className="text-xs text-muted-foreground">{booking.groupName}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={
                            booking.status === "confirmed"
                              ? "default"
                              : booking.status === "cancelled"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {t(`booking_status_${booking.status || "submitted"}` as any)}
                        </Badge>
                        <Badge variant={booking.fulfillmentStatus === "completed" ? "default" : "outline"}>
                          {t(`fulfillment_status_${booking.fulfillmentStatus || "pending"}` as any)}
                        </Badge>
                      </div>
                    </div>

                    {/* Middle row: Details */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        {booking.partySizeExpected} {t("travelers_suffix")}
                      </span>
                    </div>

                    {/* Join code section (if leader_group type) */}
                    {booking.bookingType === "leader_group" && booking.joinCode && (
                      <div className="flex flex-wrap items-center gap-2 p-2 bg-muted rounded-md">
                        <span className="text-xs text-muted-foreground">{t("join_code_label")}</span>
                        <code className="font-mono font-semibold text-xs">{booking.joinCode}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 ml-auto"
                          onClick={() => copyJoinCode(booking.joinCode || "")}
                          data-testid={`button-copy-join-code-${booking.id}`}
                        >
                          {copiedJoinCode === (booking.joinCode ?? undefined) ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    )}

                    {/* Action button */}
                    <div className="flex items-center justify-end">
                      <Link href={`/my-bookings/${booking.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`button-view-booking-${booking.id}`}
                        >
                          {t("view_details")}
                          <ArrowRight className="h-3 w-3 ml-1.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
