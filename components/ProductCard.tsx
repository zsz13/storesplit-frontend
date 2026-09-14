"use client";

import { useId, useState } from "react";
import type { ProductOut } from "@/lib/api";
import {
  brandLabel,
  formatMoney,
  formatPackage,
  formatUnitPrice,
  productTitle,
  secondaryUnitPriceLabel,
  variableWeightNote,
} from "@/lib/format";
import { AvailabilityPill } from "./AvailabilityPill";
import { ChevronDown } from "./Icon";
import { OfferTable } from "./OfferTable";
import { PriceHistoryDialog } from "./PriceHistoryDialog";
import { PriceBlock } from "./PriceBlock";
import { StoreLine } from "./StoreLine";
import { Thumb } from "./Thumb";
import styles from "./ProductCard.module.css";

interface Props {
  product: ProductOut;
  /** The cheapest offer across the whole search, not just this page. */
  cheapestOfferId: number | null;
}

/**
 * One canonical product: collapsed to its answer, expandable to its evidence.
 *
 * Collapsed the card is two bands. The upper one is the comparison -- thumbnail, name, and
 * the best confirmed in-stock price, with the unit price in the headline slot because the
 * list is ranked by it. The lower one is the store strip: which shop that price is at,
 * whether it is open, and the two links out. The strip is new on the collapsed card and it
 * is the answer to the question the old card left hanging -- it named a branch and gave a
 * shopper no way to act on it, so choosing a store meant expanding a disclosure first.
 * The street address still waits for the expansion: it is the one part of "where" that a
 * shopper scanning a column of prices genuinely does not need yet.
 *
 * It never shows a price nobody can act on: `best_offer` is populated by the API only when
 * the leading offer is `in_stock`, so a product whose offers are all unknown or out of
 * stock says so instead of quoting a number as though it were an answer.
 */
