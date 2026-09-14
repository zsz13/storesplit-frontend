import type { StoreOut } from "@/lib/api";

/**
 * Reading the backend's open/closed answer. Never computing one.
 *
 * `hours_today` was decided in the store's own timezone, on the server. Everything here
 * sorts and groups that answer; nothing re-derives it from the browser's clock, which is the
 * shopper's clock and not the shop's.
 */

export function openStores(stores: readonly StoreOut[]): StoreOut[] {
  return stores.filter((s) => s.hours_today.state === "open");
}

export function closedStores(stores: readonly StoreOut[]): StoreOut[] {
  return stores.filter((s) => s.hours_today.state === "closed");
}

/** Stores whose retailer publishes no hours anywhere StoreSplit may read them. */
export function unknownHoursStores(stores: readonly StoreOut[]): StoreOut[] {
  return stores.filter((s) => s.hours_today.state === "unknown");
}

/**
 * Confirmed-open stores first, then the ones whose hours nobody publishes.
 *
 * The same order the backend compares them in, so a list on screen and the prices beside it
 * agree about which shops were preferred. Within each group the distance order the backend
 * sent is preserved.
 */
export function byOpenState(stores: readonly StoreOut[]): StoreOut[] {
  return [...openStores(stores), ...unknownHoursStores(stores), ...closedStores(stores)];
}

export interface NextOpening {
  store: StoreOut;
  /** Local wall clock at that store, "08:00". What to print. */
  opensAt: string;
  /** "today", "tomorrow", or a weekday name. */
  opensDay: string | null;
  /** The same moment as an epoch millisecond. What to sort by. */
  at: number;
}

/**
 * Which shut store opens first, second, third.
 *
 * Ordered by `next_open_at`, an absolute instant, and **labelled** with `opens_at`, a wall
 * clock. Sorting by the label would order by coincidence of spelling: a store in Reno and a
 * store in San Francisco both print "8:00 AM", and for one week in eight they are an hour
 * apart. A store with no published opening to wait for is not here at all — there is no
 * honest position in this list for a time nobody stated.
 */
export function nextOpenings(stores: readonly StoreOut[]): NextOpening[] {
  const openings: NextOpening[] = [];
  for (const store of closedStores(stores)) {
    const { next_open_at: instant, opens_at: opensAt, opens_day: opensDay } = store.hours_today;
    if (!instant || !opensAt) continue;
    const at = Date.parse(instant);
    if (Number.isNaN(at)) continue;
    openings.push({ store, opensAt, opensDay, at });
  }
  return openings.sort((a, b) => a.at - b.at || a.store.name.localeCompare(b.store.name));
}

/**
 * The earliest opening for each retailer, soonest first.
 *
 * A ZIP resolves up to two branches per retailer, so the raw list says "Safeway opens 6:00
 * AM" twice and "99 Ranch Market opens 8:00 AM" twice -- ten near-identical rows for six
 * answers. The question a shut-out shopper is asking is when they can shop again, and the
 * earlier of two Safeways answers it; the later one is noise in the one place that has to
 * be read at a glance. The full list is a click away behind "Show all stores".
 */
export function earliestByRetailer(openings: readonly NextOpening[]): NextOpening[] {
  const earliest = new Map<string, NextOpening>();
  for (const opening of openings) {
    // `openings` arrives sorted, so the first sighting of a retailer is its earliest.
    if (!earliest.has(opening.store.retailer_name)) {
      earliest.set(opening.store.retailer_name, opening);
    }
  }
  return [...earliest.values()];
}
