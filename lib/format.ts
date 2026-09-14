/** Display-only formatting helpers. No price math happens here beyond parsing for display. */

import type { HoursTodayOut, PriceBasis } from "./api";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatterCache = new Map<string, Intl.NumberFormat>([["USD", usd]]);

function currencyFormatter(currency: string, decimals?: number): Intl.NumberFormat {
  const code = currency.toUpperCase();
  const key = decimals === undefined ? code : `${code}:${decimals}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    const options: Intl.NumberFormatOptions = { style: "currency", currency: code };
    if (decimals !== undefined) {
      options.minimumFractionDigits = decimals;
      options.maximumFractionDigits = decimals;
    }
    try {
      formatter = new Intl.NumberFormat("en-US", options);
    } catch {
      // An unreadable currency code falls back to dollars. It must not also fall back to
      // two decimals: the caller that asked for four asked because two of them round a real
      // price to "$0.00".
      formatter = new Intl.NumberFormat("en-US", { ...options, currency: "USD" });
    }
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/** Parse a backend decimal string ("4.99") or number. Returns null when not a finite number. */
export function parseDecimal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "4.99" -> "$4.99". Null/invalid -> em dash. */
export function formatMoney(
  value: string | number | null | undefined,
  currency: string = "USD",
): string {
  const n = parseDecimal(value);
  if (n === null) return "-";
  return currencyFormatter(currency).format(n);
}

/** Just the symbol, for an axis title like "$ / lb". Same cached, guarded formatter as
 * `formatMoney`, so an unreadable currency code falls back to dollars in one place. */
export function currencySymbol(currency: string = "USD"): string {
  const parts = currencyFormatter(currency).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? "$";
}

/** Percentage from a decimal string, e.g. "12.5" -> "12.5%". */
export function formatPercent(value: string | number | null | undefined): string {
  const n = parseDecimal(value);
  if (n === null) return "-";
  const rounded = Math.round(n * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** Trim a decimal string for display: "12.0000" -> "12", "0.5000" -> "0.5". */
export function formatQuantity(value: string | number | null | undefined): string {
  const n = parseDecimal(value);
  if (n === null) return "-";
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

const UNIT_LABELS: Record<string, string> = {
  count: "each",
  each: "each",
  item: "each",
  gal: "gal",
  qt: "qt",
  pt: "pt",
  "fl oz": "fl oz",
  fl_oz: "fl oz",
  floz: "fl oz",
  l: "L",
  ml: "mL",
  lb: "lb",
  oz: "oz",
  g: "g",
  kg: "kg",
};

/** Human label for a unit key, with a category-aware label for counted items (eggs -> "egg"). */
export function unitLabel(unit: string | null | undefined, category?: string | null): string {
  if (!unit) return "";
  const key = unit.trim().toLowerCase();
  if ((key === "count" || key === "each" || key === "item") && category === "eggs") return "egg";
  return UNIT_LABELS[key] ?? unit;
}

/** "0.42" + "count" (eggs) -> "$0.42 / egg". */
export function formatUnitPrice(
  unitPrice: string | number | null | undefined,
  unit: string | null | undefined,
  category?: string | null,
  currency: string = "USD",
): string {
  const n = parseDecimal(unitPrice);
  if (n === null) return "-";
  const label = unitLabel(unit, category);
  return label ? `${formatMoney(n, currency)} / ${label}` : formatMoney(n, currency);
}

/** The exact factor between the two mass units a grocery price is ever quoted in. */
const OUNCES_PER_POUND = 16;

// A Map rather than an object literal, because an object answers to "constructor",
// "toString" and "__proto__" with inherited members, and a function is not nullish -- a
// `?? null` guard lets them straight through, and a unit called "constructor" would be
// weighed and priced like a pound.
const MASS_UNITS = new Map<string, "lb" | "oz">([
  ["lb", "lb"],
  ["lbs", "lb"],
  ["pound", "lb"],
  ["pounds", "lb"],
  ["oz", "oz"],
  ["ounce", "oz"],
  ["ounces", "oz"],
]);

/** "lb"/"oz" for a unit prices can be weighed in, null for counts, volumes and anything else. */
function massUnit(unit: string | null | undefined): "lb" | "oz" | null {
  if (!unit) return null;
  return MASS_UNITS.get(unit.trim().toLowerCase()) ?? null;
}

/**
 * The same price written in the other ounce/pound unit: "\u2248 $0.16 / oz" under "$2.59 / lb".
 *
 * It is a convenience and nothing more. The line above it stays the backend's canonical unit
 * price -- the number the list is ranked by -- and this one is never substituted for it, so
 * which unit a shopper happens to think in cannot change what the page calls cheapest.
 *
 * The value comes from the backend's normalized unit price and nothing else. Where the
 * retailer quotes the second unit itself, that is the very figure the backend divided or
 * multiplied by sixteen to get the comparison price, so converting it back returns what the
 * retailer said: 4-decimal quantization moves a per-pound figure by at most $0.0008, and it
 * takes $0.005 to move a cent. Reading `price` directly instead would be a second source for
 * one number, able to disagree with the line above it and never able to change what is
 * printed.
 *
 * A conversion only happens at all when the comparison unit is a weight: a dozen eggs
 * compared per egg and milk compared per gallon have no second weight unit to offer, and
 * inventing one would be a sentence about a quantity nobody sells.
 */
export function secondaryUnitPriceLabel(offer: {
  unit_price: string | number | null;
  unit_price_unit: string | null;
  currency: string;
}): string | null {
  const primary = massUnit(offer.unit_price_unit);
  if (primary === null) return null;
  const canonical = parseDecimal(offer.unit_price);
  if (canonical === null || canonical <= 0) return null;

  const secondary = primary === "lb" ? "oz" : "lb";
  const value = secondary === "oz" ? canonical / OUNCES_PER_POUND : canonical * OUNCES_PER_POUND;

  const money = approximateMoney(value, offer.currency);
  return money === null ? null : `\u2248 ${money} / ${secondary}`;
}

/**
 * Money at the page's usual two decimals, widened only far enough that something which costs
 * money does not read as free.
 *
 * Dividing a per-pound rate by sixteen is the one place on the page where a real price can
 * round away: "$0.00 / oz" is a more confident lie than the four decimals it takes to say
 * $0.0025. Below what even those can show there is no honest figure left, and the caller
 * drops the line rather than print a zero.
 */
function approximateMoney(value: number, currency: string): string | null {
  for (const decimals of [2, 4]) {
    if (Math.round(value * 10 ** decimals) >= 1) {
      return currencyFormatter(currency, decimals).format(value);
    }
  }
  return null;
}

/**
 * Package size for a product: "12 ct", "64 fl oz", "2.5 lb", or "per lb" when the product is
 * sold by weight without a fixed package.
 */
export function formatPackage(product: {
  count: number | null;
  quantity: string | number | null;
  quantity_unit: string | null;
  comparison_unit: string;
}): string {
  const parts: string[] = [];
  if (product.count && product.count > 0) parts.push(`${product.count} ct`);
  const quantity = parseDecimal(product.quantity);
  if (quantity !== null && quantity > 0 && product.quantity_unit) {
    const unit = unitLabel(product.quantity_unit);
    parts.push(
      unit === "each" ? `${formatQuantity(quantity)} ct` : `${formatQuantity(quantity)} ${unit}`,
    );
  }
  if (parts.length === 0) return `per ${unitLabel(product.comparison_unit)}`;
  return Array.from(new Set(parts)).join(" · ");
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "5 min ago", "3 h ago", "2 d ago", "just now". Deterministic given `now`. */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!iso) return "unknown";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const diff = now - then;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} d ago`;
  const months = Math.floor(diff / (30 * DAY));
  return months < 12 ? `${months} mo ago` : `${Math.floor(months / 12)} y ago`;
}

