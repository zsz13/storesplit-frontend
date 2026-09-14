"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_HISTORY_DAYS,
  type PriceHistoryResponse,
  errorMessage,
  getPriceHistory,
} from "@/lib/api";
import { stockWording } from "@/lib/availability";
import { formatAbsoluteTime, formatMoney, formatRelativeTime, formatUnitPrice } from "@/lib/format";
import type { PriceSeriesOut } from "@/lib/api";
import {
  DEFAULT_VISIBLE_SERIES,
  type PreparedSeries,
  hasEnoughHistory,
  prepareSeries,
  steadyReason,
  summarize,
} from "@/lib/priceHistory";
import { PriceHistoryChart } from "./PriceHistoryChart";
import styles from "./PriceHistoryDialog.module.css";

/** Every range is always offered; one with nothing in it says so rather than disappearing,
 * because a control that comes and goes is a worse answer than an empty one. "All" is the
 * API's own ceiling. */
const RANGES = [
  { label: "7d", days: 7, name: "7 days" },
  { label: "30d", days: 30, name: "30 days" },
  { label: "90d", days: 90, name: "90 days" },
  { label: "All", days: MAX_HISTORY_DAYS, name: "all time" },
] as const;

interface Props {
  productId: number;
  productName: string;
  open: boolean;
  onClose: () => void;
}

function keyOf(series: { retailer_product_id: number; store_id: number }): string {
  return `${series.retailer_product_id}-${series.store_id}`;
}

/**
 * What this product has cost, per store, over time.
 *
 * A native `<dialog>` for the same reason `ClosedStoresDialog` is one: the focus trap, `Esc`
 * and the inert background are the platform's. History is fetched when it is opened and not
 * before -- it reads a table that grows for ever, and a card that is never expanded should
 * never cost a query.
 *
 * Results are never replaced by a spinner once they exist, matching the search: changing the
 * range keeps the chart on screen and swaps it when the answer lands.
 */
interface State {
  data: PriceHistoryResponse | null;
  loading: boolean;
  error: string | null;
  /** Series the reader has folded away, by key. */
  hidden: ReadonlySet<string>;
}

const INITIAL: State = { data: null, loading: false, error: null, hidden: new Set() };

