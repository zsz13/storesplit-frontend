import { describe, expect, it } from "vitest";
import {
  DEFAULT_VISIBLE_SERIES,
  SERIES_COLORS,
  hasEnoughHistory,
  prepareSeries,
  priceTicks,
  project,
  scaleFor,
  seriesLabel,
  seriesStyle,
  stepPath,
  steadyReason,
  summarize,
} from "@/lib/priceHistory";
import { observation, priceSeries } from "./fixtures";

const SINCE = Date.parse("2026-08-14T10:00:00Z");
const NOW = Date.parse("2026-09-13T10:00:00Z");
const plot = { width: 600, height: 200, padLeft: 50, padRight: 10, padTop: 10, padBottom: 20 };

function at(iso: string, unitPrice: string, extra = {}) {
  return observation({ scraped_at: iso, unit_price: unitPrice, ...extra });
}

describe("series identity", () => {
  it("assigns colours in a fixed order and never invents one", () => {
    expect(seriesStyle(0).color).toBe(SERIES_COLORS[0]);
    expect(seriesStyle(3).color).toBe(SERIES_COLORS[3]);
    // A fifth series repeats the validated palette with a dash: a second channel, not a
    // fifth colour nobody checked.
    expect(seriesStyle(4).color).toBe(SERIES_COLORS[0]);
    expect(seriesStyle(0).dash).toBeUndefined();
    expect(seriesStyle(4).dash).toBeDefined();
  });

  it("names a series by retailer and branch, and by retailer alone when they are one", () => {
    expect(seriesLabel(priceSeries())).toBe("Safeway · Market St");
    expect(seriesLabel(priceSeries({ store_name: "Safeway" }))).toBe("Safeway");
  });
});

describe("preparing a series", () => {
  it("appends the live offer as the right-hand end of the line", () => {
    const prepared = prepareSeries(priceSeries(), 0, SINCE);
    expect(prepared.points).toHaveLength(2);
    expect(prepared.points[1].isCurrent).toBe(true);
    // Only the history rows count as observations; the current price is the same reading
    // confirmed again, not a second change.
    expect(prepared.observationCount).toBe(1);
    expect(prepared.observationCount).toBe(1);
  });

  it("does not draw a delisted product forward to today", () => {
    const prepared = prepareSeries(priceSeries({ current: null }), 0, SINCE);
    expect(prepared.points).toHaveLength(1);
    expect(prepared.points.some((p) => p.isCurrent)).toBe(false);
  });

  it("pulls an observation older than the window to the window's edge", () => {
    const prepared = prepareSeries(
      priceSeries({
        points: [at("2026-07-01T10:00:00Z", "0.3900", { before_window: true })],
        current: null,
      }),
      0,
      SINCE,
    );
    expect(prepared.points[0].t).toBe(SINCE);
    expect(prepared.points[0].observation.before_window).toBe(true);
  });

  it("drops an observation with no comparable unit price rather than plotting a total", () => {
    const prepared = prepareSeries(
      priceSeries({
        points: [at("2026-09-01T10:00:00Z", "0.4000"), observation({ unit_price: null })],
        current: null,
      }),
      0,
      SINCE,
    );
    expect(prepared.points).toHaveLength(1);
  });
});

describe("the scale", () => {
  const moved = prepareSeries(
    priceSeries({
      points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.5000")],
      current: null,
    }),
    0,
    SINCE,
  );

  it("pads the value range instead of forcing a zero baseline", () => {
    const scale = scaleFor([moved], SINCE, NOW);
    expect(scale.yMin).toBeGreaterThan(0);
    expect(scale.yMin).toBeLessThan(0.4);
    expect(scale.yMax).toBeGreaterThan(0.5);
  });

  it("gives a price that has never moved a band to sit in", () => {
    const flat = prepareSeries(
      priceSeries({ points: [at("2026-09-01T10:00:00Z", "0.4158")] }),
      0,
      SINCE,
    );
    const scale = scaleFor([flat], SINCE, NOW);
    expect(scale.yMax).toBeGreaterThan(scale.yMin);
    const mid = (scale.yMin + scale.yMax) / 2;
    expect(Math.abs(mid - 0.4158)).toBeLessThan(0.01);
  });

  it("spans the data rather than the request, so a young product is not a sliver", () => {
    const scale = scaleFor([moved], SINCE, NOW);
    // The earliest observation is 2026-09-01, not the 30-day window's 2026-08-14.
    expect(scale.xMin).toBe(Date.parse("2026-09-01T10:00:00Z"));
    expect(scale.xMax).toBe(NOW);
  });
});

