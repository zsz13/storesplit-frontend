import { describe, expect, it } from "vitest";
import { mapsLinkHref } from "@/lib/links";
import { storeHoursLabel } from "@/lib/format";
import type { HoursTodayOut, StoreOut } from "@/lib/api";

function store(overrides: Partial<StoreOut> = {}): StoreOut {
  return {
    id: 1,
    retailer_slug: "wholefoods",
    retailer_name: "Whole Foods Market",
    retailer_host: "www.wholefoodsmarket.com",
    stock_reporting: "live",
    name: "Whole Foods SoMa",
    address_line1: "399 4th St",
    city: "San Francisco",
    state: "CA",
    zip_code: "94107",
    latitude: 37.781321,
    longitude: -122.39964,
    timezone: "America/Los_Angeles",
    maps_url: "https://www.google.com/maps/search/?api=1&query=37.781321%2C-122.39964",
    hours_today: {
      state: "unknown",
      opens_at: null,
      closes_at: null,
      opens_day: null,
      closed_all_day: false,
      next_open_at: null,
    },
    ...overrides,
  };
}

describe("mapsLinkHref", () => {
  it("renders a Google Maps link the API built", () => {
    expect(mapsLinkHref(store())).toBe(
      "https://www.google.com/maps/search/?api=1&query=37.781321%2C-122.39964",
    );
  });

  it("renders nothing when the store has no pin", () => {
    expect(mapsLinkHref(store({ maps_url: null }))).toBeNull();
  });

  it("refuses a URL that is not on Google Maps", () => {
    // Same gate as productLinkHref: an href is a destination, so its host is checked here
    // too rather than trusted because the API sent it.
    expect(mapsLinkHref(store({ maps_url: "https://evil.test/maps/search/?api=1" }))).toBeNull();
    expect(mapsLinkHref(store({ maps_url: "http://www.google.com/maps" }))).toBeNull();
    expect(mapsLinkHref(store({ maps_url: "https://www.google.com\\@evil.test/maps" }))).toBeNull();
  });

  it("refuses a Google URL that is not a map", () => {
    // productLinkHref requires a path for the same reason: the host alone does not make a
    // link a destination the user asked for.
    expect(mapsLinkHref(store({ maps_url: "https://www.google.com/search?q=x" }))).toBeNull();
    expect(mapsLinkHref(store({ maps_url: "https://www.google.com/" }))).toBeNull();
  });

  it("refuses a Google host whose path is not a map, however maps-ish the host", () => {
    // `maps.google.com` still hosts things that are not maps. A host that vouches for a
    // destination nobody checked is how a "Maps" label ends up on somewhere else entirely.
    expect(
      mapsLinkHref(store({ maps_url: "https://maps.google.com/local/redirect?url=x" })),
    ).toBeNull();
    expect(mapsLinkHref(store({ maps_url: "https://maps.app.goo.gl/abcdef" }))).toBeNull();
  });

  it("accepts a host that serves a map from its root, and no other host", () => {
    expect(mapsLinkHref(store({ maps_url: "https://maps.google.com/?q=1,2" }))).not.toBeNull();
    expect(
      mapsLinkHref(store({ maps_url: "https://maps.google.com/maps?cid=101957510746820" })),
    ).not.toBeNull();
    expect(mapsLinkHref(store({ maps_url: "https://google.co.uk/maps?q=1,2" }))).toBeNull();
    expect(mapsLinkHref(store({ maps_url: "https://google.com.evil.test/maps" }))).toBeNull();
  });
});

describe("storeHoursLabel", () => {
  const hours = (h: Partial<HoursTodayOut>): HoursTodayOut => ({
    state: "unknown",
    opens_at: null,
    closes_at: null,
    opens_day: null,
    closed_all_day: false,
    next_open_at: null,
    ...h,
  });

  it("says when an open store closes", () => {
    expect(storeHoursLabel(hours({ state: "open", closes_at: "22:00" }))).toBe(
      "Open until 10:00 PM",
    );
  });

  it("says a store that never closes is open, not open until midnight", () => {
    expect(storeHoursLabel(hours({ state: "open", opens_at: "00:00", closes_at: "00:00" }))).toBe(
      "Open 24 hours",
    );
  });

  it("says when a closed store opens", () => {
    expect(
      storeHoursLabel(
        hours({ state: "closed", opens_at: "08:00", opens_day: "today", closed_all_day: false }),
      ),
    ).toBe("Closed · Opens 8:00 AM");
    expect(
      storeHoursLabel(
        hours({ state: "closed", opens_at: "08:00", opens_day: "tomorrow", closed_all_day: false }),
      ),
    ).toBe("Closed · Opens 8:00 AM tomorrow");
    expect(
      storeHoursLabel(
        hours({ state: "closed", opens_at: "09:00", opens_day: "Monday", closed_all_day: false }),
      ),
    ).toBe("Closed · Opens 9:00 AM Monday");
  });

  it("says so when the retailer published today as a day it does not open", () => {
    // A different sentence from "closed for the night": it ends the question rather than
    // answering it, so a shopper stops planning around this shop today.
    expect(storeHoursLabel(hours({ state: "closed", closed_all_day: true }))).toBe("Closed today");
    expect(
      storeHoursLabel(
        hours({
          state: "closed",
          closed_all_day: true,
          next_open_at: null,
          opens_at: "08:00",
          opens_day: "tomorrow",
        }),
      ),
    ).toBe("Closed today · Opens 8:00 AM tomorrow");
  });

  it("admits when nobody published any hours", () => {
    expect(storeHoursLabel(hours({}))).toBe("Hours not published");
    expect(storeHoursLabel(undefined)).toBe("Hours not published");
    // An open state with no closing time states nothing useful either.
    expect(storeHoursLabel(hours({ state: "open" }))).toBe("Open");
  });

  it("formats midnight and noon the way a person reads them", () => {
    expect(storeHoursLabel(hours({ state: "open", closes_at: "00:00" }))).toBe(
      "Open until 12:00 AM",
    );
    expect(storeHoursLabel(hours({ state: "open", closes_at: "12:30" }))).toBe(
      "Open until 12:30 PM",
    );
  });

  // Trader Joe's used to reach this function only ever as `unknown`: its locator publishes a
  // full week and no timezone, and the backend will not read a wall clock it cannot place.
  // The zone now comes from the store's own coordinates, so both real sentences are reachable
  // for it. Nothing in this file changed to make that work -- which is the point of asserting
  // it here: the fix is entirely in the backend, and the browser still re-decides nothing.
  it("says when a Trader Joe's store closes, now that its week can be placed", () => {
    expect(storeHoursLabel(hours({ state: "open", opens_at: "09:00", closes_at: "21:00" }))).toBe(
      "Open until 9:00 PM",
    );
  });

  it("says when a Trader Joe's store opens again once it has shut for the night", () => {
    expect(
      storeHoursLabel(
        hours({
          state: "closed",
          opens_at: "09:00",
          closes_at: "21:00",
          opens_day: "today",
          next_open_at: "2026-09-10T16:00:00Z",
        }),
      ),
    ).toBe("Closed \u00b7 Opens 9:00 AM");
  });
});
