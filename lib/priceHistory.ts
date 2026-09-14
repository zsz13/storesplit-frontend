/**
 * The arithmetic behind the price-history chart: scales, step paths, ticks and the summary.
 *
 * Pure, and separate from the component, because everything here is a claim about numbers a
 * shopper will read as fact — "lowest in 30 days", "up 12%" — and a claim like that has to
 * be testable without a DOM.
 *
 * Two rules run through all of it.
 *
 * **The axis is the unit price.** It is the only figure comparable across pack sizes and
 * across a per-pound rate, which is the whole thesis of the product. The pack price travels
 * in the tooltip beside it and is never plotted: one axis, one meaning.
 *
 * **A price is a step, not a slope.** Nothing was charged between two observations except
 * the earlier one, so the line holds flat and turns at the moment of the change. Drawing a
 * diagonal between $4.99 and $5.49 would draw fourteen prices nobody ever paid.
 */

import type { PriceObservationOut, PriceSeriesOut } from "@/lib/api";
import { parseDecimal, storeLabel } from "@/lib/format";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * The series palette, by reference. The hex lives in `app/globals.css` with every other
 * colour in the system — which is what lets a contrast or dark-mode pass find it — and the
 * rationale for the particular four is written down beside it there and in `DESIGN-BRIEF.md`.
 * Assigned in this fixed order and never cycled into a hue nobody validated; a fifth series
 * repeats the order with a dash pattern, a second channel rather than a second guess.
 */
export const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
] as const;
const SERIES_DASHES = [undefined, "6 4", "1.5 4"] as const;

/** Lines drawn at once before the rest wait in the legend. More than four on a phone is a
 * thicket, and the fifth colour is where a validated palette stops being validated. */
export const DEFAULT_VISIBLE_SERIES = 4;

export interface SeriesStyle {
  color: string;
  dash: string | undefined;
}

/**
 * A series' colour, decided by its position in the response and nothing else.
 *
 * The backend orders series by current price, so position is stable for a given answer:
 * hiding one line cannot repaint the others, which is the thing that makes a legend
 * trustworthy.
 */
export function seriesStyle(index: number): SeriesStyle {
  return {
    color: SERIES_COLORS[index % SERIES_COLORS.length],
    dash: SERIES_DASHES[Math.floor(index / SERIES_COLORS.length) % SERIES_DASHES.length],
  };
}

export function seriesLabel(series: PriceSeriesOut): string {
  return storeLabel({ retailer_name: series.retailer_name, name: series.store_name });
}

export interface ChartPoint {
  /** Epoch milliseconds, clamped into the window: an observation older than the range is
   * the value the range starts at, so it is drawn at the left edge rather than off it. */
  t: number;
  /** The unit price. */
  v: number;
  observation: PriceObservationOut;
  /** Synthesized from the live offer rather than read from the history table. */
  isCurrent: boolean;
}

export interface PreparedSeries {
  series: PriceSeriesOut;
  index: number;
  style: SeriesStyle;
  label: string;
  points: ChartPoint[];
  /** Real observations behind this line, including the one before the window that starts
   * it. Reported to a screen reader; what decides whether a line is drawn is
   * `hasEnoughHistory`, which looks at the plotted values rather than the row count. */
  observationCount: number;
}

function value(observation: PriceObservationOut): number | null {
  return parseDecimal(observation.unit_price);
}

/**
 * One series as points on a time axis.
 *
 * The live offer is appended as the right-hand end of the line, because it is the only row
 * that knows the price is still being charged. A series whose offer has been expired simply
 * ends at its last observation — drawing it forward would state a price that is not on sale.
 */
export function prepareSeries(
  series: PriceSeriesOut,
  index: number,
  sinceMs: number,
): PreparedSeries {
  const points: ChartPoint[] = [];
  for (const observation of series.points) {
    const v = value(observation);
    if (v === null) continue;
    const t = Date.parse(observation.scraped_at);
    if (Number.isNaN(t)) continue;
    points.push({ t: Math.max(t, sinceMs), v, observation, isCurrent: false });
  }
  const observationCount = points.length;

  const current = series.current;
  if (current) {
    const v = value(current);
    const t = Date.parse(current.scraped_at);
    const last = points[points.length - 1];
    if (v !== null && !Number.isNaN(t) && (!last || t > last.t)) {
      points.push({ t: Math.max(t, sinceMs), v, observation: current, isCurrent: true });
    }
  }

  return {
    series,
    index,
    style: seriesStyle(index),
    label: seriesLabel(series),
    points,
    observationCount,
  };
}

