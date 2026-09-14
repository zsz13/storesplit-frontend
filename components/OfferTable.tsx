import type { OfferOut } from "@/lib/api";
import { AvailabilityPill } from "./AvailabilityPill";
import { PriceBlock } from "./PriceBlock";
import { RelativeTime } from "./RelativeTime";
import { StoreLine } from "./StoreLine";
import { Thumb } from "./Thumb";
import styles from "./OfferTable.module.css";

interface Props {
  offers: OfferOut[];
  category: string;
  packageLabel: string;
  bestOfferId: number | null;
}

/**
 * A list, not an ARIA table.
 *
 * The column headings only exist at desktop width -- below 640px each offer becomes its own
 * block and they are hidden -- so a `role="table"` would be a table whose cells lose their
 * headers at exactly the size where the labels matter most. Each row instead carries its own
 * hidden labels, which read correctly at every width, and the visible headings above are
 * decoration for sighted readers.
 */

/**
 * The evidence behind a card: every retailer, every store, every price.
 *
 * The backend has already ordered these -- in stock first, then by unit price -- because the
 * same order decides which offer the collapsed card shows. Re-sorting here would let the
 * summary and the detail disagree.
 *
 * A grid on desktop with a header row; below 640px each offer becomes its own labelled block,
 * because seven columns of grocery data on a phone is a horizontal scrollbar.
 *
 * Each row's second line is the same `StoreLine` the collapsed card and the basket use, in
 * its full form -- the street address joins the branch, the hours and the two links. One
 * component for all three placements is what keeps "where is it and is it open" from being
 * answered three different ways on three screens.
 */
export function OfferTable({ offers, category, packageLabel, bestOfferId }: Props) {
  return (
    <ul className={styles.table}>
      <li className={styles.head} aria-hidden="true">
        <span className={`${styles.headCell} label`}>Retailer &amp; store</span>
        <span className={`${styles.headCell} label`}>Price</span>
        <span className={`${styles.headCell} label`}>Availability</span>
        <span className={`${styles.headCell} label`}>Updated</span>
      </li>

      {offers.map((offer) => {
        const best = offer.id === bestOfferId;
        return (
          <li
            key={offer.id}
            className={styles.row}
            data-best={best || undefined}
            data-testid="offer-row"
          >
            <div className={styles.store}>
              <Thumb src={offer.image_url} alt="" size="row" />
              <span className={styles.storeText}>
                <span className={styles.retailer}>
                  {offer.store.retailer_name}
                  {best ? <span className={styles.bestTag}>Best</span> : null}
                </span>
                <span className={styles.branch}>{offer.store.name}</span>
              </span>
            </div>

            <div className={styles.price}>
              <span className="sr-only">Price </span>
              <PriceBlock offer={offer} category={category} variant="row" />
              {/* The package label is the product's size. A variable-weight item has none --
                  its price block already says "2.5-5.25 lb, final price based on weight" --
                  and the label would only repeat "per lb" underneath that. */}
              {offer.price_basis === "package" ? (
                <span className={styles.pack}>{packageLabel}</span>
              ) : null}
            </div>

            <div className={styles.availability}>
              <AvailabilityPill
                availability={offer.availability}
                store={offer.store}
                stockStatus={offer.stock_status}
                always
              />
            </div>

            <div className={styles.meta}>
              <span className="sr-only">Price collected </span>
              <RelativeTime className={styles.updated} at={offer.scraped_at} />
            </div>

            <div className={styles.storeDetails}>
              <StoreLine store={offer.store} offer={offer} showBranch={false} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