export function ProductCard({ product, cheapestOfferId }: Props) {
  const [open, setOpen] = useState(false);
  // Opened deliberately, and mounted only once it has been: the dialog fetches a table that
  // grows for ever, and twenty cards on a page must not each cost that query on render.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyUsed, setHistoryUsed] = useState(false);
  const panelId = useId();

  const best = product.best_offer;
  const isCheapestOverall = best !== null && best.id === cheapestOfferId;
  const packageLabel = formatPackage(product);
  // The offers arrive already ranked, so the first is the best thing on offer whatever its
  // state -- the one to quote when there is no confirmed leader.
  const leading = product.offers[0] ?? null;
  const shown = best ?? leading;
  const weightNote = leading ? variableWeightNote(leading) : null;
  // The same convenience the buyable cards carry. It follows the unit price, not the stock
  // status: an ounce line that came and went down the column would read as a fact about the
  // product rather than about its price.
  const leadingOunces = leading ? secondaryUnitPriceLabel(leading) : null;

  return (
    <article className={`card ${styles.card}`} data-cheapest={isCheapestOverall || undefined}>
      <div className={styles.main}>
        <Thumb src={product.image_url} alt={productTitle(product)} />

        <div className={styles.text}>
          {product.brand ? <span className={styles.brand}>{brandLabel(product.brand)}</span> : null}
          <h3 className={styles.name}>{productTitle(product)}</h3>
          <p className={styles.facts}>
            <span className={styles.pack}>{packageLabel}</span>
            <Dot />
            <span>
              {product.offer_count} offer{product.offer_count === 1 ? "" : "s"} at{" "}
              {product.retailer_count} retailer{product.retailer_count === 1 ? "" : "s"}
            </span>
            {product.price_low && product.price_high && product.price_low !== product.price_high ? (
              <>
                <Dot />
                <span className="tabular">
                  {formatMoney(product.price_low, leading?.currency ?? "USD")}–
                  {formatMoney(product.price_high, leading?.currency ?? "USD")}
                </span>
              </>
            ) : null}
          </p>
        </div>

        <div className={styles.priceCol}>
          {isCheapestOverall ? (
            <span className={styles.cheapestBadge}>Cheapest overall</span>
          ) : null}
          {best ? (
            <>
              <PriceBlock offer={best} category={product.category} />
              <span className={styles.at}>at {best.store.retailer_name}</span>
            </>
          ) : (
            <div className={styles.unbuyable}>
              {/*
                Still a per-unit comparison, even when nobody can confirm the shelf. A row
                reading only "from $8.49" cannot be compared with the rows above it, so the
                cheapest offer's unit price leads here exactly as it does everywhere else --
                it just carries no badge and never wins.
              */}
              {leading ? (
                <span className={`${styles.fromPrice} tabular`}>
                  {formatUnitPrice(
                    leading.unit_price,
                    leading.unit_price_unit,
                    product.category,
                    leading.currency,
                  )}
                </span>
              ) : null}
              {leadingOunces ? (
                <span className={`${styles.fromOunces} tabular`}>{leadingOunces}</span>
              ) : null}
              {/*
                "from $2.59" is a pack price, and a rate is not one. `price_low` is the
                cheapest *amount* across these offers, which for a variable-weight product is
                the per-pound rate already shown above -- printing it again as a total is the
                same sentence the offer rows had to stop saying. So the weight note takes its
                place, and the rate is left to speak for itself.
              */}
              {weightNote ? (
                <span className={styles.fromWeight}>{weightNote}</span>
              ) : product.price_low ? (
                <span className={`${styles.fromPack} tabular`}>
                  from {formatMoney(product.price_low, leading?.currency ?? "USD")}
                </span>
              ) : null}
              {leading ? (
                <AvailabilityPill
                  availability={leading.availability}
                  store={leading.store}
                  stockStatus={leading.stock_status}
                  always
                  compact
                />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/*
        Which shop, and can you go there. Present whether or not the price is confirmed:
        the store is equally real either way, and for a retailer that publishes no stock at
        all it is the whole of what StoreSplit can usefully say -- "carried here, check in
        store" and a map link to the door.
      */}
      {shown ? (
        <div className={styles.storeBar}>
          <StoreLine store={shown.store} offer={shown} variant="inline" showRetailer={!best} />
          <div className={styles.barActions}>
            {/*
              Secondary to the disclosure, and deliberately: the card's job is the current
              comparison, and what a price used to be is a second question. It is here rather
              than on each offer row because the dialog answers for every store at once --
              a per-row link would open the same chart from five places.
            */}
            <button
              type="button"
              className={styles.history}
              onClick={() => {
                setHistoryUsed(true);
                setHistoryOpen(true);
              }}
            >
              <TrendIcon className={styles.historyIcon} />
              <span>Price history</span>
            </button>
            <button
              type="button"
              className={styles.toggle}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((was) => !was)}
            >
              <span className={styles.toggleText}>
                {open
                  ? "Hide offers"
                  : product.offer_count > 1
                    ? `Compare ${product.offer_count} offers`
                    : "Offer details"}
              </span>
              <ChevronDown className={styles.chevron} />
            </button>
          </div>
        </div>
      ) : null}

      {historyUsed ? (
        <PriceHistoryDialog
          productId={product.id}
          productName={productTitle(product)}
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {/*
        `grid-template-rows: 0fr -> 1fr` animates an unknown height without measuring it, so
        the panel opens smoothly whatever it contains. `hidden` while closed keeps the offers
        out of the accessibility tree and out of the tab order.
      */}
      <div
        className={styles.panel}
        data-open={open || undefined}
        id={panelId}
        role="region"
        aria-label={`Offers for ${productTitle(product)}`}
      >
        <div className={styles.panelInner} hidden={!open}>
          <OfferTable
            offers={product.offers}
            category={product.category}
            packageLabel={packageLabel}
            bestOfferId={product.best_offer_id}
          />
        </div>
      </div>
    </article>
  );
}

/** A price line with a step in it -- the same 16px, 1.5-stroke, currentColor rule as the
 * rest of the iconography. */
function TrendIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 11.5h3v-4h3v-3h3v-2h4" />
    </svg>
  );
}

function Dot() {
  return (
    <span className={styles.dot} aria-hidden="true">
      ·
    </span>
  );
}