export interface Scale {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * The plotted range.
 *
 * Not zero-based, deliberately: grocery prices move by cents inside a few dollars, and a
 * zero baseline flattens every real change into one indistinguishable band. Both ends of the
 * axis are always labelled, which is what makes a non-zero baseline honest rather than a
 * trick. A price that has never moved is given a band around itself so it draws in the
 * middle instead of along an edge.
 */
export function scaleFor(prepared: PreparedSeries[], sinceMs: number, nowMs: number): Scale {
  const values = prepared.flatMap((s) => s.points.map((p) => p.v));
  const times = prepared.flatMap((s) => s.points.map((p) => p.t));
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const span = high - low;
  // A price that has never moved gets a band proportional to itself. A fixed floor was
  // tried and is wrong at both ends of the range this app covers: five cents around a
  // $0.10-an-egg price is an axis from zero to three times the price.
  const pad = span === 0 ? Math.max(high * 0.1, 0.01) : span * 0.12;
  // The axis spans the data, not the request. Asking for 90 days of a product first seen
  // yesterday would otherwise squeeze every observation into the last percent of the width
  // and leave the rest empty -- which reads as lost data rather than as "we started
  // yesterday". The range control still decides what is *returned*; the caption says when
  // collection actually began. A floor of one hour keeps a single-observation chart from
  // collapsing to zero width.
  const earliest = times.length ? Math.min(...times) : sinceMs;
  return {
    xMin: Math.min(earliest, nowMs - HOUR),
    xMax: nowMs,
    yMin: Math.max(0, low - pad),
    yMax: high + pad,
  };
}

export interface Plot {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

export function project(point: { t: number; v: number }, scale: Scale, plot: Plot) {
  const innerWidth = plot.width - plot.padLeft - plot.padRight;
  const innerHeight = plot.height - plot.padTop - plot.padBottom;
  const tSpan = scale.xMax - scale.xMin || 1;
  const vSpan = scale.yMax - scale.yMin || 1;
  return {
    x: plot.padLeft + ((point.t - scale.xMin) / tSpan) * innerWidth,
    y: plot.padTop + (1 - (point.v - scale.yMin) / vSpan) * innerHeight,
  };
}

/**
 * A step path: hold the previous price until the moment it changed, then jump.
 *
 * `M x0 y0 L x1 y0 L x1 y1 …` — the horizontal segment carries the old price right up to the
 * change, and the vertical one is the change itself.
 */
export function stepPath(points: ChartPoint[], scale: Scale, plot: Plot): string {
  if (points.length === 0) return "";
  const first = project(points[0], scale, plot);
  const parts = [`M ${round(first.x)} ${round(first.y)}`];
  let previous = first;
  for (const point of points.slice(1)) {
    const next = project(point, scale, plot);
    parts.push(`L ${round(next.x)} ${round(previous.y)}`);
    parts.push(`L ${round(next.x)} ${round(next.y)}`);
    previous = next;
  }
  return parts.join(" ");
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Three or four round values inside the range, for a grid a reader can price off. */
export function priceTicks(scale: Scale, count = 4): number[] {
  const span = scale.yMax - scale.yMin;
  if (span <= 0) return [scale.yMin];
  const rough = span / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let v = Math.ceil(scale.yMin / step) * step; v <= scale.yMax + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  return ticks;
}

/** Evenly spaced instants across the axis, for date labels. */
export function timeTicks(scale: Scale, count = 4): number[] {
  const span = scale.xMax - scale.xMin;
  if (span <= 0) return [scale.xMin];
  const steps = Math.max(1, count - 1);
  return Array.from({ length: steps + 1 }, (_, i) => scale.xMin + (span * i) / steps);
}

/** A tick label that says as much as the range needs and no more. */
export function axisDateLabel(ms: number, spanMs: number): string {
  const date = new Date(ms);
  if (spanMs <= 2 * DAY) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface Extreme {
  value: number;
  at: string;
  label: string;
}

export interface Summary {
  lowest: Extreme | null;
  highest: Extreme | null;
  /** Change of the leading series across the period, or null when it has not been seen to
   * move. Per series and never across them: the difference between two shops is a price
   * gap, not a price change, and calling it one would invent a trend. */
  change: { delta: number; percent: number; label: string } | null;
}

export function summarize(prepared: PreparedSeries[]): Summary {
  let lowest: Extreme | null = null;
  let highest: Extreme | null = null;
  for (const series of prepared) {
    for (const point of series.points) {
      if (!lowest || point.v < lowest.value) {
        lowest = { value: point.v, at: point.observation.scraped_at, label: series.label };
      }
      if (!highest || point.v > highest.value) {
        highest = { value: point.v, at: point.observation.scraped_at, label: series.label };
      }
    }
  }

  const leader = prepared.find((s) => new Set(s.points.map((p) => p.v)).size > 1) ?? null;
  let change: Summary["change"] = null;
  if (leader) {
    const first = leader.points[0].v;
    const last = leader.points[leader.points.length - 1].v;
    if (first > 0 && first !== last) {
      change = {
        delta: last - first,
        percent: ((last - first) / first) * 100,
        label: leader.label,
      };
    }
  }
  return { lowest, highest, change };
}

/**
 * Whether anything has actually been seen to change — measured on the plotted values, not
 * on the row count.
 *
 * The change test that writes a history row is wider than this axis: a card price moving
 * while the shelf price holds is a real change and is recorded, but it draws two points at
 * the same height. Counting rows would call that a trend and hide the "no price change"
 * notice behind a flat solid line whose Lowest and Highest are the same number.
 */
export function hasEnoughHistory(prepared: PreparedSeries[]): boolean {
  return prepared.some((s) => new Set(s.points.map((p) => p.v)).size > 1);
}

/**
 * Why there is no line, in the shopper's terms. Two different situations wear the same
 * empty chart and need opposite sentences: a product collected once today has no history
 * yet, and a product whose price has held since before the range has plenty and none of it
 * moved. Calling the second one "not enough history" would be false.
 */
export function steadyReason(prepared: PreparedSeries[]): "no-history" | "no-change" {
  const anchored = prepared.some((s) => s.series.points.some((p) => p.before_window));
  return anchored ? "no-change" : "no-history";
}
