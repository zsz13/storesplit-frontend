"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PriceObservationOut } from "@/lib/api";
import {
  currencySymbol,
  formatAbsoluteTime,
  formatMoney,
  formatUnitPrice,
  unitLabel,
} from "@/lib/format";
import {
  type ChartPoint,
  type PreparedSeries,
  type Plot,
  axisDateLabel,
  priceTicks,
  project,
  scaleFor,
  stepPath,
  timeTicks,
} from "@/lib/priceHistory";
import styles from "./PriceHistoryChart.module.css";

interface Props {
  series: PreparedSeries[];
  sinceMs: number;
  nowMs: number;
  category: string;
  comparisonUnit: string | null;
  currency: string;
  /** Draw observations as points rather than a line: nothing has been seen to move yet, and
   * a line through one price per store would read as a trend nobody measured. */
  pointsOnly: boolean;
}

/** Before the container has been measured — first paint, and jsdom, which reports 0. */
const FALLBACK_WIDTH = 640;
const NARROW = 520;

/**
 * A price over time, one step line per store.
 *
 * Hand-drawn SVG rather than a charting library: this is one chart of one shape, the app
 * carries no runtime dependency beyond React today, and a library would arrive with its own
 * colours, its own tooltip and its own idea of how to interpolate between two prices — which
 * is the one decision here that has to be wrong in no circumstances (see `lib/priceHistory`).
 *
 * The axis is the normalized unit price. The pack price rides in the tooltip beside it and is
 * never plotted: two measures on one axis is the mistake this product exists to prevent.
 */
