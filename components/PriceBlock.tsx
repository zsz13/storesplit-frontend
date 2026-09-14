import type { OfferOut } from "@/lib/api";
import {
  formatMoney,
  formatUnitPrice,
  packPriceLabel,
  parseDecimal,
  secondaryUnitPriceLabel,
  variableWeightNote,
} from "@/lib/format";
import styles from "./PriceBlock.module.css";

interface Props {
  offer: OfferOut;
  category: string;
  /** `lead` is the headline on a collapsed card; `row` is one line in the offer table. */
  variant?: "lead" | "row";
}

/**
 * The product's whole thesis as a layout convention: every price is written twice, and the
 * unit price is the one set large.
 *
 * The list is ranked by unit price, so the unit price is what a shopper scans straight down
 * the column; the pack price -- what you actually hand over -- sits directly beneath it as
 * context. Setting the pack price large instead made the card marked "cheapest overall"
 * carry the biggest number on the page (a $17.49 tray of 150), and the ranking read as no
 * ranking at all.
 *
 * **The second line is not always a pack price, and saying it is was a real bug.** A
 * variable-weight item has no pack price: Target sells chicken at $2.59 *per pound* in trays
 * weighing 2.5-5.25 lb, and the scale at the till decides the total. Rendering `offer.price`
 * as "for the pack" published the rate as if it were the whole cost -- so the same number
 * appeared twice, once correctly as a rate and once as a total five times too small. Here
 * the second line instead says what the retailer says: the weight range, and that the final
 * price depends on it, plus the retailer's own ceiling where it publishes one.
 */
export function PriceBlock({ offer, category, variant = "lead" }: Props) {
  const price = parseDecimal(offer.price);
  const regular = parseDecimal(offer.regular_price);
  // A price below its own regular price is a real reduction the retailer is advertising.
  // Both are quoted on the same basis, so comparing them is comparing like with like.
  const reduced = price !== null && regular !== null && price < regular;
  const loyalty = parseDecimal(offer.loyalty_price);
  const byWeight = offer.price_basis !== "package";
  const packPrice = packPriceLabel(offer);
  const note = variableWeightNote(offer);
  // A restatement of the line above, never a replacement for it; null unless the comparison
  // is already a weight, so a dozen eggs gets no invented ounce.
  const secondary = secondaryUnitPriceLabel(offer);

  return (
    <div className={`${styles.block} ${variant === "row" ? styles.row : styles.lead}`}>
      <span className={`${styles.unit} tabular`}>
        {formatUnitPrice(offer.unit_price, offer.unit_price_unit, category, offer.currency)}
      </span>
      {secondary ? <span className={`${styles.secondary} tabular`}>{secondary}</span> : null}
      {packPrice ? (
        <span className={`${styles.price} tabular`} data-basis={offer.price_basis}>
          {packPrice}
          {/* The screen-reader gloss has to match the basis too: "for the pack" over a
              per-pound rate is the same wrong sentence, read aloud. */}
          <span className="sr-only">{byWeight ? " at most, by weight" : " for the pack"}</span>
        </span>
      ) : null}
      {note ? <span className={styles.weight}>{note}</span> : null}
      {reduced ? (
        <span className={styles.was}>
          <span className="sr-only">Regular price </span>
          <s className="tabular">{formatMoney(offer.regular_price, offer.currency)}</s>
        </span>
      ) : null}
      {loyalty !== null ? (
        <span className={styles.loyalty} title="Requires the retailer's loyalty card">
          {formatMoney(offer.loyalty_price, offer.currency)} with card
        </span>
      ) : null}
    </div>
  );
}
