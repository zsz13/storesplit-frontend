/**
 * Typed client for the StoreSplit backend HTTP API.
 *
 * All response types mirror `app/schemas.py` in the backend. Decimal fields arrive as JSON
 * strings (e.g. "4.99") and timestamps as ISO 8601 strings; they are kept as strings here and
 * only formatted for display.
 */

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/+$/,
  "",
);

/** Decimal serialized by the backend, e.g. "4.99". */
export type DecimalString = string;
/** ISO 8601 timestamp. */
export type IsoDateTime = string;

export interface HealthResponse {
  status: string;
  database: string;
}

/** Normalized offer availability, as stored by the backend. */
export type Availability = "in_stock" | "out_of_stock" | "unknown";
/**
 * Whether a retailer states per-store stock at all, which is what tells the two kinds of
 * `unknown` apart. `live` means the retailer publishes inventory and this particular reading
 * could not be trusted; `not_published` means it publishes none anywhere, so `unknown` is
 * the only state its offers can ever have and nothing has gone wrong. It changes no ranking
 * -- the backend keeps `unknown` out of the comparison either way -- only the wording.
 */
export type StockReporting = "live" | "not_published";
/** What a caller asks to see. `all` is the only value that shows out-of-stock offers. */
export type AvailabilityFilter = Availability | "all";
/** In-stock only, matching the backend's default for search and basket comparison. */
export const DEFAULT_AVAILABILITY: AvailabilityFilter = "in_stock";

/**
 * What is true at a store right now, decided by the backend in the store's own timezone.
 *
 * `unknown` is a real answer rather than a gap: several retailers publish no hours on any
 * surface StoreSplit is allowed to read, and the row says so instead of guessing.
 */
/**
 * What an offer's `price` is quoted per. `package` is a total for one package; the rest are
 * rates that are already per unit, and a client must never divide one by a package size.
 */
export type PriceBasis = "package" | "lb" | "oz" | "each";

export interface HoursTodayOut {
  state: "open" | "closed" | "unknown";
  /** Local wall clock at the store, "08:00". Never a timestamp. */
  opens_at: string | null;
  closes_at: string | null;
  /** "today", "tomorrow", or a weekday name. */
  opens_day: string | null;
  /**
   * True only when the retailer published *this* date as one the store does not open at all.
   * A different sentence from "closed right now": "Closed today" tells a shopper to stop
   * planning around this shop; "Closed - opens 8:00 AM" tells them to wait.
   */
  closed_all_day: boolean;
  /**
   * The next opening as an ISO instant, for a store that is shut and has one. It exists
   * because `opens_at` is a wall clock: two stores in different timezones print the same
   * "8:00 AM" without meaning the same moment, so a list of "what opens first" has to be
   * ordered by this and labelled with that. Null while the store is open.
   */
  next_open_at: string | null;
}

export interface StoreOut {
  id: number;
  retailer_slug: string;
  retailer_name: string;
  /** Host this retailer's product pages live on; product links are checked against it. */
  retailer_host: string | null;
  /** Whether this retailer publishes stock at all. See {@link StockReporting}. */
  stock_reporting: StockReporting;
  name: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  /**
   * A Google Maps link to this exact store, built by the backend from coordinates or a
   * street address the retailer published. Null when neither is known -- a store is never
   * pointed at from a guess. Still host-checked here (`mapsLinkHref`) before it is rendered.
   */
  maps_url: string | null;
  hours_today: HoursTodayOut;
}

