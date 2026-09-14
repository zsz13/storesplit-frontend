/**
 * How an offer's stock state is worded, in one place.
 *
 * There is one rule here and everything else follows from it: **`unknown` is two different
 * situations wearing one word.** A retailer that publishes per-store inventory and gave an
 * answer nobody could read has something missing. A retailer that publishes no inventory
 * anywhere -- Trader Joe's sells nothing online; Raley's catalogue runs with inventory
 * tracking off -- has nothing missing at all. The price is real, the product page is real,
 * the store really carries it. Only the shelf count does not exist to be looked up.
 *
 * "Stock unknown" was the wrong sentence for the second case in both directions. It reads
 * as a fault -- as though StoreSplit had failed to check -- and it reads as doubt about the
 * offer, when the offer is as solid as any other. `StoreOut.stock_reporting` is what the
 * backend added to tell them apart, and this module is the only place the difference turns
 * into words, so a card, an offer row and a basket line cannot word it three ways.
 *
 * None of this relaxes anything. An offer that is not `in_stock` is still kept out of the
 * comparison by the backend: it cannot be badged cheapest, cannot lead a card, cannot enter
 * a basket. This decides what the shopper is told, not what they are recommended.
 */

import type { Availability, OfferOut, StockReporting, StoreOut } from "./api";

/** The wording states, which are the three availability states with `unknown` split in two. */
export type StockTone = "in_stock" | "out_of_stock" | "not_published" | "unconfirmed";

export interface StockWording {
  tone: StockTone;
  /** The pill: two or three words, readable on its own. */
  label: string;
  /**
   * The same statement in the narrowest column on the page -- a collapsed card's price
   * block. It lives here rather than in the component that needed it, because a shortened
   * label is still a wording of the same fact: a card saying "Stock not published" and the
   * offer row one click below it saying "Availability not published" is precisely the
   * three-ways-worded failure this module exists to prevent.
   */
  short: string;
  /** One sentence of what it means and what to do, for a tooltip or a caption. */
  detail: string;
}

/** Which of the four wordings an offer gets. */
export function stockTone(
  availability: Availability,
  reporting: StockReporting | undefined,
): StockTone {
  if (availability === "in_stock") return "in_stock";
  if (availability === "out_of_stock") return "out_of_stock";
  // A store whose `stock_reporting` is missing (an older backend) is worded cautiously: an
  // absent field must never be what earns a retailer the "they don't publish it" excuse.
  return reporting === "not_published" ? "not_published" : "unconfirmed";
}

/**
 * What to call this offer's stock state, and why.
 *
 * `retailer` is named in the detail sentence rather than in the label, because the label
 * sits next to the retailer's name already and "Trader Joe's does not publish…" reads as an
 * accusation in a badge and as an explanation in a sentence.
 */
export function stockWording(
  availability: Availability,
  store: Pick<StoreOut, "retailer_name" | "stock_reporting"> | undefined,
): StockWording {
  const tone = stockTone(availability, store?.stock_reporting);
  const retailer = store?.retailer_name ?? "This retailer";
  switch (tone) {
    case "in_stock":
      return {
        tone,
        label: "In stock",
        short: "In stock",
        detail: `${retailer} lists this as on the shelf at this store.`,
      };
    case "out_of_stock":
      return {
        tone,
        label: "Out of stock",
        short: "Out of stock",
        detail: `${retailer} lists this as unavailable at this store.`,
      };
    case "not_published":
      return {
        tone,
        label: "Availability not published",
        short: "Stock not published",
        detail: `${retailer} does not publish live shelf stock. The price, the store and the product page are real, so check in store before you go.`,
      };
    default:
      return {
        tone,
        label: "Stock not confirmed",
        short: "Stock not confirmed",
        detail: `${retailer} publishes stock levels but did not give a usable answer for this item.`,
      };
  }
}

/**
 * Whether every offer shown came from a retailer that publishes no stock at all.
 *
 * The unknown-stock section is mostly these retailers but not only them, so its caption is
 * written from what is actually in it rather than assumed. An empty list is not "all of
 * them": it is nothing, and the caller has no section to caption.
 */
export function allStockUnpublished(offers: readonly OfferOut[]): boolean {
  return (
    offers.length > 0 && offers.every((offer) => offer.store.stock_reporting === "not_published")
  );
}

/**
 * The heading and caption over the products nobody has confirmed.
 *
 * Here rather than in the view for the same reason every other sentence about stock is: it
 * is the same distinction one register up, and a caption that drifts from the pills beneath
 * it is worse than no caption. `everyOfferUnpublished` comes from `allStockUnpublished`,
 * because a section holding one retailer that *does* publish stock must not be captioned as
 * though none of them do.
 */
export function unconfirmedSectionCopy(everyOfferUnpublished: boolean): {
  heading: string;
  caption: string;
} {
  return {
    heading: "Also sold nearby",
    caption: everyOfferUnpublished
      ? "These stores publish a price and a product page, but not live shelf stock. The prices and the links are real. Nobody states what is on the shelf today, so check in store. They never win Cheapest and never enter a basket."
      : "Nobody publishes confirmed stock for these today. The prices and the links are real; whether the item is on the shelf is not stated. They never win Cheapest and never enter a basket.",
  };
}
