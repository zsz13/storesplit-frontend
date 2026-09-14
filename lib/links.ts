/**
 * Product links, and the rules a link must pass before it is rendered.
 *
 * The backend validates every product URL against the retailer's own host before storing it,
 * so this is a second gate rather than the only one. It matters because a bad value here is
 * not a broken link but a misleading one: a relative or object-shaped string in `href`
 * resolves against StoreSplit's own origin, so `{'id': ..., 'canonicalUrl': None}` became
 * `http://localhost:3000/%7B'id'...%7D` and looked like a real destination.
 *
 * The retailer's host comes from the API (`StoreOut.retailer_host`, taken from the adapter's
 * own `site_url`) rather than from a copy kept here. A copy would silently rot: change a
 * retailer's host in the backend and every link for it would quietly vanish, with nothing
 * failing. When the API names no host the link is not rendered, because "belongs to the
 * right retailer" is exactly what could not be established.
 */

import type { OfferOut, StoreOut } from "./api";

/**
 * Hosts a Google Maps link may point at. Deliberately a short list of the ones Google itself
 * serves maps from: a link is a destination, so it is checked here even though the backend
 * built it, for the same reason product URLs are.
 *
 * A host alone does not make a link the thing its label promises, on *any* of them --
 * `https://maps.google.com/…` is still Google's host when the path is a redirector. So the
 * path has to be a maps path, or the query has to name a place. No shortener is listed: a
 * shortener's whole job is to send you somewhere nobody here has looked at.
 */
const MAPS_HOSTS = new Set(["www.google.com", "google.com", "maps.google.com"]);
/** The only path that makes a link a map on any of those hosts. */
const MAPS_PATH = /^\/maps(\/|$)/;
/** The host that serves a map from its root, where the whole link is the query. */
const MAPS_ROOT_HOST = "maps.google.com";

/**
 * The URL to link to for this offer, or null when there is nothing safe to link to.
 * Callers render the link only for a non-null result.
 */
export function productLinkHref(offer: OfferOut): string | null {
  const raw = offer.product_url;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  // A backslash is where URL parsers disagree: some read the authority up to it, browsers
  // treat it as a path separator, so `https://evil.test\@retailer.com/p` can be read two
  // ways. No real product URL contains one.
  if (raw.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null; // relative paths and object-shaped strings land here
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.pathname === "" || url.pathname === "/") return null;

  const expected = offer.store.retailer_host;
  if (!expected || url.hostname.toLowerCase() !== expected.toLowerCase()) return null;
  return url.toString();
}

/** The Google Maps URL for a store, or null when there is nothing safe to link to. */
export function mapsLinkHref(store: StoreOut): string | null {
  const raw = store.maps_url;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (raw.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  const host = url.hostname.toLowerCase();
  if (!MAPS_HOSTS.has(host)) return null;
  const isMap = MAPS_PATH.test(url.pathname) || (host === MAPS_ROOT_HOST && url.pathname === "/");
  return isMap ? url.toString() : null;
}
