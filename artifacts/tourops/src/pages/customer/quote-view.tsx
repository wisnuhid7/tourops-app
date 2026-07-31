import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/use-language";
import { Users, Moon, Hotel } from "lucide-react";
import type { Tour } from "@workspace/db";

interface CustomerQuote {
  id: string;
  tourId: string;
  paxCount: number;
  nights: number;
  currency: string;
  status: string;
  hotelChoices: Array<{ hotelChoice: number; hotelName: string | null; prices: Record<string, string> }>;
}

const OCC_KEYS = ["double", "single", "third_person", "child"] as const;

/**
 * Customer quote page: final selling prices per hotel choice & occupancy
 * only. The API guarantees no internal cost/margin data is present.
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

  if (isLoading) {
    return <div className="max-w-3xl mx-auto p-6 space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-48 w-full" /></div>;
  }
  if (error || !quote) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Card><CardContent className="py-12 text-center text-muted-foreground" data-testid="text-quote-unavailable">{t("pe_quote_unavailable")}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="page-customer-quote">
      <div>
        <h1 className="text-2xl font-bold">{t("pe_your_quote")}</h1>
        {tour && <p className="text-muted-foreground">{tour.title}</p>}
        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="w-4 h-4" />{quote.paxCount} {t("pe_pax")}</span>
          <span className="flex items-center gap-1"><Moon className="w-4 h-4" />{quote.nights} {t("pe_nights")}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        {quote.hotelChoices.map((hc) => (
          <Card key={hc.hotelChoice} data-testid={`card-hotel-choice-${hc.hotelChoice}`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Hotel className="w-4 h-4" />
                {hc.hotelName ?? `${t("pe_hotel_choice")} ${hc.hotelChoice}`}
              </CardTitle>
              <Badge variant="outline">{t("pe_option")} {hc.hotelChoice}</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {OCC_KEYS.filter((o) => hc.prices[o]).map((o) => (
                  <div key={o} className="rounded-lg border p-3 text-center" data-testid={`price-${hc.hotelChoice}-${o}`}>
                    <div className="text-xs text-muted-foreground mb-1">{t(`pe_${o}` as any)}</div>
                    <div className="text-lg font-semibold">{quote.currency} {hc.prices[o]}</div>
                    <div className="text-xs text-muted-foreground">{t("pe_per_person")}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("pe_prices_note")}</p>
    </div>
  );
}
