const MAPS_HOSTS = ["google.com", "www.google.com", "maps.google.com", "goo.gl", "maps.app.goo.gl"];

/** True for Google Maps share/place links (google.com/maps…, maps.google.com, maps.app.goo.gl, goo.gl/maps). */
export function isGoogleMapsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (!MAPS_HOSTS.includes(host) && !/^(www\.)?google\.[a-z.]+$/.test(host)) return false;
    if (host === "maps.google.com" || host === "maps.app.goo.gl") return true;
    return url.pathname.startsWith("/maps");
  } catch {
    return false;
  }
}

/**
 * Normalises an optional venue map link from a request body.
 * undefined → leave unchanged, "" → clear, otherwise it must be a Google Maps link.
 */
export function resolveMapLink(value: unknown): { mapLink?: string | null; error?: string } {
  if (value === undefined) return {};
  const link = String(value ?? "").trim();
  if (!link) return { mapLink: null };
  return isGoogleMapsUrl(link) ? { mapLink: link } : { error: "Map link must be a Google Maps link (google.com/maps or maps.app.goo.gl)" };
}
