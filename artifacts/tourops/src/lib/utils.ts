import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getFullImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('/')) return url;
  return '/uploads/images/' + url;
};

// Convert any Google Maps URL a user pastes (place link, coordinates link,
// share link, embed link) into a keyless embeddable iframe URL.
// Falls back to a plain place-name search when the URL can't be parsed.
const GOOGLE_MAPS_HOSTS = /^(maps\.google\.com|www\.google\.com|google\.com|maps\.app\.goo\.gl|goo\.gl)$/i;

export const getGoogleMapsEmbedUrl = (url?: string | null, fallbackQuery?: string): string | null => {
  const embed = (q: string) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
  if (url) {
    try {
      const u = new URL(url);
      // Only trust real Google Maps origins over https; anything else falls
      // through to the safe name-based fallback so an arbitrary third-party
      // URL can never be embedded in the page.
      if (u.protocol !== 'https:' || !GOOGLE_MAPS_HOSTS.test(u.hostname)) {
        return fallbackQuery ? embed(fallbackQuery) : null;
      }
      // Already an embed URL — use it directly (host verified above).
      if (u.pathname.includes('/maps/embed')) return url;
      // Explicit query param, e.g. ?q=... or ?query=...
      const qp = u.searchParams.get('q') || u.searchParams.get('query');
      if (qp) return embed(qp);
      // Place-name URL, e.g. /maps/place/Hotel+Name/...
      const place = u.pathname.match(/\/maps\/place\/([^/]+)/);
      if (place) return embed(decodeURIComponent(place[1].replace(/\+/g, ' ')));
      // Coordinates in the path, e.g. /maps/@-8.65,115.21,15z
      const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (at) return embed(`${at[1]},${at[2]}`);
    } catch {
      // Not a parseable URL — fall through to the name-based fallback.
    }
  }
  if (fallbackQuery) return embed(fallbackQuery);
  return null;
};