export interface OfferOut {
  id: number;
  store: StoreOut;
  retailer_product_id: number;
  retailer_sku: string;
  title: string;
  product_url: string | null;
  image_url: string | null;
  /**
   * The amount, and what it is an amount *of*. `price` means nothing without `price_basis`:
   * "2.59" is a tray of chicken at `package` and a pound of it at `lb`. Rendering the second
   * as the first is the bug this field exists to stop -- it read "$2.59 for the pack" over a
   * per-pound rate, and the unit price beneath it had been divided by the weight twice.
   */
  price: DecimalString;
  price_basis: PriceBasis;
  regular_price: DecimalString;
  loyalty_price: DecimalString | null;
  /**
   * The most a variable-weight item can come to, where the retailer publishes it. Null means
   * the retailer did not say, and nothing here derives one: Target's own ceiling for a
   * 2.5-5.25 lb tray at $2.59/lb is $12.95, not the $13.60 that multiplying gives.
   */
  max_total_price: DecimalString | null;
  /** The weight span the retailer published for this package. Null together for a fixed one. */
  min_weight: DecimalString | null;
  max_weight: DecimalString | null;
  weight_unit: string | null;
  currency: string;
  availability: Availability;
  /** The retailer's own wording, e.g. "lowStock". Shown as a hint, never parsed. */
  stock_status: string | null;
  /** The store the retailer itself echoed back when it priced this offer. */
  store_context: string | null;
  unit_price: DecimalString | null;
  unit_price_unit: string | null;
  scraped_at: IsoDateTime;
  is_cheapest_for_product: boolean;
  is_cheapest_overall: boolean;
}

/** How old the prices behind an answer are, and what is being done about it. */
export interface FreshnessOut {
  last_updated_at: IsoDateTime | null;
  age_seconds: number | null;
  ttl_seconds: number;
  /** Older than the TTL. Stale data is still shown -- this only means a refresh is warranted. */
  is_stale: boolean;
  /** A refresh is in flight for this ZIP+category, whoever started it. */
  refreshing: boolean;
  refresh_started_at: IsoDateTime | null;
  refresh_finished_at: IsoDateTime | null;
  cooldown_seconds: number;
  /**
   * Seconds until a refresh may next start. Relative on purpose: anchor it to the browser's
   * own clock and count down, so a skew against the server cannot show a wrong time.
   */
  refresh_available_in_seconds: number;
  can_refresh: boolean;
  /** Set when the last refresh failed. The results on screen are still the last valid ones. */
  last_error: string | null;
}

