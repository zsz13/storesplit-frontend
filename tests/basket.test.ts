import { describe, expect, it } from "vitest";
import {
  STAPLES,
  UNITS_BY_DIMENSION,
  basketReducer,
  convertQuantity,
  createItem,
  defaultsFor,
  invalidItems,
  itemProblem,
  minimumFor,
  normalizeQuery,
  problemMessage,
  sanitizeItems,
  toBasketRequest,
  unitOption,
  unitsFor,
  validItems,
  withUnit,
  type BasketItem,
} from "@/lib/basket";

const eggs: BasketItem = { id: "a", query: "eggs", quantity: 1, unit: "dozen" };
const milk: BasketItem = { id: "b", query: "milk", quantity: 1, unit: "gal" };

describe("basketReducer", () => {
  it("adds items and merges duplicates with the same unit", () => {
    let state = basketReducer([], { type: "add", item: eggs });
    state = basketReducer(state, { type: "add", item: milk });
    expect(state).toHaveLength(2);
    state = basketReducer(state, { type: "add", item: { ...eggs, id: "c", quantity: 2 } });
    expect(state).toHaveLength(2);
    expect(state[0]).toMatchObject({ id: "a", quantity: 3 });
  });

  it("merges a duplicate whose unit differs, converting into the row already there", () => {
    // This used to make a second row. One basket could then hold "eggs, 1 dozen" and
    // "eggs, 6 count" as separate lines -- the same eggs, priced twice, which nobody means.
    const state = basketReducer([eggs], {
      type: "add",
      item: { id: "c", query: "eggs", quantity: 6, unit: "count" },
    });

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ id: "a", unit: "dozen", quantity: 1.5 });
  });

  it("merges the singular and the plural of a staple", () => {
    const state = basketReducer([eggs], {
      type: "add",
      item: { id: "c", query: "egg", quantity: 1, unit: "dozen" },
    });

    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({ query: "eggs", quantity: 2 });
  });

  it("keeps a row beside one it cannot be merged with, rather than swallowing it", () => {
    // Nothing converts a pound into a gallon, so there is no quantity a merge could produce
    // that means anything. Both rows stay visible: one of them is marked invalid and the
    // shopper decides which to keep. Dropping the incoming one would be a button that
    // silently does nothing; merging it would be a number arrived at by ignoring a unit.
    const state = basketReducer([milk], {
      type: "add",
      item: { id: "c", query: "milk", quantity: 2, unit: "lb" },
    });

    expect(state).toHaveLength(2);
    expect(state[1]).toMatchObject({ query: "milk", quantity: 2, unit: "lb" });
  });

  it("merges into the row it can convert into, not merely the first of that query", () => {
    const legacy: BasketItem = { id: "a", query: "bread", quantity: 1, unit: "count" };
    const real: BasketItem = { id: "b", query: "bread", quantity: 1, unit: "lb" };

    const state = basketReducer([legacy, real], {
      type: "add",
      item: { id: "c", query: "bread", quantity: 16, unit: "oz" },
    });

    expect(state).toHaveLength(2);
    expect(state[0], "the unconvertible row is untouched").toEqual(legacy);
    expect(state[1]).toMatchObject({ id: "b", quantity: 2, unit: "lb" });
  });

  it("normalizes the query and ignores empty ones", () => {
    const state = basketReducer([], {
      type: "add",
      item: { ...eggs, query: "  Chicken   Breast " },
    });
    expect(state[0].query).toBe("chicken breast");
    expect(basketReducer([], { type: "add", item: { ...eggs, query: "   " } })).toEqual([]);
  });

  it("updates, removes and clears", () => {
    let state = [eggs, milk];
    state = basketReducer(state, { type: "update", id: "b", patch: { quantity: 2, unit: "qt" } });
    expect(state[1]).toEqual({ id: "b", query: "milk", quantity: 2, unit: "qt" });
    state = basketReducer(state, { type: "remove", id: "a" });
    expect(state.map((i) => i.id)).toEqual(["b"]);
    expect(basketReducer(state, { type: "clear" })).toEqual([]);
  });
});

