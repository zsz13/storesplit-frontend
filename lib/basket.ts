import type { BasketItemIn, BasketRequest } from "@/lib/api";

/** A basket line as edited by the user and persisted in localStorage. */
export interface BasketItem {
  id: string;
  query: string;
  quantity: number;
  unit: string;
}

/**
 * What a quantity measures. It is the whole of why a unit is offered or withheld: the
 * backend compares each staple in one canonical unit, and a quantity can only be converted
 * into that unit if it measures the same *kind* of thing. Eggs are counted, milk is a
 * volume, and everything else here is a weight.
 */
export type Dimension = "count" | "mass" | "volume";

interface UnitOption {
  value: string;
  label: string;
  /**
   * What one press of the quantity stepper is worth in this unit.
   *
   * It follows the size of the unit rather than the item: a gram and a pound are both
   * "1 unit" and one of them is a crumb. It is the control's increment only -- the floor is
   * `minimumFor`, and nothing rejects a quantity for sitting between two steps, because a
   * quantity converted out of another unit almost never lands on the grid.
   */
  step: number;
}

/** Units the backend accepts for basket items, grouped by what they measure. */
export const UNITS_BY_DIMENSION: Record<Dimension, ReadonlyArray<UnitOption>> = {
  count: [
    { value: "count", label: "count", step: 1 },
    { value: "dozen", label: "dozen", step: 1 },
  ],
  mass: [
    { value: "lb", label: "lb", step: 0.5 },
    { value: "oz", label: "oz", step: 1 },
    { value: "g", label: "g", step: 50 },
    { value: "kg", label: "kg", step: 0.25 },
  ],
  volume: [
    { value: "gal", label: "gal", step: 0.5 },
    { value: "qt", label: "qt", step: 1 },
    { value: "pt", label: "pt", step: 1 },
    { value: "fl oz", label: "fl oz", step: 8 },
    { value: "l", label: "L", step: 0.5 },
    { value: "ml", label: "mL", step: 100 },
  ],
};

/** How many of `to` one `from` is, within one dimension. `null` across dimensions. */
const IN_BASE_UNITS: Record<string, { dimension: Dimension; factor: number }> = {
  count: { dimension: "count", factor: 1 },
  dozen: { dimension: "count", factor: 12 },
  oz: { dimension: "mass", factor: 1 },
  lb: { dimension: "mass", factor: 16 },
  g: { dimension: "mass", factor: 0.03527396 },
  kg: { dimension: "mass", factor: 35.27396 },
  "fl oz": { dimension: "volume", factor: 1 },
  pt: { dimension: "volume", factor: 16 },
  qt: { dimension: "volume", factor: 32 },
  gal: { dimension: "volume", factor: 128 },
  ml: { dimension: "volume", factor: 0.033814 },
  l: { dimension: "volume", factor: 33.814 },
};

/** Every unit the backend accepts, flattened — the source of the `BasketUnit` type. */
export const BASKET_UNITS = Object.values(UNITS_BY_DIMENSION).flat();

export type BasketUnit = (typeof BASKET_UNITS)[number]["value"];

/**
 * The staples the backend supports, each with what it measures and a sensible default.
 *
 * The dimension is not decoration: rendering the full twelve-unit list on every row is what
 * let a shopper ask for "bread, 1 count", which the API can only answer with
 * `bread is compared per oz; quantity unit 'count' cannot be converted` — a 422 that failed
 * the whole basket over one line. Bread's own default *was* `count`, so it was the shortest
 * path to the error rather than an unlikely one.
 *
 * It mirrors `app/normalize/categories.py`, which is the source of truth for the comparison
 * unit. `tests/basket.test.ts` asserts every default converts into its category's comparison
 * unit, so the table cannot drift back into the same defect.
 */