/** Absolute local time for tooltips. */
export function formatAbsoluteTime(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Retailer + store label, e.g. "Safeway · Market St". */
export function storeLabel(store: { retailer_name: string; name: string }): string {
  const branch = store.name?.trim();
  if (!branch) return store.retailer_name;
  // Several retailers name a branch with the chain in front of it -- "Smart & Final Daly
  // City" -- and "Smart & Final · Smart & Final Daly City" is one name said twice. It also
  // pushed the chart legend past its column and truncated away the part that identifies
  // which shop it is, which is the only part that was doing any work.
  if (branch.toLowerCase().includes(store.retailer_name.toLowerCase())) return branch;
  return `${store.retailer_name} · ${branch}`;
}

/**
 * A store's street address on one line, or null when the retailer published none.
 *
 * The city alone is not an address -- it is what a store has when only its ZIP centroid is
 * known -- so a record without a street produces nothing rather than "San Francisco, CA".
 */
export function storeAddressLabel(store: {
  address_line1: string | null;
  city: string | null;
  state: string | null;
}): string | null {
  if (!store.address_line1) return null;
  const locality = [store.city, store.state].filter(Boolean).join(", ");
  return locality ? `${store.address_line1}, ${locality}` : store.address_line1;
}

/**
 * Tokens whose casing is not a capitalised word, keyed by how the backend stores them.
 *
 * Short and evidence-led on purpose: every entry is a token that actually appears in
 * `canonical_products.normalized_name`. Guessing at a wider dictionary of acronyms is how a
 * title-caser starts shouting "OZ" and "LB" at ordinary words.
 */
const CASED_TOKENS = new Map<string, string>([
  ["usda", "USDA"],
  ["uht", "UHT"],
  ["gmo", "GMO"],
  ["dha", "DHA"],
  ["a2", "A2"],
  ["aa", "AA"], // the egg grade; "grade aa large eggs"
]);

/**
 * Words that stay lowercase inside a title, but never at either end of one.
 *
 * `normalize_title` already strips "the", "and", "with", "of", "a" and "an" as noise, so this
 * is the short remainder that survives into a stored name or a brand -- "365 by Whole Foods
 * Market", "extra long enriched rice in bag".
 */
const MINOR_WORDS = new Set(["by", "for", "in", "on", "to", "or", "per", "from", "at", "de"]);

/** True for a token that already states its own casing, or has none to state. */
function alreadyCased(word: string): boolean {
  // A word carrying any capital came from something that meant it -- a retailer title a
  // future backend preserves, or a fixture -- and must survive untouched. A word starting
  // with a digit ("2", "365", "100pct") has no first letter to raise.
  return /[A-Z]/.test(word) || /^[0-9]/.test(word);
}

/**
 * "premium med grain rice" -> "Premium Med Grain Rice".
 *
 * A hyphen and a slash are word breaks; an apostrophe is **not**. Treating one as a break
 * writes "Joe'S", because the apostrophe in a product name is overwhelmingly a possessive
 * rather than the start of a name. "O'brien" is what that costs, and it is the cheaper
 * mistake -- and a rare one here, since `normalize_title` strips apostrophes before either
 * shape can reach this.
 */
function capitalizeWord(word: string): string {
  return word.replace(
    /(^|[-/])([a-z])/g,
    (_, break_: string, letter: string) => break_ + letter.toUpperCase(),
  );
}

/**
 * A stored product or brand name as a person would write it.
 *
 * The backend's `normalize_title` lowercases everything and strips punctuation so two
 * retailers' titles can be *matched*; it was never a display string, and "premium med grain
 * rice" set as a product heading reads like a database row. This is the one place that is
 * repaired, and it is repaired for display only -- `OfferOut.title` keeps the retailer's own
 * words exactly as the retailer wrote them, because that is the string a shopper will see
 * again on the retailer's own page.
 *
 * Three rules, in order, so it cannot shout:
 *   1. A word that already carries a capital, or starts with a digit, is left exactly as it
 *      is. Whatever produced it meant it, and a future backend that preserves retailer casing
 *      needs no change here.
 *   2. A known token is cased as that token ("usda" -> "USDA"), never as a word.
 *   3. Everything else is capitalised, except a minor word that is neither first nor last.
 */
export function titleCaseName(text: string | null | undefined): string {
  if (!text) return "";
  const words = text.trim().split(/\s+/);
  return words
    .map((word, index) => {
      if (alreadyCased(word)) return word;
      const known = CASED_TOKENS.get(word.toLowerCase());
      if (known) return known;
      const minor = index > 0 && index < words.length - 1 && MINOR_WORDS.has(word);
      return minor ? word : capitalizeWord(word);
    })
    .join(" ");
}

/** Product display name, e.g. "Long Grain Brown Rice" (brand is shown separately). */
export function productTitle(product: { brand: string | null; normalized_name: string }): string {
  return titleCaseName(product.normalized_name);
}

/** A brand as a label: "365 by whole foods market" -> "365 by Whole Foods Market". */
export function brandLabel(brand: string | null | undefined): string {
  return titleCaseName(brand);
}

/**
 * A countdown as `m:ss`, or `0:07` under a minute. Used for the refresh cooldown, where the
 * shape has to stay stable as the number shrinks so the button does not resize every second.
 */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Today's hours as one short sentence: "Open until 10:00 PM", "Closed \u00b7 Opens 8:00 AM",
 * or "Hours not published".
 *
 * "Hours not published", not "unavailable": the same correction `lib/availability.ts` makes
 * for stock. Several retailers publish no hours on any surface the backend is allowed to
 * read, and "unavailable" reads as a lookup that failed rather than as a fact about the
 * retailer. The two absences are now worded alike wherever a store appears.
 *
 * The backend decided open/closed in the store's own timezone; these are wall-clock strings,
 * so they are formatted, never parsed as instants. A state with no time behind it says only
 * what it knows -- an open store whose closing time nobody published is just "Open".
 */
export function storeHoursLabel(hours: HoursTodayOut | undefined | null): string {
  if (!hours || hours.state === "unknown") return "Hours not published";
  if (hours.state === "open") {
    // A window that opens and closes at the same clock is a shop that does not close.
    // "Open until 12:00 AM" would be true only by arithmetic, and wrong to anyone reading it.
    if (hours.opens_at && hours.opens_at === hours.closes_at) return "Open 24 hours";
    const closes = clockLabel(hours.closes_at);
    return closes ? `Open until ${closes}` : "Open";
  }
  // A day the retailer published as shut is a different sentence from a shop that has simply
  // closed for the night: "Closed today" ends the question, where "Opens 8:00 AM" answers it.
  const opens = clockLabel(hours.opens_at);
  if (hours.closed_all_day) {
    const day = hours.opens_day && hours.opens_day !== "today" ? ` ${hours.opens_day}` : "";
    return opens ? `Closed today \u00b7 Opens ${opens}${day}` : "Closed today";
  }
  if (!opens) return "Closed";
  const day = hours.opens_day && hours.opens_day !== "today" ? ` ${hours.opens_day}` : "";
  return `Closed \u00b7 Opens ${opens}${day}`;
}

/** "22:00" -> "10:00 PM". Null for anything that is not a wall clock. */
export function clockLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const suffix = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

/**
 * What a shopper actually hands over, and what they are handing it over *for*.
 *
 * A fixed package has one price, so it reads as one: "$4.99". A variable-weight item has no
 * single price at all -- the scale at the till decides -- so it must not be shown as one.
 * The reported bug was exactly that: "$2.59" rendered as the pack price when $2.59 was the
 * per-pound rate, so the cheapest-looking chicken on the page was five times what it said.
 *
 * `null` means there is nothing honest to put on this line, and the caller shows the weight
 * range instead.
 */
export function packPriceLabel(offer: {
  price: string | number | null;
  price_basis: PriceBasis;
  max_total_price: string | number | null;
  currency: string;
}): string | null {
  if (offer.price_basis === "package") return formatMoney(offer.price, offer.currency);
  // Only the retailer's own ceiling is ever shown. Multiplying the rate by the top of the
  // published weight range would print a different, wronger number in the same confident
  // typeface: Target charges at most $12.95 for a tray its own title tops out at 5.25 lb.
  const maximum = parseDecimal(offer.max_total_price);
  return maximum === null ? null : `up to ${formatMoney(maximum, offer.currency)}`;
}

/**
 * The published weight span as one phrase: "2.5-5.25 lb". Null when the retailer named none,
 * which is the ordinary case -- most packages have a fixed size.
 */
export function weightRangeLabel(offer: {
  min_weight: string | number | null;
  max_weight: string | number | null;
  weight_unit: string | null;
}): string | null {
  const low = parseDecimal(offer.min_weight);
  const high = parseDecimal(offer.max_weight);
  if (low === null || high === null || !offer.weight_unit) return null;
  return `${formatQuantity(low)}\u2013${formatQuantity(high)} ${unitLabel(offer.weight_unit)}`;
}

/**
 * The sentence under a variable-weight price, or null for a fixed package.
 *
 * It says the thing the price cannot: that this number is a rate and the total depends on
 * what the item weighs. Retailers word it "Final price based on weight"; so does this.
 */
export function variableWeightNote(offer: {
  price_basis: PriceBasis;
  min_weight: string | number | null;
  max_weight: string | number | null;
  weight_unit: string | null;
}): string | null {
  if (offer.price_basis === "package") return null;
  const range = weightRangeLabel(offer);
  return range ? `${range} \u00b7 final price based on weight` : "final price based on weight";
}

/**
 * What a basket line is counting: "3 × $4.99" for packages, "3 lb × $2.59" for a rate.
 *
 * The backend divides what you need by the product's comparison quantity, which for a
 * weighed product is one pound — so the count is a pound count, and printing it as a bare
 * multiplier says three trays where it means three pounds. The arithmetic was right either
 * way; the noun was not.
 */
export function basketLineLabel(line: {
  packs: number;
  offer: { price: string | number | null; price_basis: PriceBasis; currency: string };
}): string {
  const price = formatMoney(line.offer.price, line.offer.currency);
  if (line.offer.price_basis === "package") return `${line.packs} × ${price}`;
  return `${line.packs} ${unitLabel(line.offer.price_basis)} × ${price}`;
}