describe("sanitizeItems", () => {
  it("merges a duplicate a previous build already saved", () => {
    // The reported bug, as it exists in somebody's localStorage right now. Fixing it only
    // on the add path would leave every shopper who already has one looking at it for ever.
    const items = sanitizeItems([
      { id: "1", query: "eggs", quantity: 1, unit: "dozen" },
      { id: "2", query: "egg", quantity: 6, unit: "count" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ query: "eggs", quantity: 1.5, unit: "dozen" });
  });

  it("repairs a legacy row whose unit its item cannot be measured in", () => {
    // `bread / count` is what an older build wrote, because bread's own default was `count`.
    // It is StoreSplit's mistake, so it is repaired to the category default rather than
    // preserved as an error for the shopper to fix. Repaired first, it then merges with the
    // real bread row instead of sitting beside it as a second line of the same bread.
    const items = sanitizeItems([
      { id: "1", query: "bread", quantity: 1, unit: "count" },
      { id: "2", query: "bread", quantity: 2, unit: "lb" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ query: "bread", quantity: 3, unit: "lb" });
    expect(itemProblem(items[0])).toBeNull();
  });

  it("carries the quantity across when the stored unit measures the same thing", () => {
    // 500 g of bread is still 500 g when the row is rewritten in the category's own unit.
    const items = sanitizeItems([{ id: "1", query: "bread", quantity: 500, unit: "g" }]);

    expect(items[0]).toMatchObject({ query: "bread", unit: "g", quantity: 500 });
  });

  it("leaves a query it cannot price alone rather than guessing at it", () => {
    const items = sanitizeItems([{ id: "1", query: "saffron", quantity: 2, unit: "g" }]);

    expect(items[0]).toMatchObject({ query: "saffron", quantity: 2, unit: "g" });
    expect(itemProblem(items[0])).toBe("query");
  });

  it("raises a stored quantity that is under the item's minimum", () => {
    const items = sanitizeItems([{ id: "1", query: "bread", quantity: 0.000001, unit: "lb" }]);

    expect(items[0].quantity).toBe(minimumFor("bread", "lb"));
    expect(itemProblem(items[0])).toBeNull();
  });

  it("drops malformed entries from storage and fills defaults", () => {
    const items = sanitizeItems([
      { id: "1", query: "eggs", quantity: 2, unit: "dozen" },
      { query: "milk", quantity: "abc" },
      { id: "3", quantity: 1 },
      "garbage",
      null,
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ id: "1", query: "eggs", quantity: 2, unit: "dozen" });
    // An unreadable quantity and a missing unit both fall back to the staple's own defaults,
    // not to "1 count" -- which for milk was never a unit the API could price.
    expect(items[1]).toMatchObject({ query: "milk", quantity: 1, unit: "gal" });
    expect(items[1].id).toBeTruthy();
  });

  it("returns an empty list for non-arrays", () => {
    expect(sanitizeItems({})).toEqual([]);
    expect(sanitizeItems(undefined)).toEqual([]);
  });
});

describe("createItem and defaults", () => {
  it("uses staple defaults", () => {
    expect(defaultsFor("Eggs")).toEqual({ quantity: 1, unit: "dozen" });
    expect(defaultsFor("unknown")).toEqual({ quantity: 1, unit: "count" });
    expect(createItem("bananas", undefined, undefined, "x")).toEqual({
      id: "x",
      query: "bananas",
      quantity: 3,
      unit: "lb",
    });
  });
});

describe("toBasketRequest", () => {
  it("builds the API payload from the rows that can be priced", () => {
    const request = toBasketRequest("94105", [
      eggs,
      { id: "z", query: "rice", quantity: 0, unit: "lb" },
      milk,
    ]);

    expect(request).toEqual({
      zip_code: "94105",
      open_now: false,
      items: [
        { query: "eggs", quantity: 1, unit: "dozen" },
        { query: "milk", quantity: 1, unit: "gal" },
      ],
    });
  });

  it("carries the open-now filter", () => {
    expect(toBasketRequest("94105", [eggs], true).open_now).toBe(true);
  });
});

describe("which units a staple offers", () => {
  it("offers only the units that convert into what the backend compares it in", () => {
    expect(unitsFor("eggs").map((u) => u.value)).toEqual(["count", "dozen"]);
    expect(unitsFor("milk").map((u) => u.value)).toEqual(["gal", "qt", "pt", "fl oz", "l", "ml"]);
    expect(unitsFor("bread").map((u) => u.value)).toEqual(["lb", "oz", "g", "kg"]);
    expect(unitsFor("bananas").map((u) => u.value)).toEqual(["lb", "oz", "g", "kg"]);
  });

  it("never offers count for something sold by weight", () => {
    // The reported bug, at its source: "bread + count" produced
    // `bread is compared per oz; quantity unit 'count' cannot be converted`, as a 422 that
    // failed the whole basket. The pairing is now unreachable rather than merely discouraged.
    for (const staple of STAPLES.filter((s) => s.dimension !== "count")) {
      expect(unitsFor(staple.query).map((u) => u.value)).not.toContain("count");
    }
  });

  it("offers nothing for a query the backend cannot price", () => {
    expect(unitsFor("saffron")).toEqual([]);
  });

  it("every staple's default unit converts into its comparison unit", () => {
    // The guard that stops this table drifting back into the same defect. `comparisonUnit`
    // mirrors `app/normalize/categories.py`, and a default that cannot reach it is exactly
    // the 422 this work removed.
    for (const staple of STAPLES) {
      expect(convertQuantity(1, staple.unit, staple.comparisonUnit), staple.query).not.toBeNull();
    }
  });

  it("every offered unit converts into its staple's comparison unit", () => {
    for (const staple of STAPLES) {
      for (const unit of UNITS_BY_DIMENSION[staple.dimension]) {
        expect(
          convertQuantity(1, unit.value, staple.comparisonUnit),
          `${staple.query} in ${unit.value}`,
        ).not.toBeNull();
      }
    }
  });
});

describe("itemProblem", () => {
  it("passes a row that can be priced", () => {
    expect(itemProblem(eggs)).toBeNull();
    expect(itemProblem(milk)).toBeNull();
  });

  it("names the query first, because an unpriceable item makes its unit moot", () => {
    expect(itemProblem({ id: "x", query: "saffron", quantity: 1, unit: "banana" })).toBe("query");
  });

  it("names a unit that does not fit the item", () => {
    expect(itemProblem({ id: "x", query: "bread", quantity: 1, unit: "count" })).toBe("unit");
    expect(itemProblem({ id: "x", query: "milk", quantity: 1, unit: "lb" })).toBe("unit");
  });

  it("names a quantity that is not a positive number", () => {
    expect(itemProblem({ ...eggs, quantity: 0 })).toBe("quantity");
    expect(itemProblem({ ...eggs, quantity: -1 })).toBe("quantity");
    expect(itemProblem({ ...eggs, quantity: Number.NaN })).toBe("quantity");
  });

  it("splits a basket into what can be sent and what blocks it", () => {
    const bad = { id: "x", query: "bread", quantity: 1, unit: "count" };
    const basket = [eggs, bad, milk];

    expect(validItems(basket)).toEqual([eggs, milk]);
    expect(invalidItems(basket)).toEqual([bad]);
  });
});

describe("normalizeQuery", () => {
  it("resolves a staple written singular or plural to one spelling", () => {
    expect(normalizeQuery("Egg")).toBe("eggs");
    expect(normalizeQuery("EGGS ")).toBe("eggs");
    expect(normalizeQuery("banana")).toBe("bananas");
    expect(normalizeQuery("  Chicken   Breast ")).toBe("chicken breast");
  });

  it("accepts every synonym the backend accepts, and collapses it", () => {
    // `categories.py` prices all of these. The item field's own placeholder is
    // "e.g. whole milk", so rejecting one would reject the example the UI offers.
    expect(normalizeQuery("whole milk")).toBe("milk");
    expect(normalizeQuery("2% milk")).toBe("milk");
    expect(normalizeQuery("loaf")).toBe("bread");
    expect(normalizeQuery("white bread")).toBe("bread");
    expect(normalizeQuery("chicken")).toBe("chicken breast");
    expect(normalizeQuery("jasmine rice")).toBe("rice");
    expect(normalizeQuery("organic bananas")).toBe("bananas");
    expect(normalizeQuery("unsalted butter")).toBe("butter");
    expect(normalizeQuery("dozen eggs")).toBe("eggs");
  });

  it("prices a synonym rather than calling it unsupported", () => {
    const row: BasketItem = { id: "x", query: "whole milk", quantity: 1, unit: "gal" };
    expect(itemProblem(createItem(row.query, row.quantity, row.unit))).toBeNull();
    expect(unitsFor("loaf").map((u) => u.value)).toEqual(["lb", "oz", "g", "kg"]);
  });

  it("leaves a query that names no staple as the shopper typed it", () => {
    expect(normalizeQuery("Saffron")).toBe("saffron");
  });
});

describe("convertQuantity", () => {
  it("converts within a dimension", () => {
    expect(convertQuantity(1, "dozen", "count")).toBe(12);
    expect(convertQuantity(1, "lb", "oz")).toBe(16);
    expect(convertQuantity(1, "gal", "qt")).toBe(4);
  });

  it("refuses to convert across dimensions", () => {
    expect(convertQuantity(1, "gal", "lb")).toBeNull();
    expect(convertQuantity(1, "count", "oz")).toBeNull();
    expect(convertQuantity(1, "lb", "nonsense")).toBeNull();
  });
});

describe("minimums, defaults and steps", () => {
  it("gives every staple a default that is valid the moment it is created", () => {
    // The whole of issue 3 in one assertion: nothing StoreSplit creates for a shopper may
    // arrive already in an error state.
    for (const staple of STAPLES) {
      const item = createItem(staple.query);
      expect(itemProblem(item)).toBeNull();
      expect(unitOption(item.query, item.unit)).toBeDefined();
      expect(item.quantity).toBeGreaterThanOrEqual(minimumFor(item.query, item.unit) ?? 0);
    }
  });

  it("offers a step for every unit of every staple", () => {
    for (const staple of STAPLES) {
      for (const unit of unitsFor(staple.query)) {
        expect(unit.step).toBeGreaterThan(0);
        expect(minimumFor(staple.query, unit.value)).toBeGreaterThan(0);
      }
    }
  });

  it("states bread's minimum as one physical amount, whatever unit the row uses", () => {
    // One gram, the finest unit a weighed row offers, written four ways.
    expect(minimumFor("bread", "g")).toBe(1);
    expect(minimumFor("bread", "oz")).toBe(0.0353);
    expect(minimumFor("bread", "lb")).toBe(0.0022);
    expect(minimumFor("bread", "kg")).toBe(0.001);
  });

  it("does not refuse a quantity the backend prices perfectly well", () => {
    // Two quarts of milk and half a pound of butter are ordinary requests. A floor of one
    // comparison unit -- a gallon, a pound -- would have rewritten both.
    expect(itemProblem({ id: "a", query: "milk", quantity: 2, unit: "qt" })).toBeNull();
    expect(itemProblem({ id: "b", query: "butter", quantity: 0.5, unit: "lb" })).toBeNull();
    expect(itemProblem({ id: "c", query: "eggs", quantity: 1, unit: "count" })).toBeNull();
  });

  it("refuses zero, a negative, and anything under the floor", () => {
    const bread = { id: "x", query: "bread", quantity: 1, unit: "lb" };
    expect(itemProblem({ ...bread, quantity: 0 })).toBe("quantity");
    expect(itemProblem({ ...bread, quantity: -2 })).toBe("quantity");
    expect(itemProblem({ ...bread, quantity: Number.NaN })).toBe("quantity");
    expect(itemProblem({ ...bread, quantity: 0.001 })).toBe("minimum");
  });

  it("names the floor in the unit the row is written in", () => {
    const bread = { id: "x", query: "bread", quantity: 0.001, unit: "lb" };
    expect(problemMessage(bread, "minimum")).toBe("Enter at least 0.0022 lb.");
    expect(problemMessage({ ...bread, unit: "oz" }, "minimum")).toBe("Enter at least 0.0353 oz.");
  });

  it("minimumFor is null for a unit the item cannot be measured in", () => {
    expect(minimumFor("bread", "count")).toBeNull();
    expect(minimumFor("milk", "lb")).toBeNull();
    expect(minimumFor("saffron", "g")).toBeNull();
  });
});

describe("withUnit", () => {
  it("preserves the physical quantity through the conversion", () => {
    const bread: BasketItem = { id: "a", query: "bread", quantity: 1, unit: "lb" };
    expect(withUnit(bread, "oz")).toMatchObject({ quantity: 16, unit: "oz" });
    expect(withUnit(bread, "g")).toMatchObject({ quantity: 453.5924, unit: "g" });
    expect(withUnit(bread, "kg")).toMatchObject({ quantity: 0.4536, unit: "kg" });
    // And back again, within the four decimals a row is stored at.
    expect(withUnit(withUnit(bread, "g"), "lb").quantity).toBeCloseTo(1, 3);
  });

  it("holds the result at the minimum rather than producing an invalid row", () => {
    const crumb: BasketItem = { id: "a", query: "bread", quantity: 0.5, unit: "g" };
    const inPounds = withUnit(crumb, "lb");
    expect(inPounds.quantity).toBe(minimumFor("bread", "lb"));
    expect(itemProblem(inPounds)).toBeNull();
  });

  it("leaves the row alone when the unit does not fit the item", () => {
    const bread: BasketItem = { id: "a", query: "bread", quantity: 1, unit: "lb" };
    expect(withUnit(bread, "gal")).toEqual(bread);
  });
});