export const STAPLES: ReadonlyArray<{
  query: string;
  dimension: Dimension;
  unit: BasketUnit;
  quantity: number;
  /** The unit the backend compares this staple in, from `categories.py`. */
  comparisonUnit: string;
  /**
   * Every query the backend maps to this category, from that category's `query_terms`.
   *
   * All of them, not just the headline one: the API prices "whole milk", "loaf" and
   * "chicken" perfectly well, and a shopper who types one — the item field's own
   * placeholder says `e.g. whole milk` — must not be told it is not a staple. Marking a row
   * invalid here blocks the whole basket, so a list shorter than the backend's turns a
   * working query into a dead end.
   */
  terms: readonly string[];
}> = [
  {
    query: "eggs",
    dimension: "count",
    unit: "dozen",
    quantity: 1,
    comparisonUnit: "count",
    terms: ["eggs", "egg", "dozen eggs"],
  },
  {
    query: "milk",
    dimension: "volume",
    unit: "gal",
    quantity: 1,
    comparisonUnit: "gal",
    terms: ["milk", "whole milk", "2% milk", "dairy milk"],
  },
  {
    query: "chicken breast",
    dimension: "mass",
    unit: "lb",
    quantity: 2,
    comparisonUnit: "lb",
    terms: ["chicken breast", "chicken breasts", "chicken", "boneless chicken"],
  },
  {
    query: "rice",
    dimension: "mass",
    unit: "lb",
    quantity: 5,
    comparisonUnit: "lb",
    terms: ["rice", "white rice", "brown rice", "jasmine rice", "basmati rice"],
  },
  {
    query: "bread",
    dimension: "mass",
    unit: "lb",
    quantity: 1,
    comparisonUnit: "oz",
    terms: ["bread", "sandwich bread", "loaf", "white bread", "wheat bread"],
  },
  {
    query: "butter",
    dimension: "mass",
    unit: "lb",
    quantity: 1,
    comparisonUnit: "lb",
    terms: ["butter", "salted butter", "unsalted butter", "stick butter"],
  },
  {
    query: "bananas",
    dimension: "mass",
    unit: "lb",
    quantity: 3,
    comparisonUnit: "lb",
    terms: ["bananas", "banana", "organic bananas"],
  },
];

/** Every accepted query, to the staple it names. Mirrors `categories.py::_QUERY_INDEX`. */
const STAPLE_BY_TERM = new Map(
  STAPLES.flatMap((staple) => staple.terms.map((term) => [term, staple] as const)),
);

export const STAPLE_QUERIES: readonly string[] = STAPLES.map((s) => s.query);

export const MAX_BASKET_ITEMS = 30;

/**
 * A query as the backend's `category_for_query` reads it: trimmed, collapsed, lowercased,
 * and singular or plural as the staple itself is written.
 *
 * The plural step is what stops `egg` and `eggs` being two rows in one basket. The backend
 * tracks basket items by position and genuinely supports a repeated query, so two lines
 * would price correctly and still be wrong: nobody means to add eggs twice.
 */
export function normalizeQuery(query: string): string {
  const text = query.trim().replace(/\s+/g, " ").toLowerCase();
  return stapleForTerm(text)?.query ?? text;
}

/**
 * The staple a query names, or undefined for anything the backend cannot price.
 *
 * Matches the backend's own resolution order (`categories.py::category_for_query`): the term
 * as written, then with a trailing "s" removed, then with one added. Collapsing every
 * accepted synonym onto one canonical query is also what stops "milk" and "whole milk"
 * becoming two rows of the same milk.
 */
function stapleForTerm(text: string) {
  const singular = text.endsWith("s") ? text.slice(0, -1) : null;
  return (
    STAPLE_BY_TERM.get(text) ??
    (singular ? STAPLE_BY_TERM.get(singular) : undefined) ??
    STAPLE_BY_TERM.get(`${text}s`)
  );
}

export function stapleFor(query: string) {
  return stapleForTerm(query.trim().replace(/\s+/g, " ").toLowerCase());
}

/**
 * The units this item may be measured in.
 *
 * A staple gets exactly the units that convert into its comparison unit — two for eggs, six
 * for milk, four for everything weighed. A query that names no staple gets nothing, because
 * the backend cannot price it at all and a unit would not be the thing wrong with it.
 */
export function unitsFor(query: string): ReadonlyArray<UnitOption> {
  const staple = stapleFor(query);
  return staple ? UNITS_BY_DIMENSION[staple.dimension] : [];
}

/** The offered unit's descriptor, or undefined for a unit this item cannot be measured in. */
export function unitOption(query: string, unit: string): UnitOption | undefined {
  return unitsFor(query).find((u) => u.value === unit);
}

/**
 * The finest unit a dimension offers — the one a single unit of which is the smallest amount
 * a row of that kind can state. Derived from the offered units rather than declared, so it
 * cannot fall out of step with the list a row actually renders.
 */
const smaller = (a: UnitOption, b: UnitOption) =>
  IN_BASE_UNITS[a.value].factor < IN_BASE_UNITS[b.value].factor ? a : b;

