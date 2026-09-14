import { describe, expect, it } from "vitest";
import { MAX_BASKET_ITEMS, UNITS_BY_DIMENSION, createItem, type BasketItem } from "@/lib/basket";
import { basketShareUrl, decodeBasket, encodeBasket, SHARE_PARAM } from "@/lib/share";

/** The encoder's own format, so a test can write a payload the encoder would never produce. */
function link(payload: unknown): string {
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const item = (query: string, quantity: number, unit: string): BasketItem =>
  createItem(query, quantity, unit);

describe("a basket in a link", () => {
  it("carries the query, the quantity and the unit, and nothing else", () => {
    const basket = [item("eggs", 2, "dozen"), item("chicken breast", 1.5, "lb")];

    const decoded = decodeBasket(encodeBasket(basket));

    expect(decoded).not.toBeNull();
    expect(decoded?.map((i) => ({ query: i.query, quantity: i.quantity, unit: i.unit }))).toEqual([
      { query: "eggs", quantity: 2, unit: "dozen" },
      { query: "chicken breast", quantity: 1.5, unit: "lb" },
    ]);
  });

  /**
   * Every unit a row can offer survives the trip.
   *
   * A share that quietly rewrote "2 qt of milk" into gallons would be the unit bug this
   * basket already fixed once, arriving by post. The staples below are chosen one per
   * dimension, because a unit is only ever offered to the items it can measure.
   */
  it.each([
    ["eggs", UNITS_BY_DIMENSION.count],
    ["milk", UNITS_BY_DIMENSION.volume],
    ["rice", UNITS_BY_DIMENSION.mass],
  ])("survives every unit %s can be measured in", (query, units) => {
    for (const unit of units) {
      const decoded = decodeBasket(encodeBasket([item(query, 2, unit.value)]));
      expect(decoded?.[0]).toMatchObject({ query, quantity: 2, unit: unit.value });
    }
  });

  it("is deterministic: the same basket is always the same link", () => {
    const basket = [item("bread", 1, "lb"), item("butter", 1, "lb")];
    expect(encodeBasket(basket)).toBe(encodeBasket(basket));
    // The row id is regenerated on every load and is not part of what was shared.
    expect(encodeBasket(basket)).toBe(
      encodeBasket(basket.map((i) => ({ ...i, id: `${i.id}-again` }))),
    );
  });

  it("says nothing about where the sender is", () => {
    const encoded = encodeBasket([item("milk", 1, "gal")]);
    expect(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))).not.toContain("94105");
    expect(basketShareUrl("https://storesplit.test", [item("milk", 1, "gal")])).toBe(
      `https://storesplit.test/basket?${SHARE_PARAM}=${encoded}`,
    );
  });

  it("stays short enough to paste: the whole staple list fits in a text message", () => {
    const every = ["eggs", "milk", "chicken breast", "rice", "bread", "butter", "bananas"].map(
      (query) => item(query, 2, "lb"),
    );
    expect(basketShareUrl("https://storesplit.test", every).length).toBeLessThan(400);
  });
});

/**
 * Everything below arrives from a stranger's address bar.
 *
 * The rule is the same for all of it: a link is read, never trusted and never run. What
 * cannot be read is refused whole, and what can is handed to the same sanitizer a basket
 * loaded from storage goes through, so a shared row can be no stranger than a stored one.
 */
describe("a link that is not a basket", () => {
  it.each([
    ["empty", ""],
    ["not base64url", "eggs milk bread"],
    ["base64 of nothing that parses", link("") + "!!"],
    ["truncated", encodeBasket([item("eggs", 1, "dozen")]).slice(0, 12)],
    ["valid base64 holding no JSON", btoa("hello there").replace(/=+$/, "")],
    ["JSON that is not an object", link([1, 2, 3])],
    ["JSON that is null", link(null)],
    ["a version this build does not know", link({ v: 2, i: [["eggs", 1, "dozen"]] })],
    ["a version that is not a number", link({ v: "1", i: [["eggs", 1, "dozen"]] })],
    ["no rows at all", link({ v: 1, i: [] })],
    ["rows that are not an array", link({ v: 1, i: "eggs" })],
    ["rows of the wrong shape", link({ v: 1, i: [{ query: "eggs" }, ["eggs"], null] })],
    ["a quantity that is not finite", link({ v: 1, i: [["eggs", Number.NaN, "dozen"]] })],
    ["nothing StoreSplit can price", link({ v: 1, i: [["saffron", 1, "count"]] })],
    // 1e305 is finite, so it passes every guard a naive check would make -- and then
    // `roundQuantity` multiplies it by 10000 and returns Infinity, which prints as "-" in
    // the offer preview over a basket that opens holding the staple default instead.
    ["more of a staple than a trip can mean", link({ v: 1, i: [["milk", 1e305, "gal"]] })],
    ["a quantity that is Infinity", link({ v: 1, i: [["milk", Number.POSITIVE_INFINITY, "gal"]] })],
  ])("refuses one that is %s", (_name, value) => {
    expect(decodeBasket(value)).toBeNull();
  });

  it("refuses a payload far larger than any basket, without decoding it", () => {
    expect(decodeBasket("A".repeat(5000))).toBeNull();
  });

  it("drops the rows it cannot price and keeps the rest", () => {
    const decoded = decodeBasket(
      link({
        v: 1,
        i: [
          ["eggs", 1, "dozen"],
          ["saffron", 1, "count"],
          ["milk", 1, "gal"],
        ],
      }),
    );
    expect(decoded?.map((i) => i.query)).toEqual(["eggs", "milk"]);
  });

  /**
   * A unit the item cannot be measured in is *repaired*, not refused, because that is what
   * `sanitizeItems` already does to a basket an older build saved. One rule, one place: a
   * shared "bread / count" and a stored "bread / count" end up as the same row.
   */
  it("repairs a unit the item cannot be measured in", () => {
    const decoded = decodeBasket(link({ v: 1, i: [["bread", 1, "count"]] }));
    expect(decoded?.[0]).toMatchObject({ query: "bread", unit: "lb", quantity: 1 });
  });

  it("raises a quantity below the row's floor rather than pricing zero of something", () => {
    const decoded = decodeBasket(link({ v: 1, i: [["rice", -5, "lb"]] }));
    expect(decoded?.[0].quantity).toBeGreaterThan(0);
  });

  /**
   * Two limits, and the row count is the second of them.
   *
   * Rows past the basket's own cap are cut before anything is merged, which is why sixty
   * "eggs" arrive as thirty: the survivors then fold into the one row of eggs they always
   * were. A link long enough to matter never gets this far -- the length guard above turns
   * it away before a byte is decoded.
   */
  it("cuts a link stuffed with rows at the basket's own limit, then merges what is left", () => {
    const many = Array.from({ length: 60 }, () => ["eggs", 1, "count"]);
    const decoded = decodeBasket(link({ v: 1, i: many }));
    expect(decoded).toHaveLength(1);
    expect(decoded?.[0]).toMatchObject({ query: "eggs", quantity: MAX_BASKET_ITEMS });
  });

  it("cannot reach anything through a prototype", () => {
    const decoded = decodeBasket(
      link({ v: 1, i: [["eggs", 1, "dozen"]], ["__proto__"]: { polluted: true } }),
    );
    expect(decoded?.[0].query).toBe("eggs");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
