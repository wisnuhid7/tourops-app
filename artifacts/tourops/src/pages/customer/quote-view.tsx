import { useQuery } from "@tanstack/react-query";
import { useRoute, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/use-language";
import { Users, Moon, Hotel, Globe } from "lucide-react";
import type { Tour } from "@workspace/db";

// ── Shared types ──────────────────────────────────────────────────────────────

interface CustomerHotelChoice {
  hotelChoice: number;
  hotelName: string | null;
  prices: Record<string, string>; // occupancy -> sellingPrice
}

interface CustomerQuote {
  id: string;
  tourId: string;
  paxCount: number;
  nights: number;
  currency: string;
  status: "draft" | "final" | "archived";
  hotelChoices: CustomerHotelChoice[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: string | number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(v));
  } catch {
    return `${currency} ${Number(v).toFixed(2)}`;
  }
}

const OCC_KEYS = ["matrimonial", "double", "single", "third_person", "child"] as const;

const OCCUPANCY_LABELS: Record<string, string> = {
  matrimonial: "Matrimonial",
  double: "Double",
  single: "Single",
  third_person: "Triple",
  child: "Child",
  infant: "Infant",
};

const OCCUPANCY_ORDER = ["matrimonial", "double", "single", "third_person", "child", "infant"];

// ── Loading state ─────────────────────────────────────────────────────────────

function QuoteLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      <Skeleton className="h-10 w-64 mx-auto" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

// ── Rich quote content (task #22 design) ──────────────────────────────────────

function QuoteContent({ quote }: { quote: CustomerQuote }) {
  const { t } = useLanguage();
  const currency = quote.currency || "USD";

  const sortedOccupancies = (prices: Record<string, string>) =>
    OCCUPANCY_ORDER.filter(k => prices[k] !== undefined);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
            <Globe className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t("qv_title")}</h1>
          <p className="text-muted-foreground">{t("qv_subtitle")}</p>
          <Badge variant={quote.status === "final" ? "default" : "secondary"} className="capitalize">
            {t(`pe_status_${quote.status}`)}
          </Badge>
        </div>

        {/* Trip summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("qv_trip_summary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("pe_pax_count")}</p>
                  <p className="font-bold text-lg">{quote.paxCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
                  <Moon className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("pe_nights")}</p>
                  <p className="font-bold text-lg">{quote.nights}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hotel choices & prices */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t("qv_hotel_options")}</h2>
          {quote.hotelChoices.map(hc => (
            <Card key={hc.hotelChoice} className="overflow-hidden" data-testid={`card-hotel-choice-${hc.hotelChoice}`}>
              <CardHeader className="bg-primary/5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                    {hc.hotelChoice}
                  </div>
                  {hc.hotelName ? (
                    <span>{hc.hotelName}</span>
                  ) : (
                    <span className="text-muted-foreground">{t("qv_hotel_option")} {hc.hotelChoice}</span>
                  )}
                </CardTitle>
                <CardDescription>{t("qv_price_per_person_night")}</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-3">
                  {sortedOccupancies(hc.prices).map(occ => (
                    <div key={occ} className="flex items-center justify-between py-2 border-b last:border-0" data-testid={`price-${hc.hotelChoice}-${occ}`}>
                      <div className="flex items-center gap-2">
                        <Hotel className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{OCCUPANCY_LABELS[occ] ?? occ}</span>
                        <span className="text-xs text-muted-foreground">{t("qv_room")}</span>
                      </div>
                      <span className="text-lg font-bold text-primary">{fmt(hc.prices[occ], currency)}</span>
                    </div>
                  ))}
                  {Object.keys(hc.prices).length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("qv_no_rates")}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer note */}
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">{t("qv_price_note")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Default export: handles both /quotes/:id and /quotes/shared/:token ────────
// Uses useRoute to detect which pattern matched, so a single component can be
// registered for both routes in App.tsx.

/**
 * Customer quote page: final selling prices per hotel choice & occupancy only.
 * The API guarantees no internal cost/margin data is present.
 * Routes: /quotes/:id (assigned customer) and /quotes/shared/:token.
 */
export default function CustomerQuoteView() {
  const { t } = useLanguage();
  const [matchShared, sharedParams] = useRoute("/quotes/shared/:token");
  const [, idParams] = useRoute("/quotes/:id");

  const url = matchShared
    ? `/api/pricing/quotes/shared/${sharedParams!.token}`
    : `/api/pricing/quotes/${idParams?.id}/customer`;

  const { data: quote, isLoading, error } = useQuery<CustomerQuote>({
    queryKey: [url],
    retry: false,
  });
  const { data: tour } = useQuery<Tour>({
    queryKey: [`/api/tours/${quote?.tourId}`],
    enabled: !!quote?.tourId,
    retry: false,
  });

  if (isLoading) return <QuoteLoading />;
  if (error || !quote) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-quote-unavailable">
            {t("pe_quote_unavailable")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <QuoteContent quote={quote} />;
}

// ── Named exports: used by App.tsx when routes are split ──────────────────────

export function QuoteViewById() {
  const { t } = useLanguage();
  const params = useParams<{ id: string }>();

  const { data: quote, isLoading, isError } = useQuery<CustomerQuote>({
    queryKey: [`/api/pricing/quotes/${params.id}/customer`],
    retry: false,
  });

  if (isLoading) return <QuoteLoading />;
  if (isError || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-2xl font-bold">{t("qv_not_found")}</p>
          <p className="text-muted-foreground">{t("qv_not_found_desc")}</p>
        </div>
      </div>
    );
  }

  return <QuoteContent quote={quote} />;
}

export function QuoteViewByToken() {
  const { t } = useLanguage();
  const params = useParams<{ token: string }>();

  const { data: quote, isLoading, isError } = useQuery<CustomerQuote>({
    queryKey: [`/api/pricing/quotes/shared/${params.token}`],
    retry: false,
  });

  if (isLoading) return <QuoteLoading />;
  if (isError || !quote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-2xl font-bold">{t("qv_not_found")}</p>
          <p className="text-muted-foreground">{t("qv_not_found_desc")}</p>
        </div>
      </div>
    );
  }

  return <QuoteContent quote={quote} />;
}