/** Pagination by canonical product. An offer is never a page unit. */
export interface PageOut {
  page: number;
  page_size: number;
  total_products: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface ProductOut {
  id: number;
  category: string;
  brand: string | null;
  normalized_name: string;
  quantity: DecimalString | null;
  quantity_unit: string | null;
  count: number | null;
  gtin: string | null;
  comparison_unit: string;
  comparison_quantity: DecimalString | null;
  attributes: Record<string, unknown>;
  /** A picture for the card: the best offer's, else the first offer that has one. */
  image_url: string | null;
  best_offer_id: number | null;
  /**
   * What the collapsed card shows. Non-null only when the leading offer is `in_stock`: an
   * unknown or out-of-stock price is never the headline.
   */
  best_offer: OfferOut | null;
  offer_count: number;
  in_stock_offer_count: number;
  retailer_count: number;
  store_count: number;
  price_low: DecimalString | null;
  price_high: DecimalString | null;
  offers: OfferOut[];
}

export interface SearchResponse {
  query: string;
  zip_code: string;
  category: string | null;
  category_label: string | null;
  comparison_unit: string | null;
  availability: AvailabilityFilter;
  /**
   * Whether the server compared only stores that are not shut. Echoed rather than assumed,
   * so the UI renders what was actually applied. `stores` is never narrowed by it: a client
   * that filtered down to nothing still has to name what is shut and when it opens.
   */
  open_now: boolean;
  /** Offers matched before the availability filter; 0 means nothing has been collected. */
  offers_before_filter: number;
  stores: StoreOut[];
  products: ProductOut[];
  /**
   * Products from retailers that publish no stock at all — Trader Joe's sells nothing
   * online and says nothing about its shelves. Real prices and real links, but nobody has
   * confirmed they are there today, so they are returned beside the confirmed results and
   * shown under their own heading. Only populated for the default in-stock view.
   */
  unknown_products: ProductOut[];
  cheapest_offer_id: number | null;
  last_updated_at: IsoDateTime | null;
  freshness: FreshnessOut | null;
  page: PageOut | null;
}

/** Why a refresh did or did not start. All three are 200s: none is a client mistake. */
export type RefreshState = "started" | "already_running" | "cooling_down";

export interface RefreshResponse {
  state: RefreshState;
  zip_code: string;
  category: string | null;
  category_label: string | null;
  freshness: FreshnessOut;
}

export interface ProductOffersResponse {
  product: ProductOut;
  availability: AvailabilityFilter;
}

/**
 * One price, as it stood at one moment, at one store.
 *
 * Two figures, and they are not interchangeable. `unit_price` is the normalized comparison
 * price — per lb, per egg, per gal — and is the only one comparable across pack sizes, so it
 * is what a chart plots. `price` is the amount the retailer quotes and `price_basis` says
 * what that amount buys; it is context beside the line, never the axis.
 */
export interface PriceObservationOut {
  scraped_at: IsoDateTime;
  price: DecimalString;
  regular_price: DecimalString;
  loyalty_price: DecimalString | null;
  unit_price: DecimalString | null;
  /**
   * Null means nobody recorded what the amount was quoted per — a row written before the
   * column existed whose offer has since gone. It is deliberately *not* `package`: a client
   * prints that as "for the pack", and over a per-pound rate that is the one sentence this
   * app exists to stop saying. Show the amount alone when it is null.
   */
  price_basis: PriceBasis | null;
  unit_price_unit: string | null;
  /**
   * The one observation that predates the requested window. It is returned so a line has a
   * value to start from — a price that last moved before the range is still the price the
   * range starts at — and flagged so it is never presented as something that happened
   * inside the range the shopper asked for.
   */
  before_window: boolean;
}

/**
 * One retailer's own SKU at one physical store. The only thing that has a price series:
 * two branches of one chain price differently, and a line averaging them would show a price
 * nobody was charged.
 */
export interface PriceSeriesOut {
  retailer_product_id: number;
  retailer_sku: string;
  retailer_slug: string;
  retailer_name: string;
  store_id: number;
  store_name: string;
  store_city: string | null;
  /**
   * The price being charged now, and when it was last confirmed. Null when the offer has
   * been expired — the product is no longer listed at this store, and its last known price
   * must not be drawn forward to today.
   */
  current: PriceObservationOut | null;
  /**
   * Whether that current price is one a shopper can act on, and whether this retailer states
   * stock at all — the same two facts every other surface words with `lib/availability.ts`.
   * The rest of the app refuses to *lead* with an offer nobody has confirmed, and this is
   * what stops the chart being the one screen where an unbuyable price is the headline.
   */
  availability: Availability | null;
  stock_reporting: StockReporting;
  /** Oldest first. Each price holds until the next observation: steps, not samples. */
  points: PriceObservationOut[];
  /** More observations existed in the window than the response returns. */
  truncated: boolean;
}

export interface PriceHistoryResponse {
  product_id: number;
  product_name: string;
  category: string;
  /** What this product is compared per — "lb", "egg", "gal". The y axis's title. */
  comparison_unit: string | null;
  currency: string;
  days: number;
  since: IsoDateTime;
  now: IsoDateTime;
  series: PriceSeriesOut[];
}

export interface ScrapeRequest {
  zip_code: string;
  retailers?: string[];
  categories?: string[];
}

export interface ScrapeRunOut {
  id: number;
  retailer_slug: string;
  zip_code: string;
  categories: string[];
  status: string;
  products_seen: number;
  offers_written: number;
  error: string | null;
  started_at: IsoDateTime;
  finished_at: IsoDateTime | null;
}

export interface ScrapeResponse {
  runs: ScrapeRunOut[];
}

export interface ScrapeOptionsResponse {
  retailers: string[];
  categories: string[];
}

export interface BasketItemIn {
  query: string;
  quantity: number;
  unit: string;
}

export interface BasketRequest {
  zip_code: string;
  items: BasketItemIn[];
  availability?: AvailabilityFilter;
  /** Compare only stores that are not shut right now. A basket is a trip, and a trip to a
   * closed shop is not a saving. */
  open_now?: boolean;
}

export interface BasketLineOut {
  query: string;
  category: string;
  requested_quantity: DecimalString;
  requested_unit: string;
  needed_quantity: DecimalString;
  comparison_unit: string;
  product_id: number;
  product_name: string;
  brand: string | null;
  offer: OfferOut;
  packs: number;
  line_total: DecimalString;
}

export interface StoreBasketOut {
  store: StoreOut;
  total: DecimalString;
  covers_all_items: boolean;
  missing_items: string[];
  lines: BasketLineOut[];
}

export interface SplitBasketOut {
  total: DecimalString;
  stores: StoreOut[];
  lines: BasketLineOut[];
}

export interface BasketItemResult {
  query: string;
  category: string;
  category_label: string;
  needed_quantity: DecimalString;
  comparison_unit: string;
  matching_products: number;
  cheapest: BasketLineOut | null;
}

export interface BasketResponse {
  zip_code: string;
  availability: AvailabilityFilter;
  /**
   * Whether the server compared only stores that are not shut. Echoed rather than assumed,
   * so the UI renders what was actually applied. `stores` is never narrowed by it: a client
   * that filtered down to nothing still has to name what is shut and when it opens.
   */
  open_now: boolean;
  stores: StoreOut[];
  items: BasketItemResult[];
  single_store_options: StoreBasketOut[];
  cheapest_single_store: StoreBasketOut | null;
  cheapest_split: SplitBasketOut | null;
  savings: DecimalString | null;
  savings_percent: DecimalString | null;
  last_updated_at: IsoDateTime | null;
  oldest_updated_at: IsoDateTime | null;
}

/** Error raised for non-2xx responses, timeouts and network failures. */
export class ApiError extends Error {
  readonly status: number | null;
  readonly detail: unknown;