const FINEST_UNIT = Object.fromEntries(
  Object.entries(UNITS_BY_DIMENSION).map(([d, units]) => [d, units.reduce(smaller).value]),
) as Record<Dimension, string>;

/**
 * The least of a staple a basket may ask for, expressed in `unit`. `null` when the unit does
 * not fit the item at all.
 *
 * **One of the finest unit the row offers**: one gram for anything weighed, one millilitre
 * for milk, one egg for eggs. It is a floor on what counts as a quantity at all — it rejects
 * zero, a negative, and a number too small to survive the four decimals a row is stored at —
 * and deliberately nothing more.
 *
 * The tempting rule was one of the *comparison* unit, which reads better (1 oz of bread,
 * 1 lb of rice) and is wrong, because it refuses requests the backend answers perfectly well.
 * The backend covers an item with `packs = max(1, ceil(needed / package size))`, so any
 * positive quantity has a correct answer: two quarts of milk is the cheapest way to get two
 * quarts, and half a pound of butter is two of the four sticks in the box. A gallon floor and
 * a pound floor would have silently rewritten both — and StoreSplit rewriting what somebody
 * asked for is the same class of fault as greeting them with an error they did not cause.
 * The floor a row offers is the floor a row can express, and no pack size was consulted for
 * it: a loaf is about 20 oz and a stick of butter is 4, and neither number appears here.
 *
 * Being one *physical* quantity is what makes it survive a unit change: bread's minimum is
 * one gram however the row is written — 0.0022 lb, 0.0353 oz, 0.001 kg.
 */
export function minimumFor(query: string, unit: string): number | null {
  const staple = stapleFor(query);
  if (!staple || !unitOption(query, unit)) return null;
  return convertQuantity(1, FINEST_UNIT[staple.dimension], unit);
}

/** Default quantity and unit for a query; `1 count` for anything that is not a staple. */
export function defaultsFor(query: string): { quantity: number; unit: BasketUnit } {
  const staple = stapleFor(query);
  return staple ? { quantity: staple.quantity, unit: staple.unit } : { quantity: 1, unit: "count" };
}

/**
 * A quantity raised to this item's minimum, and never lowered.
 *
 * Clamping up rather than rejecting is what keeps StoreSplit's own numbers out of the error
 * state: a conversion that lands a hair under the floor, or a row saved by an older build,
 * is repaired in place. A quantity a shopper typed is a different matter — `itemProblem`
 * still reports one that is too small, because silently multiplying what somebody entered is
 * worse than telling them the floor.
 */
export function atLeastMinimum(query: string, quantity: number, unit: string): number {
  const minimum = minimumFor(query, unit);
  if (minimum === null) return quantity;
  return Number.isFinite(quantity) && quantity > minimum ? roundQuantity(quantity) : minimum;
}

/**
 * The same physical amount, written in another unit.
 *
 * A unit control that only swapped the word would reinterpret the number: "1 lb" of bread
 * becoming "1 oz" is a sixteenth of the bread, chosen by nobody. The quantity is converted,
 * then held at the minimum, and a unit that does not fit the item leaves the row alone.
 */
export function withUnit(item: BasketItem, unit: string): BasketItem {
  const converted = convertQuantity(item.quantity, item.unit, unit);
  if (converted === null) return item;
  return { ...item, unit, quantity: atLeastMinimum(item.query, converted, unit) };
}

let counter = 0;
export function newItemId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

export function createItem(
  query: string,
  quantity?: number,
  unit?: string,
  id: string = newItemId(),
): BasketItem {
  const normalized = normalizeQuery(query);
  const defaults = defaultsFor(normalized);
  const chosen = unit ?? defaults.unit;
  return {
    id,
    query: normalized,
    quantity: atLeastMinimum(normalized, quantity ?? defaults.quantity, chosen),
    unit: chosen,
  };
}

/** Why one basket row cannot be priced, in the words shown beneath it. */
export type ItemProblem = "query" | "unit" | "quantity" | "minimum";

/**
 * What is wrong with this row, or null when nothing is.
 *
 * Checked in the order a shopper would: an item nobody can price makes its unit moot, and
 * an impossible unit is worth saying before a quantity is questioned.
 *
 * Every one of these is now something a *person* did. A unit that does not fit its item used
 * to be reachable by simply having an old basket saved — `sanitizeItems` repairs that on
 * load — and StoreSplit's own defaults can no longer produce any of them, which is what
 * stops a shopper opening `/basket` to find the Compare button already disabled.
 */
