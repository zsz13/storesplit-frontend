import type { OfferOut, StoreOut } from "@/lib/api";
import { storeAddressLabel, storeHoursLabel } from "@/lib/format";
import { ItemLink, MapsLink } from "./OfferLinks";
import styles from "./StoreLine.module.css";

interface Props {
  store: StoreOut;
  /** The offer this store is being shown for, when there is one to link to. */
  offer?: OfferOut;
  /**
   * `full` is the block an offer row and a basket line get: branch, address and hours, then
   * the two links. `inline` is the version a collapsed result card gets, where the address
   * would be clutter and the branch and its hours are the point.
   */
  variant?: "full" | "inline";
  /** Name the retailer as well as the branch. Off where the retailer is already beside it. */
  showRetailer?: boolean;
  /**
   * Name the branch. Off inside an offer row, whose first column already does: repeating
   * "Smart & Final San Francisco - Seventh Ave" twice in one row reads as two stores.
   */
  showBranch?: boolean;
}

/**
 * Which shop this price is at, whether it is open, and the two ways out of the page.
 *
 * This component exists because the same four facts were being answered differently in
 * three places: an offer row had an address and hours, a basket line had neither, and a
 * result card had a branch name with nothing attached to it. A shopper comparing eggs and
 * a shopper reading a basket are the same person one screen apart, and "where is it and is
 * it open" should not change shape between them. Search results, expanded offers and
 * basket lines all render this, so the wording, the ordering and the links are the same
 * everywhere by construction rather than by anybody remembering.
 *
 * Everything here is the backend's answer, gated again on the way out. The hours are
 * wall-clock strings decided in the store's own timezone -- never parsed as instants, never
 * recomputed against the shopper's clock. Both links go through the rules in `lib/links.ts`
 * and are simply absent when they do not pass: a store the retailer published no address
 * or coordinates for gets no map link at all, because a pin somewhere near it is worse than
 * no pin, and "Hours not published" is a real answer rather than a gap to paper over.
 */
export function StoreLine({
  store,
  offer,
  variant = "full",
  showRetailer = false,
  showBranch = true,
}: Props) {
  const address = storeAddressLabel(store);
  const hours = store.hours_today;
  const hoursState = hours?.state ?? "unknown";

  return (
    <div className={styles.line} data-variant={variant}>
      <p className={styles.where}>
        {showRetailer ? <span className={styles.retailer}>{store.retailer_name}</span> : null}
        {showBranch ? <span className={styles.branch}>{store.name}</span> : null}
        {/* No street on the collapsed card: a shopper scanning a column of unit prices does
            not need one until they have chosen, and twenty of them is clutter in the one
            place that has to stay scannable. `full` is where the choice is being made. */}
        {variant === "full" && address ? <span className={styles.address}>{address}</span> : null}
        {variant === "full" && !address ? (
          <span className={styles.address}>Address not published</span>
        ) : null}
        {/* Where and when are one statement about the store, so they share a line and the
            branch is what gives way when it will not fit. The two links are a separate
            group: on a phone they take the row below, and pairing the hours with them
            instead cost every card a third line of strip. */}
        <span className={styles.hours} data-state={hoursState}>
          <span className={styles.hoursDot} aria-hidden="true" />
          {storeHoursLabel(hours)}
        </span>
      </p>

      <p className={styles.actions}>
        <MapsLink store={store} />
        {offer ? <ItemLink offer={offer} /> : null}
      </p>
    </div>
  );
}