export function PriceHistoryDialog({ productId, productName, open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [days, setDays] = useState<number>(30);
  const [state, setState] = useState<State>(INITIAL);
  const { data, loading, error, hidden } = state;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /** The same shape `useSearch` uses: one async call that owns the whole transition, so a
   * range change keeps the chart on screen instead of replacing it with a spinner. */
  const load = useCallback(
    async (range: number, signal: AbortSignal) => {
      setState((previous) => ({ ...previous, loading: true, error: null }));
      try {
        const answer = await getPriceHistory(productId, range, signal);
        if (signal.aborted) return;
        setState({
          data: answer,
          loading: false,
          error: null,
          // Beyond the fourth line a chart stops being readable, so the rest start folded
          // into the legend. Colour is assigned by position in the response, so a reader
          // turning one back on never repaints the others.
          hidden: new Set(answer.series.slice(DEFAULT_VISIBLE_SERIES).map(keyOf)),
        });
      } catch (problem: unknown) {
        if (signal.aborted) return;
        setState((previous) => ({
          ...previous,
          loading: false,
          error: errorMessage(problem),
        }));
      }
    },
    [productId],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(days, controller.signal);
    return () => controller.abort();
  }, [open, days, load]);

  const prepared = useMemo(() => {
    if (!data) return [];
    const sinceMs = Date.parse(data.since);
    return data.series.map((series, index) => prepareSeries(series, index, sinceMs));
  }, [data]);

  const visible = useMemo(
    () => prepared.filter((one) => !hidden.has(keyOf(one.series))),
    [prepared, hidden],
  );

  const toggle = useCallback((key: string) => {
    setState((previous) => {
      const next = new Set(previous.hidden);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...previous, hidden: next };
    });
  }, []);

  const summary = useMemo(() => summarize(visible), [visible]);
  const enough = hasEnoughHistory(visible);
  const leader = prepared.find((one) => one.series.current !== null) ?? null;
  // Both come from the response, never from this machine's clock: the window the server
  // answered for is the window the axis has to describe, and a render is not a moment.
  const nowMs = data ? Date.parse(data.now) : 0;
  const sinceMs = data ? Date.parse(data.since) : 0;
  const collectedFrom = useMemo(() => {
    const times = visible.flatMap((one) => one.points.map((point) => point.t));
    return times.length ? Math.min(...times) : null;
  }, [visible]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="price-history-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.body}>
        <header className={styles.head}>
          <div className={styles.heading}>
            <p className="label">Price history</p>
            <h2 id="price-history-title" className={styles.title}>
              {productName}
            </h2>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close price history"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {/* The number a shopper came for, in the headline slot the whole app gives the unit
            price. Null while nothing is listed anywhere -- see `current` in the API. */}
        {leader?.series.current ? (
          <div className={styles.current}>
            <span className={`${styles.currentPrice} tabular`}>
              {formatUnitPrice(
                leader.series.current.unit_price,
                leader.series.current.unit_price_unit ?? data?.comparison_unit,
                data?.category,
                data?.currency,
              )}
            </span>
            <span className={styles.currentWhere}>
              {/*
                The series are ranked buyable-first by the API, so this is the cheapest
                confirmed price when there is one. When there is not, the sentence changes:
                "now at X" is a claim that it is on the shelf, and nowhere else in this app
                does an unconfirmed offer get to make it. `lib/availability.ts` is the only
                place a stock state becomes words, here as everywhere.
              */}
              {leader.series.availability === "in_stock" ? "now at " : "at "}
              {leader.label}
              {leader.series.availability && leader.series.availability !== "in_stock" ? (
                <> · {leaderStockLabel(leader.series)}</>
              ) : null}{" "}
              · collected {formatRelativeTime(leader.series.current.scraped_at)}
            </span>
          </div>
        ) : null}

        <div className={styles.ranges} role="radiogroup" aria-label="Range">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              role="radio"
              aria-checked={days === range.days}
              className={styles.range}
              data-active={days === range.days || undefined}
              onClick={() => setDays(range.days)}
            >
              <span aria-hidden="true">{range.label}</span>
              <span className="sr-only">{range.name}</span>
            </button>
          ))}
        </div>

        {error ? (
          <p className={styles.problem} role="alert">
            {error}
          </p>
        ) : null}

        {!data && loading ? <div className={`skeleton ${styles.skeleton}`} /> : null}

        {data && visible.length === 0 ? (
          <p className={styles.empty}>
            {prepared.length === 0
              ? "No prices have been collected for this product yet."
              : "Every store is hidden. Turn one back on below."}
          </p>
        ) : null}

        {data && visible.length > 0 ? (
          <>
            {!enough ? (
              <p className={styles.notice}>
                {steadyReason(visible) === "no-change"
                  ? `No price change in the last ${RANGES.find((r) => r.days === days)?.name ?? `${days} days`}. The prices below are what has been observed.`
                  : "Not enough history yet. Each store below has been priced once, and a line will appear once a price changes."}
              </p>
            ) : null}

            <PriceHistoryChart
              series={visible}
              sinceMs={sinceMs}
              nowMs={nowMs}
              category={data.category}
              comparisonUnit={data.comparison_unit}
              currency={data.currency}
              pointsOnly={!enough}
            />

            {enough ? (
              <dl className={styles.stats}>
                <Stat
                  label="Lowest"
                  value={
                    summary.lowest
                      ? formatUnitPrice(
                          summary.lowest.value,
                          data.comparison_unit,
                          data.category,
                          data.currency,
                        )
                      : "-"
                  }
                  note={summary.lowest ? summary.lowest.label : null}
                />
                <Stat
                  label="Highest"
                  value={
                    summary.highest
                      ? formatUnitPrice(
                          summary.highest.value,
                          data.comparison_unit,
                          data.category,
                          data.currency,
                        )
                      : "-"
                  }
                  note={summary.highest ? summary.highest.label : null}
                />
                {summary.change ? (
                  <Stat
                    label="Change"
                    value={`${summary.change.delta > 0 ? "+" : "−"}${formatMoney(Math.abs(summary.change.delta), data.currency)}`}
                    note={`${summary.change.percent > 0 ? "+" : "−"}${Math.abs(summary.change.percent).toFixed(1)}% at ${summary.change.label}`}
                    tone={summary.change.delta > 0 ? "up" : "down"}
                  />
                ) : null}
              </dl>
            ) : null}

            {collectedFrom !== null && collectedFrom > sinceMs + 60_000 ? (
              <p className={styles.note}>
                Collecting for this product started{" "}
                {formatAbsoluteTime(new Date(collectedFrom).toISOString())}.
              </p>
            ) : null}
            {visible.some((one) => one.series.truncated) ? (
              <p className={styles.note}>
                Some stores had more observations than one chart can show; the most recent are
                plotted.
              </p>
            ) : null}
          </>
        ) : null}

        {prepared.length > 1 ? (
          <Legend
            prepared={prepared}
            hidden={hidden}
            onToggle={toggle}
            category={data?.category ?? null}
            currency={data?.currency ?? "USD"}
          />
        ) : null}
      </div>
    </dialog>
  );
}

/** The same wording the pills and the basket lines use, never a second phrasing. */
function leaderStockLabel(series: PriceSeriesOut): string {
  return stockWording(series.availability ?? "unknown", {
    retailer_name: series.retailer_name,
    stock_reporting: series.stock_reporting,
  }).short;
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string | null;
  tone?: "up" | "down";
}) {
  return (
    <div className={styles.stat}>
      <dt className="label">{label}</dt>
      <dd className={`${styles.statValue} tabular`} data-tone={tone}>
        {value}
      </dd>
      {note ? <dd className={styles.statNote}>{note}</dd> : null}
    </div>
  );
}

/**
 * Which line is which, and which ones are drawn.
 *
 * Always present once there is more than one series: identity is never carried by colour
 * alone. Each row is a real toggle so the reader can take a thicket down to the two shops
 * they actually go to.
 */
function Legend({
  prepared,
  hidden,
  onToggle,
  category,
  currency,
}: {
  prepared: PreparedSeries[];
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
  category: string | null;
  currency: string;
}) {
  return (
    <ul className={styles.legend}>
      {prepared.map((one) => {
        const key = keyOf(one.series);
        const on = !hidden.has(key);
        return (
          <li key={key}>
            <button
              type="button"
              className={styles.legendItem}
              aria-pressed={on}
              onClick={() => onToggle(key)}
            >
              <span
                className={styles.legendSwatch}
                style={{
                  background: on ? one.style.color : "transparent",
                  borderColor: one.style.color,
                }}
                aria-hidden="true"
              />
              <span className={styles.legendLabel}>{one.label}</span>
              <span className={`${styles.legendPrice} tabular`}>
                {one.series.current
                  ? formatUnitPrice(
                      one.series.current.unit_price,
                      one.series.current.unit_price_unit,
                      category,
                      currency,
                    )
                  : "not listed"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
