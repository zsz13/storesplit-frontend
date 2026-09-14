import type { BasketItemResult, BasketLineOut, BasketResponse, StoreBasketOut } from "@/lib/api";
import {
  basketLineLabel,
  brandLabel,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatUnitPrice,
  titleCaseName,
  unitLabel,
} from "@/lib/format";
import { ItemLink } from "./OfferLinks";
import { RelativeTime } from "./RelativeTime";
import { StoreLine } from "./StoreLine";
import { Thumb } from "./Thumb";
import styles from "./BasketResults.module.css";

interface Props {
  data: BasketResponse;
}

/**
 * The answer to "one shop or two", and everything needed to act on it.
 *
 * This used to be four tables. Tables were right for the arithmetic and wrong for the
 * decision: a basket is a shopping trip, and a trip needs the shop -- which branch, where,
 * whether it is open now, and how to get to the item's own page. None of that fits a cell,
 * and none of it was here. Lines are cards now, each carrying the same store strip the
 * search results carry, so the screen a shopper decides on and the screen they compared on
 * say the same things in the same order.
 *
 * "All single-store options" stays a table, because that genuinely is one row per store
 * with the same three facts each, and turning real tabular data into cards is the opposite
 * mistake.
 */
export function BasketResults({ data }: Props) {
  const single = data.cheapest_single_store;
  const split = data.cheapest_split;
  const savings = data.savings;
  const missingItems = data.items.filter((i) => i.cheapest === null);
  // Which of the two to actually do. Only ever a comparison when both exist and differ; a
  // split that ties with one shop is not worth a second trip, so it wins nothing.
  const singleTotal = single ? Number(single.total) : null;
  const splitTotal = split ? Number(split.total) : null;
  const winner =
    singleTotal === null || splitTotal === null || singleTotal === splitTotal
      ? null
      : splitTotal < singleTotal
        ? "split"
        : "single";

  return (
    <div className="stack">
      <div className={styles.meta}>
        <div className={styles.freshness}>
          <Freshness label="Newest price" at={data.last_updated_at} />
          <Freshness label="Oldest price" at={data.oldest_updated_at} />
        </div>
        {data.stores.length > 0 ? (
          <p className="small muted">
            {data.stores.length} store{data.stores.length === 1 ? "" : "s"} near{" "}
            <span className="mono">{data.zip_code}</span>
          </p>
        ) : null}
      </div>

      {missingItems.length > 0 ? (
        <p className={styles.warning} role="status">
          No prices found for {missingItems.map((i) => titleCaseName(i.query)).join(", ")}. Collect
          prices for this ZIP on the Compare prices page, or change the item.
        </p>
      ) : null}

      <div className={styles.summary}>
        <section
          className={`card ${styles.panel}`}
          aria-labelledby="basket-single"
          data-winner={winner === "single" || undefined}
          data-loser={winner === "split" || undefined}
        >
          <header className={styles.panelHeader}>
            <h2 id="basket-single" className={styles.panelTitle}>
              One store
              {winner === "single" ? <span className={styles.winnerBadge}>Cheapest</span> : null}
            </h2>
            {single ? (
              <span className={`${styles.total} tabular`}>{formatMoney(single.total)}</span>
            ) : null}
          </header>
          {single ? (
            <>
              {/* The store for the whole basket, stated once. Repeating it on every line
                  would say the same shop three times and call it context. */}
              <div className="inset">
                <StoreLine store={single.store} showRetailer />
              </div>
              {!single.covers_all_items ? (
                <p className={styles.missing}>
                  Missing here: {single.missing_items.map(titleCaseName).join(", ")}
                </p>
              ) : null}
              <LineList lines={single.lines} />
            </>
          ) : (
            <p className="muted small">No single store has prices for every item.</p>
          )}
        </section>

        <section
          className={`card ${styles.panel}`}
          aria-labelledby="basket-split"
          data-winner={winner === "split" || undefined}
          data-loser={winner === "single" || undefined}
        >
          <header className={styles.panelHeader}>
            <h2 id="basket-split" className={styles.panelTitle}>
              Split across stores
              {winner === "split" ? <span className={styles.winnerBadge}>Cheapest</span> : null}
            </h2>
            {split ? (
              <span className={`${styles.total} tabular`}>{formatMoney(split.total)}</span>
            ) : null}
          </header>
          {split ? (
            <>
              {savings !== null ? (
                <p className={styles.savings}>
                  Save {formatMoney(savings)}
                  {data.savings_percent !== null
                    ? ` (${formatPercent(data.savings_percent)})`
                    : ""}{" "}
                  by shopping {split.stores.length} store
                  {split.stores.length === 1 ? "" : "s"}
                </p>
              ) : null}
              {/* Each line names its own shop here, because that is the whole proposition:
                  the saving is the reason to make a second trip, so the second trip has to
                  be visible on the line that causes it. */}
              <LineList lines={split.lines} showStore />
            </>
          ) : (
            <p className="muted small">Not enough prices to build a split basket.</p>
          )}
        </section>
      </div>

      <section className={`card ${styles.panel}`} aria-labelledby="basket-stores">
        <header className={styles.panelHeader}>
          <h2 id="basket-stores" className={styles.panelTitle}>
            Every store, priced
          </h2>
        </header>
        {data.single_store_options.length === 0 ? (
          <p className="muted small">No stores returned prices.</p>
        ) : (
          <div className="table-wrap">
            <table className={styles.stores}>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Open now</th>
                  <th className={styles.numeric}>Basket total</th>
                  <th>Covers</th>
                </tr>
              </thead>
              <tbody>
                {data.single_store_options.map((option) => (
                  <StoreOptionRow
                    key={option.store.id}
                    option={option}
                    best={single?.store.id === option.store.id}
                    itemCount={data.items.length}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`card ${styles.panel}`} aria-labelledby="basket-items">
        <header className={styles.panelHeader}>
          <h2 id="basket-items" className={styles.panelTitle}>
            Cheapest offer for each item
          </h2>
        </header>
        <div className={styles.itemList}>
          {data.items.map((item) => (
            <ItemResult key={item.query} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

/** One basket line, with the store it comes from when the panel has not already said. */
function LineList({ lines, showStore = false }: { lines: BasketLineOut[]; showStore?: boolean }) {
  if (lines.length === 0) return <p className="muted small">No line items.</p>;
  return (
    <ul className={styles.lines}>
      {lines.map((line) => (
        <li key={`${line.query}-${line.offer.id}`} className={styles.line}>
          <Thumb src={line.offer.image_url} alt="" size="row" />
          <div className={styles.lineText}>
            <p className={styles.lineHead}>
              <span className={styles.itemName}>{titleCaseName(line.query)}</span>
              <span className={`${styles.lineTotal} tabular`}>
                {formatMoney(line.line_total, line.offer.currency)}
              </span>
            </p>
            <p className={styles.product}>
              {line.brand ? `${brandLabel(line.brand)} ` : ""}
              {titleCaseName(line.product_name)}
            </p>
            <p className={styles.lineFacts}>
              {/* "3 × $2.59" says three trays where the backend counted three pounds. */}
              <span className="tabular">{basketLineLabel(line)}</span>
              <span className={styles.factDot} aria-hidden="true">
                ·
              </span>
              <span className="tabular">
                {formatUnitPrice(
                  line.offer.unit_price,
                  line.offer.unit_price_unit,
                  line.category,
                  line.offer.currency,
                )}
              </span>
              {!showStore ? <ItemLink offer={line.offer} className={styles.inlineLink} /> : null}
            </p>
            {showStore ? (
              <div className={styles.lineStore}>
                <StoreLine store={line.offer.store} offer={line.offer} showRetailer />
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One requested staple: what was needed, what was chosen, and where it is. */
function ItemResult({ item }: { item: BasketItemResult }) {
  const needed = `${formatQuantity(item.needed_quantity)} ${unitLabel(item.comparison_unit, item.category)}`;
  return (
    <article className={styles.item}>
      <header className={styles.itemHead}>
        <h3 className={styles.itemTitle}>{titleCaseName(item.category_label)}</h3>
        <span className={styles.needed}>
          {needed}
          {item.category_label.toLowerCase() !== item.query.toLowerCase()
            ? ` · asked for “${titleCaseName(item.query)}”`
            : ""}
        </span>
      </header>
      {item.cheapest ? (
        <LineList lines={[item.cheapest]} showStore />
      ) : (
        <p className="muted small">
          No matching products near this ZIP ({item.matching_products} candidate
          {item.matching_products === 1 ? "" : "s"} considered).
        </p>
      )}
    </article>
  );
}

function StoreOptionRow({
  option,
  best,
  itemCount,
}: {
  option: StoreBasketOut;
  best: boolean;
  itemCount: number;
}) {
  const covered = itemCount - option.missing_items.length;
  const hours = option.store.hours_today;
  return (
    <tr className={best ? styles.bestRow : undefined}>
      <td data-label="Store">
        <span className={styles.storeName}>
          {option.store.retailer_name}
          {best ? <span className={styles.bestBadge}>Cheapest</span> : null}
        </span>
        <span className={styles.storeBranch}>{option.store.name}</span>
      </td>
      <td data-label="Open now">
        <span className={styles.openState} data-state={hours?.state ?? "unknown"}>
          {hours?.state === "open"
            ? "Open"
            : hours?.state === "closed"
              ? "Closed"
              : "Not published"}
        </span>
      </td>
      <td className={`tabular ${styles.numeric}`} data-label="Basket total">
        {formatMoney(option.total)}
        {!option.covers_all_items ? <span className={styles.partial}> partial</span> : null}
      </td>
      <td data-label="Covers">
        {option.covers_all_items ? (
          <span className={styles.ok}>All {itemCount} items</span>
        ) : (
          <span className={styles.missing}>
            {covered}/{itemCount} · no {option.missing_items.map(titleCaseName).join(", ")}
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * How old one end of the price range is. The basket compares numbers collected at different
 * moments, so both ends are stated rather than averaged into one reassuring timestamp.
 */
function Freshness({ label, at }: { label: string; at: string | null }) {
  if (!at) return null;
  return <RelativeTime className="small muted" at={at} prefix={label} />;
}