export function PriceHistoryChart({
  series,
  sinceMs,
  nowMs,
  category,
  comparisonUnit,
  currency,
  pointsOnly,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const clipId = useId();

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const measure = () => setMeasured(element.clientWidth);
    measure();
    // The dialog's width is a function of the viewport and nothing else, so a resize
    // listener sees every change a ResizeObserver would, without the observer.
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const width = measured || FALLBACK_WIDTH;
  const narrow = width < NARROW;
  const plot: Plot = {
    width,
    height: narrow ? 176 : 212,
    padLeft: narrow ? 44 : 52,
    padRight: 14,
    padTop: 12,
    padBottom: 26,
  };

  const scale = useMemo(() => scaleFor(series, sinceMs, nowMs), [series, sinceMs, nowMs]);
  const yTicks = useMemo(() => priceTicks(scale, narrow ? 3 : 4), [scale, narrow]);
  const xTicks = useMemo(() => timeTicks(scale, narrow ? 3 : 4), [scale, narrow]);
  const span = scale.xMax - scale.xMin;

  /** Every moment anything was observed, so the crosshair snaps to real readings. */
  const stops = useMemo(() => {
    const times = new Set<number>();
    for (const one of series) for (const point of one.points) times.add(point.t);
    return [...times].sort((a, b) => a - b);
  }, [series]);

  const readings = hoverTime === null ? [] : readAt(series, hoverTime);
  const crosshairX =
    hoverTime === null ? null : project({ t: hoverTime, v: scale.yMin }, scale, plot).x;

  function timeAtClientX(clientX: number): number | null {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || stops.length === 0) return null;
    const inner = plot.width - plot.padLeft - plot.padRight;
    const ratio = Math.min(Math.max((clientX - box.left - plot.padLeft) / inner, 0), 1);
    const t = scale.xMin + ratio * span;
    // Snap to the nearest real observation: a crosshair between two of them would invite a
    // reading of a price that was never quoted.
    return stops.reduce((best, stop) => (Math.abs(stop - t) < Math.abs(best - t) ? stop : best));
  }

  function step(direction: 1 | -1) {
    if (stops.length === 0) return;
    const at = hoverTime === null ? stops.length - 1 : stops.indexOf(hoverTime);
    const next = Math.min(
      Math.max((at < 0 ? stops.length - 1 : at) + direction, 0),
      stops.length - 1,
    );
    setHoverTime(stops[next]);
  }

  const axisTitle = `${currencySymbol(currency)} / ${unitLabel(comparisonUnit, category) || "unit"}`;

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.axisTitle}>{axisTitle}</figcaption>
      <div
        ref={wrapRef}
        className={styles.wrap}
        onPointerMove={(event) => setHoverTime(timeAtClientX(event.clientX))}
        onPointerLeave={() => setHoverTime(null)}
      >
        <svg
          className={styles.svg}
          width={plot.width}
          height={plot.height}
          viewBox={`0 0 ${plot.width} ${plot.height}`}
          role="img"
          aria-label={chartDescription(series, category, comparisonUnit, currency)}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              step(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              step(1);
            } else if (event.key === "Escape") {
              setHoverTime(null);
            }
          }}
          onBlur={() => setHoverTime(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={plot.padLeft}
                y={plot.padTop - 6}
                width={plot.width - plot.padLeft - plot.padRight}
                height={plot.height - plot.padTop - plot.padBottom + 12}
              />
            </clipPath>
          </defs>

          {/* Grid and axes sit behind everything and stay recessive: they are the ruler, not
              the reading. */}
          {yTicks.map((tick) => {
            const { y } = project({ t: scale.xMin, v: tick }, scale, plot);
            return (
              <g key={`y-${tick}`}>
                <line
                  className={styles.grid}
                  x1={plot.padLeft}
                  x2={plot.width - plot.padRight}
                  y1={y}
                  y2={y}
                />
                <text
                  className={styles.tickLabel}
                  x={plot.padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                >
                  {formatMoney(tick, currency)}
                </text>
              </g>
            );
          })}

          {xTicks.map((tick, index) => {
            const { x } = project({ t: tick, v: scale.yMin }, scale, plot);
            const anchor = index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle";
            return (
              <text
                key={`x-${tick}`}
                className={styles.tickLabel}
                x={x}
                y={plot.height - 8}
                textAnchor={anchor}
              >
                {axisDateLabel(tick, span)}
              </text>
            );
          })}

          {crosshairX !== null ? (
            <line
              className={styles.crosshair}
              x1={crosshairX}
              x2={crosshairX}
              y1={plot.padTop - 4}
              y2={plot.height - plot.padBottom}
            />
          ) : null}

          <g clipPath={`url(#${clipId})`}>
            {series.map((one) => {
              const drawLine = !pointsOnly && one.points.length > 1;
              const showMarks = one.points.length <= 24;
              return (
                <g key={seriesKey(one)}>
                  {drawLine ? (
                    <path
                      className={styles.line}
                      d={stepPath(one.points, scale, plot)}
                      stroke={one.style.color}
                      strokeDasharray={
                        one.observationCount > 1 ? one.style.dash : (one.style.dash ?? "2 4")
                      }
                      fill="none"
                    />
                  ) : null}
                  {(showMarks || pointsOnly ? one.points : one.points.slice(-1)).map(
                    (point, index) => {
                      const { x, y } = project(point, scale, plot);
                      const active = hoverTime !== null && point.t === hoverTime;
                      return (
                        <circle
                          key={`${point.t}-${index}-${point.isCurrent}`}
                          cx={x}
                          cy={y}
                          r={point.isCurrent || active ? 4.5 : 3.5}
                          fill={one.style.color}
                          className={styles.mark}
                        />
                      );
                    },
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* No direct end labels. Every line ends at the same instant -- now -- so labels at
            the ends stack on top of each other, which is exactly what the two Smart & Final
            branches of one product did. The legend below carries the same adjacency
            (swatch, name, current price) and is what keeps identity off colour alone. */}

        {hoverTime !== null && readings.length > 0 ? (
          <div
            className={styles.tooltip}
            /* Flips to the left of the crosshair once it passes the middle, so the readout
               never sits on top of the part of the line the reader is walking towards. */
            style={{ left: tooltipLeft(crosshairX ?? 0, plot.width) }}
            role="status"
          >
            <p className={styles.tooltipTime}>
              {formatAbsoluteTime(new Date(hoverTime).toISOString())}
            </p>
            <ul className={styles.tooltipList}>
              {readings.map(({ one, point }) => (
                <li key={seriesKey(one)} className={styles.tooltipRow}>
                  <span
                    className={styles.swatch}
                    style={{ background: one.style.color }}
                    aria-hidden="true"
                  />
                  <span className={styles.tooltipStore}>{one.label}</span>
                  <span className={`${styles.tooltipPrice} tabular`}>
                    {formatUnitPrice(
                      point.v,
                      point.observation.unit_price_unit ?? comparisonUnit,
                      category,
                      currency,
                    )}
                  </span>
                  {/* The pack price, and only where "pack" is what the retailer quoted. A
                      per-pound rate has no package total, and printing one would be the
                      sentence this app exists to stop saying. */}
                  <span className={`${styles.tooltipPack} tabular`}>
                    {packLabel(point.observation, category, currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* The same numbers as a table, for a reader who cannot see the line. The wrapper is
          what carries `sr-only`: a table ignores `width: 1px` and lays itself out at its
          content width, so the class on the table itself let it push the dialog 400px wide. */}
      <div className="sr-only">
        <table>
          <caption>Price history by store</caption>
          <thead>
            <tr>
              <th scope="col">Store</th>
              <th scope="col">Collected</th>
              <th scope="col">Unit price</th>
              <th scope="col">Price</th>
            </tr>
          </thead>
          <tbody>
            {series.flatMap((one) =>
              one.points.map((point, index) => (
                <tr key={`${seriesKey(one)}-${point.t}-${index}-${point.isCurrent}`}>
                  <td>{one.label}</td>
                  <td>{formatAbsoluteTime(point.observation.scraped_at)}</td>
                  <td>
                    {formatUnitPrice(
                      point.v,
                      point.observation.unit_price_unit ?? comparisonUnit,
                      category,
                      currency,
                    )}
                  </td>
                  <td>{formatMoney(point.observation.price, currency)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/**
 * The retailer's own amount, said the way the retailer said it.
 *
 * A null basis is a row nobody recorded one for, and it gets no qualifier at all: "$2.59"
 * is true, and "$2.59 pack" over what may be a per-pound rate is the sentence the whole
 * app is built to avoid.
 */
function packLabel(observation: PriceObservationOut, category: string, currency: string): string {
  const amount = formatMoney(observation.price, currency);
  if (observation.price_basis === "package") return `${amount} pack`;
  if (observation.price_basis) return `${amount} / ${unitLabel(observation.price_basis, category)}`;
  return amount;
}

/** Tooltip width in CSS: `min(17rem, 78%)`. Mirrored here because the flip has to know
 * roughly how wide the box is, and a measurement would cost a layout pass per pointer move. */
const TOOLTIP_WIDTH = 272;

function tooltipLeft(crosshairX: number, width: number): number {
  const flipped = crosshairX > width / 2;
  const left = flipped ? crosshairX - TOOLTIP_WIDTH - 10 : crosshairX + 10;
  return Math.min(Math.max(left, 4), Math.max(width - TOOLTIP_WIDTH - 4, 4));
}

function seriesKey(one: PreparedSeries): string {
  return `${one.series.retailer_product_id}-${one.series.store_id}`;
}

/**
 * What each series was charging at one moment.
 *
 * The last observation at or before the crosshair, because a price holds until it changes.
 * A series whose first observation is later than the crosshair reads nothing rather than its
 * eventual price: it had not been collected yet.
 */
function readAt(
  series: PreparedSeries[],
  at: number,
): { one: PreparedSeries; point: ChartPoint }[] {
  const out: { one: PreparedSeries; point: ChartPoint }[] = [];
  for (const one of series) {
    let found: ChartPoint | null = null;
    for (const point of one.points) {
      if (point.t <= at) found = point;
    }
    if (found) out.push({ one, point: found });
  }
  return out;
}

function chartDescription(
  series: PreparedSeries[],
  category: string,
  comparisonUnit: string | null,
  currency: string,
): string {
  const unit = unitLabel(comparisonUnit, category) || "unit";
  const parts = series.map((one) => {
    const last = one.points[one.points.length - 1];
    if (!last) return `${one.label}, no price collected`;
    const price = formatMoney(last.v, currency);
    const plural = one.observationCount === 1 ? "" : "s";
    // "now" is a claim about today, and a store that no longer lists the product has no
    // today. The legend says "not listed"; this has to agree with it.
    const when = one.series.current ? "now" : "last seen at";
    return `${one.label}, ${one.observationCount} observation${plural}, ${when} ${price} per ${unit}`;
  });
  return `Price history per ${unit}. ${parts.join(". ")}.`;
}