  constructor(message: string, status: number | null = null, detail: unknown = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }

  get isTimeout(): boolean {
    return this.status === null && this.message.startsWith("Request timed out");
  }

  get isNetwork(): boolean {
    return this.status === null && !this.isTimeout;
  }
}

/** Turn a FastAPI `detail` payload (string, object or validation list) into a readable message. */
export function describeDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (item && typeof item === "object" && "msg" in item) {
        const loc = Array.isArray((item as { loc?: unknown }).loc)
          ? ((item as { loc: unknown[] }).loc.filter((p) => typeof p !== "number") as string[])
          : [];
        const where = loc.filter((p) => p !== "body").join(".");
        const msg = String((item as { msg: unknown }).msg);
        return where ? `${where}: ${msg}` : msg;
      }
      return typeof item === "string" ? item : JSON.stringify(item);
    });
    return parts.join("; ");
  }
  if (detail && typeof detail === "object") {
    return Object.entries(detail as Record<string, unknown>)
      .map(([key, value]) => `${key.replaceAll("_", " ")}: ${formatDetailValue(value)}`)
      .join("; ");
  }
  return "Unexpected error";
}

function formatDetailValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ") || "none";
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const DEFAULT_TIMEOUT_MS = 15_000;
/** POST /scrape is synchronous on the backend and can take a minute or more. */
const SCRAPE_TIMEOUT_MS = 180_000;

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener("abort", onOuterAbort);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new ApiError("Request cancelled");
    if (controller.signal.aborted) {
      throw new ApiError(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new ApiError(`Could not reach the API at ${API_BASE_URL} (${reason})`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }

  if (!response.ok) {
    let detail: unknown;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      detail = payload?.detail ?? payload;
    } catch {
      detail = undefined;
    }
    const message =
      detail !== undefined
        ? describeDetail(detail)
        : `${response.status} ${response.statusText || "error"}`;
    throw new ApiError(message, response.status, detail);
  }

  return (await response.json()) as T;
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>("/health", { signal });
}

