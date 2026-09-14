import { describe, expect, it } from "vitest";
import type { HoursTodayOut, StoreOut } from "@/lib/api";
import {
  byOpenState,
  closedStores,
  earliestByRetailer,
  nextOpenings,
  openStores,
  unknownHoursStores,
} from "@/lib/openNow";
import { safeway } from "./fixtures";

function store(id: number, name: string, hours: Partial<HoursTodayOut>): StoreOut {
  return {
    ...safeway,
    id,
    retailer_name: name,
    hours_today: {
      state: "unknown",
      opens_at: null,
      closes_at: null,
      opens_day: null,
      closed_all_day: false,
      next_open_at: null,
      ...hours,
    },
  };
}

const open = store(1, "Safeway", { state: "open", closes_at: "23:00" });
const unknown = store(2, "Raley's", { state: "unknown" });
const shutEarly = store(3, "Lucky", {
  state: "closed",
  opens_at: "06:00",
  opens_day: "tomorrow",
  next_open_at: "2026-09-13T13:00:00Z",
});
const shutLater = store(4, "Trader Joe's", {
  state: "closed",
  opens_at: "08:00",
  opens_day: "tomorrow",
  next_open_at: "2026-09-13T15:00:00Z",
});

describe("grouping stores by what the backend said about them", () => {
  it("separates open, closed and unaccounted-for", () => {
    const all = [shutEarly, unknown, open];

    expect(openStores(all)).toEqual([open]);
    expect(closedStores(all)).toEqual([shutEarly]);
    expect(unknownHoursStores(all)).toEqual([unknown]);
  });

  it("ranks open first, then the ones nobody publishes hours for, then the shut", () => {
    // The same order the backend compares them in, so this list and the prices beside it
    // agree about which shops were preferred.
    expect(byOpenState([shutEarly, unknown, open]).map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it("keeps the distance order the backend sent within each group", () => {
    const nearer = store(10, "A", { state: "open" });
    const further = store(11, "B", { state: "open" });

    expect(byOpenState([nearer, further]).map((s) => s.id)).toEqual([10, 11]);
    expect(byOpenState([further, nearer]).map((s) => s.id)).toEqual([11, 10]);
  });
});

describe("nextOpenings", () => {
  it("orders by the instant and labels with the wall clock", () => {
    const openings = nextOpenings([shutLater, shutEarly]);

    expect(openings.map((o) => o.store.retailer_name)).toEqual(["Lucky", "Trader Joe's"]);
    expect(openings.map((o) => o.opensAt)).toEqual(["06:00", "08:00"]);
  });

  it("sorts by the instant, not by how the wall clock is spelled", () => {
    // Two stores print "8:00 AM"; one of them is three hours earlier. Sorting on the label
    // would order them by coincidence of spelling.
    const eastern = store(20, "Eastern", {
      state: "closed",
      opens_at: "08:00",
      next_open_at: "2026-09-13T12:00:00Z",
    });
    const pacific = store(21, "Pacific", {
      state: "closed",
      opens_at: "08:00",
      next_open_at: "2026-09-13T15:00:00Z",
    });

    expect(nextOpenings([pacific, eastern]).map((o) => o.store.id)).toEqual([20, 21]);
  });

  it("omits a store with no published opening rather than inventing a position for it", () => {
    const shutAllDay = store(30, "Closed Sundays", {
      state: "closed",
      closed_all_day: true,
      opens_at: null,
      next_open_at: null,
    });

    expect(nextOpenings([shutAllDay, unknown, open])).toEqual([]);
  });

  it("ignores an instant that is not a date", () => {
    const broken = store(40, "Broken", {
      state: "closed",
      opens_at: "08:00",
      next_open_at: "not a timestamp",
    });

    expect(nextOpenings([broken])).toEqual([]);
  });
});

describe("earliestByRetailer", () => {
  it("keeps one row per retailer, the one that opens first", () => {
    // A ZIP resolves up to two branches per retailer, so the raw list says the same thing
    // twice. The earlier branch answers "when can I shop again"; the later one is noise.
    const early = store(50, "Safeway", {
      state: "closed",
      opens_at: "06:00",
      next_open_at: "2026-09-13T13:00:00Z",
    });
    const late = store(51, "Safeway", {
      state: "closed",
      opens_at: "07:00",
      next_open_at: "2026-09-13T14:00:00Z",
    });

    const rows = earliestByRetailer(nextOpenings([late, early, traderJoesShut]));

    expect(rows.map((r) => [r.store.retailer_name, r.opensAt])).toEqual([
      ["Safeway", "06:00"],
      ["Trader Joe's", "08:00"],
    ]);
  });

  it("keeps the soonest-first order it was given", () => {
    expect(earliestByRetailer(nextOpenings([shutLater, shutEarly])).map((r) => r.store.id)).toEqual(
      [3, 4],
    );
  });
});

const traderJoesShut = store(52, "Trader Joe's", {
  state: "closed",
  opens_at: "08:00",
  next_open_at: "2026-09-13T15:00:00Z",
});