export function itemProblem(item: BasketItem): ItemProblem | null {
  const staple = stapleFor(item.query);
  if (!staple) return "query";
  if (!UNITS_BY_DIMENSION[staple.dimension].some((u) => u.value === item.unit)) return "unit";
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) return "quantity";
  const minimum = minimumFor(item.query, item.unit);
  if (minimum !== null && item.quantity < minimum) return "minimum";
  return null;
}

/**
 * What to say beneath an offending row.
 *
 * The minimum has to be *named*, in the unit the row is actually written in, or the message
 * is a rule with no number in it: "at least 0.0625 lb" is actionable where "too small" is a
 * puzzle. It is a function rather than a table because that sentence cannot be written
 * without the row.
 */
export function problemMessage(item: BasketItem, problem: ItemProblem): string {
  switch (problem) {
    case "query":
      return "Not a staple StoreSplit compares.";
    case "unit":
      return "This unit does not fit this item.";
    case "quantity":
      return "Enter a quantity greater than zero.";
    case "minimum": {
      const minimum = minimumFor(item.query, item.unit);
      const unit = unitOption(item.query, item.unit)?.label ?? item.unit;
      return `Enter at least ${minimum} ${unit}.`;
    }
  }
}

export type BasketAction =
  | { type: "add"; item: BasketItem }
  | { type: "update"; id: string; patch: Partial<Omit<BasketItem, "id">> }
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "replace"; items: BasketItem[] };

/**
 * Pure reducer for basket edits.
 *
 * Adding a query the basket already holds **merges**, converting the incoming quantity into
 * the row's own unit where the two measure the same thing. Merging used to require the units
 * to match exactly, which is why one basket could hold "eggs, 1 dozen" and "eggs, 6 count"
 * as separate lines — two rows nobody asked for, of the same eggs, priced independently.
 */
export function basketReducer(state: BasketItem[], action: BasketAction): BasketItem[] {
  switch (action.type) {
    case "add": {
      const item = { ...action.item, query: normalizeQuery(action.item.query) };
      if (!item.query) return state;
      return addOrMerge(state, item);
    }
    case "update":
      return state.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i));
    case "remove":
      return state.filter((i) => i.id !== action.id);
    case "clear":
      return [];
    case "replace":
      return sanitizeItems(action.items);
    default:
      return state;
  }
}

/**
 * Fold an item into a basket: into a row it can be added to, or beside one it cannot.
 *
 * A row is the same row when it names the same staple **and** its unit converts. Both halves
 * matter. Without the first, "eggs, 1 dozen" and "egg, 6 count" are two lines of the same
 * eggs, which is the duplicate this change set out to remove. Without the second, a basket
 * holding a legacy "bread / count" row would swallow a new "bread, 2 lb" — there is no
 * quantity a merge of those could produce that means anything, and the two must stay
 * visible: one of them is marked invalid and the shopper decides which to keep.
 */
function addOrMerge(state: BasketItem[], item: BasketItem): BasketItem[] {
  const mergeable = state.find(
    (i) => i.query === item.query && convertQuantity(item.quantity, item.unit, i.unit) !== null,
  );
  if (mergeable) {
    const added = convertQuantity(item.quantity, item.unit, mergeable.unit) ?? 0;
    return state.map((i) =>
      i.id === mergeable.id ? { ...i, quantity: roundQuantity(i.quantity + added) } : i,
    );
  }
  return state.length >= MAX_BASKET_ITEMS ? state : [...state, item];
}

/**
 * A quantity in another unit of the same dimension, or null across dimensions.
 *
 * Display arithmetic only, and it stays that way: this converts what a shopper typed into
 * the row it is merging with, so the number in the input matches the number in their head.
 * Every price, unit price and total is the backend's, computed in Decimal from the unit the
 * request actually carries.
 */
export function convertQuantity(quantity: number, from: string, to: string): number | null {
  const source = IN_BASE_UNITS[from];
  const target = IN_BASE_UNITS[to];
  if (!source || !target || source.dimension !== target.dimension) return null;
  return roundQuantity((quantity * source.factor) / target.factor);
}