/** The ZIP whose Census centroid is nearest to a pair of coordinates. Mirrors `ZipLookupOut`;
 * nearest centroid, not the ZCTA the point lies inside -- see `lookupZip`. */
export interface ZipLookup {
  zip_code: string;
  latitude: number;
  longitude: number;
  /** Miles from the point to that ZIP's Census centroid — how confident the answer is. */
  distance_miles: number;
}

/**
 * Turn browser coordinates into the ZIP every other request takes.
 *
 * The backend answers it from the same vendored Census centroid table it then ranks stores
 * with, so the ZIP a shopper is placed in is the one whose centroid is nearest to where they
 * actually are. No geocoding service is involved and the coordinates are not stored.
 *
 * A 404 is a real answer: a point outside the US has no ZIP, and the caller offers the form.
 */
export function lookupZip(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<ZipLookup> {
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
  return request<ZipLookup>(`/location/zip?${params.toString()}`, { signal });
}

export interface SearchOptions {
  availability?: AvailabilityFilter;
  /** Compare only stores that are not shut right now. The backend decides, per store, in
   * that store's own timezone; a store whose hours nobody publishes is kept. */
  openNow?: boolean;
  /** 1-based page of canonical products. */
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
}

export function searchProducts(
  query: string,
  zipCode: string,
  options: SearchOptions = {},
): Promise<SearchResponse> {
  const { availability = DEFAULT_AVAILABILITY, openNow = false, page, pageSize, signal } = options;
  const params = new URLSearchParams({ q: query, zip_code: zipCode, availability });
  if (openNow) params.set("open_now", "true");
  if (page !== undefined) params.set("page", String(page));
  if (pageSize !== undefined) params.set("page_size", String(pageSize));
  return request<SearchResponse>(`/products/search?${params.toString()}`, { signal });
}

/**
 * Ask the backend to collect this ZIP and category again.
 *
 * Returns quickly whatever happens: the scrape runs in the background. The cooldown is
 * enforced by the API, so `cooling_down` is a normal answer and not an error to handle.
 */
export function refreshPrices(
  zipCode: string,
  query?: string,
  signal?: AbortSignal,
): Promise<RefreshResponse> {
  return request<RefreshResponse>("/products/refresh", {
    method: "POST",
    body: query ? { zip_code: zipCode, query } : { zip_code: zipCode },
    signal,
  });
}

export function getProductOffers(
  productId: number,
  signal?: AbortSignal,
): Promise<ProductOffersResponse> {
  return request<ProductOffersResponse>(`/products/${productId}/offers`, { signal });
}

/**
 * One product's price over time, one series per retailer, store and SKU.
 *
 * `days` is the window, not the whole answer: the backend also returns the newest
 * observation before it, so a steady price still has a line to draw.
 */
/**
 * The backend's own ceiling (`MAX_RANGE_DAYS` in `app/services/price_history.py`). Named
 * here because this file is where the contract lives: asking for more is a 422, and an
 * "All" control that hard-codes a larger number breaks silently when the ceiling moves.
 */
export const MAX_HISTORY_DAYS = 3650;

export function getPriceHistory(
  productId: number,
  days: number,
  signal?: AbortSignal,
): Promise<PriceHistoryResponse> {
  return request<PriceHistoryResponse>(
    `/products/${productId}/price-history?days=${encodeURIComponent(String(days))}`,
    { signal },
  );
}

export function runScrape(body: ScrapeRequest, signal?: AbortSignal): Promise<ScrapeResponse> {
  return request<ScrapeResponse>("/scrape", {
    method: "POST",
    body,
    timeoutMs: SCRAPE_TIMEOUT_MS,
    signal,
  });
}

export function getScrapeOptions(signal?: AbortSignal): Promise<ScrapeOptionsResponse> {
  return request<ScrapeOptionsResponse>("/scrape/options", { signal });
}

export function compareBasket(body: BasketRequest, signal?: AbortSignal): Promise<BasketResponse> {
  return request<BasketResponse>("/basket/compare", { method: "POST", body, signal });
}

/** Message to show a user for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