describe("the path", () => {
  it("holds each price until the moment it changed", () => {
    const prepared = prepareSeries(
      priceSeries({
        points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.5000")],
        current: null,
      }),
      0,
      SINCE,
    );
    const scale = scaleFor([prepared], SINCE, NOW);
    const d = stepPath(prepared.points, scale, plot);
    const [first, second] = prepared.points.map((p) => project(p, scale, plot));
    // Along at the old price, then up: never a diagonal between two prices, which would
    // draw every value in between as one that was charged.
    expect(d).toBe(
      `M ${r(first.x)} ${r(first.y)} L ${r(second.x)} ${r(first.y)} L ${r(second.x)} ${r(second.y)}`,
    );
  });

  it("is empty for a series with nothing in it", () => {
    expect(stepPath([], scaleFor([], SINCE, NOW), plot)).toBe("");
  });
});

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

describe("ticks", () => {
  it("lands on round money inside the range", () => {
    const ticks = priceTicks({ xMin: SINCE, xMax: NOW, yMin: 0.31, yMax: 0.56 }, 4);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    for (const tick of ticks) {
      expect(tick).toBeGreaterThanOrEqual(0.31);
      expect(tick).toBeLessThanOrEqual(0.56);
    }
  });
});

describe("the summary", () => {
  const cheap = prepareSeries(
    priceSeries({
      points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.5000")],
      current: at("2026-09-13T10:00:00Z", "0.5000"),
    }),
    0,
    SINCE,
  );
  const dear = prepareSeries(
    priceSeries({
      store_id: 2,
      store_name: "SoMa",
      points: [at("2026-09-02T10:00:00Z", "0.6000")],
      current: at("2026-09-13T10:00:00Z", "0.6000"),
    }),
    1,
    SINCE,
  );

  it("reports the extremes across every visible series, with where they were", () => {
    const summary = summarize([cheap, dear]);
    expect(summary.lowest?.value).toBe(0.4);
    expect(summary.lowest?.label).toBe("Safeway · Market St");
    expect(summary.highest?.value).toBe(0.6);
    expect(summary.highest?.label).toBe("Safeway · SoMa");
  });

  it("reports a change only for a series that actually moved", () => {
    const summary = summarize([cheap, dear]);
    expect(summary.change?.delta).toBeCloseTo(0.1, 6);
    expect(summary.change?.percent).toBeCloseTo(25, 6);
    expect(summary.change?.label).toBe("Safeway · Market St");
  });

  it("reports no change at all when nothing has been seen to move", () => {
    // A gap between two shops is a price difference, not a price change: calling it one
    // would invent a trend out of two stores that have each been priced once.
    expect(summarize([dear]).change).toBeNull();
  });
});

describe("whether there is enough to draw a line", () => {
  const once = prepareSeries(priceSeries(), 0, SINCE);
  const twice = prepareSeries(
    priceSeries({
      points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.5000")],
    }),
    0,
    SINCE,
  );

  it("is false when every series holds one observation", () => {
    expect(hasEnoughHistory([once])).toBe(false);
    expect(hasEnoughHistory([once, twice])).toBe(true);
  });

  it("tells a product collected once apart from a price that has simply held", () => {
    expect(steadyReason([once])).toBe("no-history");
    const anchored = prepareSeries(
      priceSeries({
        points: [at("2026-07-01T10:00:00Z", "0.4158", { before_window: true })],
      }),
      0,
      SINCE,
    );
    expect(steadyReason([anchored])).toBe("no-change");
  });
});

it("draws four lines before folding the rest into the legend", () => {
  expect(DEFAULT_VISIBLE_SERIES).toBe(SERIES_COLORS.length);
});