/** Four decimals, so 250 g into pounds is 0.5512 rather than 0.5511551999999999. */
function roundQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Validate items loaded from storage; drop anything malformed, merge anything duplicated.
 *
 * The merge matters as much as the validation, and it is the half that was missing. A
 * basket saved by an earlier build can already hold "eggs, 1 dozen" beside "egg, 6 count" --
 * the exact duplicate this change set out to remove -- and fixing it only on the *add* path
 * would leave every shopper who already has one looking at it for ever. Loading is the one
 * moment those rows can be reconciled, so they are, through the same reducer that governs
 * an add: same normalization, same conversion, same refusal to merge across dimensions.
 */
export function sanitizeItems(raw: unknown): BasketItem[] {
  if (!Array.isArray(raw)) return [];
  let items: BasketItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { id, query, quantity, unit } = entry as Record<string, unknown>;
    if (typeof query !== "string" || !query.trim()) continue;
    const qty = typeof quantity === "number" ? quantity : Number(quantity);
    items = addOrMerge(
      items,
      repairItem({
        id: typeof id === "string" && id ? id : newItemId(),
        query: normalizeQuery(query),
        quantity: Number.isFinite(qty) && qty > 0 ? qty : Number.NaN,
        // Lowercased here rather than compared case-insensitively everywhere below: a row
        // written by hand or by an import can say "LB", and matching it as a different unit
        // would discard a perfectly good quantity in favour of the staple default.
        unit: typeof unit === "string" && unit ? unit.trim().toLowerCase() : "",
      }),
    );
  }
  return items.slice(0, MAX_BASKET_ITEMS);
}

/**
 * One stored row, made answerable — the half of loading that was missing.
 *
 * A basket written by an earlier build can hold `bread / count`, and a unit that does not fit
 * its item is not a decision anybody made: bread's own default *was* `count`, so the row is
 * StoreSplit's mistake and the shopper was being asked to fix it. Opening `/basket` therefore
 * greeted them with "This unit does not fit this item" and a dead Compare button, over a
 * basket they had not touched.
 *
 * So a unit the item cannot be measured in is replaced by the category's default. The
 * quantity comes with it where the two units measure the same thing — 500 g of bread is still
 * 500 g when the row is rewritten in pounds — and falls back to the staple's default when
 * they do not, because there is no number of pounds that "1 count" was ever going to mean.
 * Anything below the minimum is raised to it. A query that names no staple is left exactly as
 * it is: that one really is the shopper's, and guessing at what they meant would be worse
 * than saying StoreSplit cannot price it.
 */
function repairItem(item: BasketItem): BasketItem {
  const staple = stapleFor(item.query);
  if (!staple) return { ...item, quantity: Number.isFinite(item.quantity) ? item.quantity : 1 };
  if (unitOption(item.query, item.unit)) {
    // An unreadable quantity falls back to the staple's default rather than to the floor:
    // "1 lb of rice" is what the minimum says, and "5 lb" is what the row meant to say.
    const kept = Number.isFinite(item.quantity) ? item.quantity : staple.quantity;
    return { ...item, quantity: atLeastMinimum(item.query, kept, item.unit) };
  }
  const carried = convertQuantity(item.quantity, item.unit, staple.unit);
  const quantity = carried !== null && Number.isFinite(carried) ? carried : staple.quantity;
  return {
    ...item,
    unit: staple.unit,
    quantity: atLeastMinimum(item.query, quantity, staple.unit),
  };
}

/**
 * Items that can be sent to the API.
 *
 * A basket with any unpriceable row is not sent at all — `BasketView` disables Compare while
 * one exists — so this never silently drops a line. Quietly omitting a row would answer a
 * question the shopper did not ask: they would get a total for four of the five things they
 * chose, with nothing on screen saying which one was left out.
 */
export function validItems(items: BasketItem[]): BasketItem[] {
  return items.filter((i) => itemProblem(i) === null);
}

/** The rows a shopper has to fix or remove before the basket can be compared. */
export function invalidItems(items: BasketItem[]): BasketItem[] {
  return items.filter((i) => itemProblem(i) !== null);
}

export function toBasketRequest(
  zipCode: string,
  items: BasketItem[],
  openNow = false,
): BasketRequest {
  const payload: BasketItemIn[] = validItems(items).map((i) => ({
    query: i.query,
    quantity: i.quantity,
    unit: i.unit,
  }));
  return { zip_code: zipCode, items: payload, open_now: openNow };
}
