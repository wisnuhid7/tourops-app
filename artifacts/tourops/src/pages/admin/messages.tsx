import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Search, MessageSquare, ArrowRight } from "lucide-react";
import type { Message, Booking } from "@workspace/db";
import { useState } from "react";
import { useLanguage } from "@/hooks/use-language";

export default function AdminMessages() {
  const { t } = useLanguage();
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: messages, isLoading } = useQuery<Message[]>({ queryKey: ["/api/messages"] });
  const { data: bookings } = useQuery<Booking[]>({ queryKey: ["/api/bookings"] });

  const filtered = (messages || []).filter((m) => {
    const matchVisibility = visibilityFilter === "all" || m.visibility === visibilityFilter;
    const booking = bookings?.find(b => b.id === m.bookingId);
    const matchSearch = !search || 
      (m.messageText || "").toLowerCase().includes(search.toLowerCase()) || 
      (m.senderName || "").toLowerCase().includes(search.toLowerCase()) || 
      (booking?.bookingCode || "").toLowerCase().includes(search.toLowerCase());
    return matchVisibility && matchSearch;
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-48 mb-4" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 mb-2" />)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-messages-title">{t("messages_title")}</h1>
        <p className="text-muted-foreground text-sm">{t("all_booking_conversations_desc")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("search_messages_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-messages" />
        </div>
        <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-visibility-filter"><SelectValue placeholder={t("visibility_label")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_messages")}</SelectItem>
            <SelectItem value="customer_visible">{t("customer_visible")}</SelectItem>
            <SelectItem value="internal_only">{t("internal_only")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-16"><MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" /><h3 className="font-semibold mb-1">{t("no_messages_found")}</h3><p className="text-sm text-muted-foreground">{t("messages_will_appear_desc")}</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((msg) => {
            const booking = bookings?.find(b => b.id === msg.bookingId);
            return (
              <Link key={msg.id} href={`/admin/bookings/${msg.bookingId}`}>
                <Card className="hover-elevate cursor-pointer" data-testid={`card-message-${msg.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{msg.senderName || t("system_label")}</span>
                          <Badge variant={msg.visibility === "internal_only" ? "secondary" : "outline"} className="text-xs">
                            {msg.visibility === "internal_only" ? t("internal_label") : t("customer_label")}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{booking?.bookingCode}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{msg.messageText}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ""}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
