import { describe, expect, it } from "vitest";
import type { OfferOut, StoreOut } from "@/lib/api";
import {
  allStockUnpublished,
  stockTone,
  stockWording,
  unconfirmedSectionCopy,
} from "@/lib/availability";
import { offer, safeway, traderJoes } from "./fixtures";

/**
 * The rule under test: `unknown` is two situations wearing one word, and only one of them
 * is a gap. A retailer that publishes inventory and gave an unreadable answer is missing
 * something; a retailer that publishes none never had it to miss.
 */

function storeWith(overrides: Partial<StoreOut>): StoreOut {
  return { ...safeway, ...overrides };
}

describe("which wording an offer gets", () => {
  it("splits unknown by whether the retailer publishes stock at all", () => {
    expect(stockTone("unknown", "not_published")).toBe("not_published");
    expect(stockTone("unknown", "live")).toBe("unconfirmed");
  });

  it("leaves the two stated answers alone", () => {
    expect(stockTone("in_stock", "not_published")).toBe("in_stock");
    expect(stockTone("out_of_stock", "not_published")).toBe("out_of_stock");
  });

  it("words a missing field cautiously rather than excusing it", () => {
    // An older backend, or a payload that lost the field. "The retailer does not publish
    // this" is a claim about a retailer, and it must never be earned by an absent value.
    expect(stockTone("unknown", undefined)).toBe("unconfirmed");
  });
});

describe("what the shopper is told", () => {
  it("says a retailer does not publish stock, not that stock is unknown", () => {
    const { label, detail } = stockWording("unknown", traderJoes);

    expect(label).toBe("Availability not published");
    expect(label).not.toMatch(/unknown/i);
    expect(detail).toContain("Trader Joe's");
    expect(detail).toMatch(/check in store/i);
  });

  it("names the retailer in the sentence and not in the badge", () => {
    // "Trader Joe's does not publish..." reads as an accusation in a pill and as an
    // explanation in a sentence, and the pill already sits beside the retailer's name.
    expect(stockWording("unknown", traderJoes).label).not.toContain("Trader Joe's");
  });

  it("keeps a real gap sounding like a gap", () => {
    expect(stockWording("unknown", safeway).label).toBe("Stock not confirmed");
  });

  it("says something useful when the store is not known at all", () => {
    expect(stockWording("unknown", undefined).detail).toMatch(/^This retailer/);
  });
});

describe("the shortest wording, for a narrow price column", () => {
  it("says the same thing as the full label, not a different thing", () => {
    // A card reading "Stock not published" over an offer row reading "Availability not
    // published" is the drift this module exists to prevent, so both come from here.
    const { label, short } = stockWording("unknown", traderJoes);
    expect(short).toBe("Stock not published");
    expect(label).toBe("Availability not published");
    expect(short).not.toMatch(/unknown/i);
  });

  it("does not shorten a wording that is already short", () => {
    expect(stockWording("in_stock", safeway).short).toBe("In stock");
    expect(stockWording("out_of_stock", safeway).short).toBe("Out of stock");
    expect(stockWording("unknown", safeway).short).toBe("Stock not confirmed");
  });
});

describe("the section caption", () => {
  it("tells a shopper to check in store when nobody publishes stock", () => {
    const { heading, caption } = unconfirmedSectionCopy(true);
    expect(heading).toBe("Also sold nearby");
    expect(caption).toMatch(/check in store/i);
    expect(caption).toMatch(/never win Cheapest/i);
  });

  it("does not claim nobody publishes stock when somebody does", () => {
    // One retailer in the section that *does* publish stock makes the stronger sentence
    // false, so the caption is written from what the section actually holds.
    const { caption } = unconfirmedSectionCopy(false);
    expect(caption).not.toMatch(/do not publish|not live shelf stock/i);
    expect(caption).toMatch(/not stated/i);
    expect(caption).toMatch(/never win Cheapest/i);
  });
});

describe("captioning a section of unconfirmed products", () => {
  const published = (o: Partial<OfferOut> = {}) => offer({ store: safeway, ...o });
  const silent = (o: Partial<OfferOut> = {}) => offer({ store: traderJoes, ...o });

  it("is true only when every offer came from a retailer that publishes none", () => {
    expect(allStockUnpublished([silent(), silent({ id: 2 })])).toBe(true);
    expect(allStockUnpublished([silent(), published({ id: 3 })])).toBe(false);
  });

  it("treats an empty section as nothing rather than as all of them", () => {
    expect(allStockUnpublished([])).toBe(false);
  });
});

describe("the store fixtures this all rests on", () => {
  it("keeps a retailer that publishes stock apart from one that does not", () => {
    expect(storeWith({ stock_reporting: "live" }).stock_reporting).toBe("live");
    expect(traderJoes.stock_reporting).toBe("not_published");
  });
});
