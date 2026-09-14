import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getPriceHistory: vi.fn() };
});

import { ApiError, getPriceHistory } from "@/lib/api";
import { PriceHistoryDialog } from "@/components/PriceHistoryDialog";
import { observation, priceHistory, priceSeries } from "./fixtures";

const historyMock = vi.mocked(getPriceHistory);

// jsdom implements <dialog> but not its modal behaviour.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  historyMock.mockReset();
});

function at(iso: string, unitPrice: string, extra = {}) {
  return observation({ scraped_at: iso, unit_price: unitPrice, ...extra });
}

async function open(answer = priceHistory()) {
  historyMock.mockResolvedValue(answer);
  const result = render(
    <PriceHistoryDialog productId={100} productName="Large White Eggs" open onClose={() => {}} />,
  );
  await waitFor(() => expect(historyMock).toHaveBeenCalled());
  await screen.findByRole("heading", { name: "Large White Eggs" });
  return result;
}

describe("what it asks for", () => {
  it("defaults to thirty days and re-asks when the range changes", async () => {
    await open();
    expect(historyMock).toHaveBeenCalledWith(100, 30, expect.any(AbortSignal));

    fireEvent.click(screen.getByRole("radio", { name: "90 days" }));
    await waitFor(() => expect(historyMock).toHaveBeenCalledWith(100, 90, expect.any(AbortSignal)));
    expect(screen.getByRole("radio", { name: "90 days" })).toHaveAttribute("aria-checked", "true");
  });

  it("says what failed and leaves the dialog usable", async () => {
    historyMock.mockRejectedValue(new ApiError("Could not reach the API", null));
    render(
      <PriceHistoryDialog productId={100} productName="Large White Eggs" open onClose={() => {}} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the API");
  });
});

describe("a product with a real price change", () => {
  const moved = priceHistory({
    series: [
      priceSeries({
        points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.5000")],
        current: at("2026-09-13T10:00:00Z", "0.5000"),
      }),
    ],
  });

  it("draws a line and labels the axis with the comparison unit", async () => {
    const { container } = await open(moved);
    expect(lines(container).length).toBeGreaterThan(0);
    expect(screen.getByText("$ / egg")).toBeInTheDocument();
  });

  it("leads with the current unit price and where it is", async () => {
    await open(moved);
    expect(screen.getAllByText("$0.50 / egg").length).toBeGreaterThan(0);
    expect(screen.getByText(/now at Safeway · Market St/)).toBeInTheDocument();
  });

  it("summarizes the period without implying the gap between shops is a trend", async () => {
    await open(moved);
    expect(stat("Lowest")).toHaveTextContent("$0.40 / egg");
    expect(stat("Highest")).toHaveTextContent("$0.50 / egg");
    expect(stat("Change")).toHaveTextContent("+$0.10");
    expect(stat("Change")).toHaveTextContent("+25.0% at Safeway · Market St");
  });
});

describe("a variable-weight, per-pound product", () => {
  it("labels the axis per pound and never calls a rate a pack price", async () => {
    await open(
      priceHistory({
        category: "chicken_breast",
        comparison_unit: "lb",
        series: [
          priceSeries({
            store_name: "Stonestown",
            points: [
              observation({
                scraped_at: "2026-09-01T10:00:00Z",
                price: "2.59",
                regular_price: "2.59",
                unit_price: "2.5900",
                price_basis: "lb",
                unit_price_unit: "lb",
              }),
            ],
            current: observation({
              scraped_at: "2026-09-13T10:00:00Z",
              price: "2.79",
              regular_price: "2.79",
              unit_price: "2.7900",
              price_basis: "lb",
              unit_price_unit: "lb",
            }),
          }),
        ],
      }),
    );
    expect(screen.getByText("$ / lb")).toBeInTheDocument();
    expect(screen.getAllByText("$2.79 / lb").length).toBeGreaterThan(0);
    // "$2.59 for the pack" over a per-pound rate is the sentence this product exists to
    // stop saying, and a chart is not allowed to start saying it again.
    expect(screen.queryByText(/pack/i)).not.toBeInTheDocument();
  });
});

describe("the same SKU at two stores", () => {
  const twoStores = priceHistory({
    series: [
      priceSeries({
        points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.4500")],
        current: at("2026-09-13T10:00:00Z", "0.4500"),
      }),
      priceSeries({
        store_id: 2,
        store_name: "SoMa",
        points: [at("2026-09-01T10:00:00Z", "0.5200")],
        current: at("2026-09-13T10:00:00Z", "0.5200"),
      }),
    ],
  });

  it("keeps them apart, names both, and never merges them into one line", async () => {
    await open(twoStores);
    const legend = screen.getAllByRole("button", { pressed: true });
    const labels = legend.map((item) => item.textContent);
    expect(labels.some((text) => text?.includes("Market St"))).toBe(true);
    expect(labels.some((text) => text?.includes("SoMa"))).toBe(true);
  });

  it("lets a store be folded away without repainting the others", async () => {
    const { container } = await open(twoStores);
    const before = colorsOf(container);
    const soma = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("SoMa"));
    expect(soma).toBeDefined();
    fireEvent.click(soma!);
    await waitFor(() => expect(soma).toHaveAttribute("aria-pressed", "false"));
    // The survivor keeps the colour it had: a legend that repaints on a filter is a legend
    // that cannot be trusted.
    expect(colorsOf(container)).toEqual(before.filter((c) => colorsOf(container).includes(c)));
    expect(colorsOf(container)[0]).toBe(before[0]);
  });
});

/** The data paths, and only those: the close button is an SVG too. */
function lines(container: HTMLElement): Element[] {
  return [...container.querySelectorAll("figure svg path[d]")];
}

function colorsOf(container: HTMLElement): string[] {
  return lines(container).map((path) => path.getAttribute("stroke") ?? "");
}

/** One cell of the summary strip, found by its label rather than by its value. */
function stat(label: string): HTMLElement {
  const term = screen.getByText(label);
  const cell = term.parentElement;
  if (!cell) throw new Error(`no cell for ${label}`);
  return cell;
}

describe("too little history to imply anything", () => {
  it("names the state and draws points rather than a line", async () => {
    const { container } = await open();
    expect(screen.getByText(/Not enough history yet/)).toBeInTheDocument();
    expect(lines(container)).toHaveLength(0);
    expect(container.querySelectorAll("figure svg circle").length).toBeGreaterThan(0);
    // No summary either: "lowest in 30 days" from one reading is not a fact about 30 days.
    expect(screen.queryByText("Lowest")).not.toBeInTheDocument();
  });

  it("says a steady price held rather than pretending it was never collected", async () => {
    await open(
      priceHistory({
        series: [
          priceSeries({
            points: [at("2026-07-01T10:00:00Z", "0.4158", { before_window: true })],
          }),
        ],
      }),
    );
    expect(screen.getByText(/No price change in the last 30 days/)).toBeInTheDocument();
    expect(screen.queryByText(/Not enough history yet/)).not.toBeInTheDocument();
  });

  it("says so plainly when nothing has ever been collected", async () => {
    await open(priceHistory({ series: [] }));
    expect(screen.getByText(/No prices have been collected/)).toBeInTheDocument();
  });
});

describe("a store that no longer lists the product", () => {
  it("shows its history and marks it not listed rather than quoting a price", async () => {
    await open(
      priceHistory({
        series: [
          priceSeries({
            points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.4500")],
            current: at("2026-09-13T10:00:00Z", "0.4500"),
          }),
          priceSeries({
            store_id: 2,
            store_name: "SoMa",
            points: [at("2026-09-02T10:00:00Z", "0.6000")],
            current: null,
          }),
        ],
      }),
    );
    const soma = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("SoMa"));
    expect(soma).toBeDefined();
    expect(within(soma!).getByText("not listed")).toBeInTheDocument();
  });
});

describe("the values, without the picture", () => {
  it("publishes the same readings as a table for a screen reader", async () => {
    await open(
      priceHistory({
        series: [
          priceSeries({
            points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.5000")],
            current: at("2026-09-13T10:00:00Z", "0.5000"),
          }),
        ],
      }),
    );
    const table = screen.getByRole("table", { name: /Price history by store/i });
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(2);
    expect(within(table).getAllByText("Safeway · Market St").length).toBeGreaterThan(0);
  });
});

describe("what the chart refuses to claim", () => {
  it("prints no qualifier at all for a row whose basis was never recorded", async () => {
    // `package` would be a claim, not an absence: rendered as "$4.99 pack" over what may
    // have been a per-pound rate, it is the one sentence this app exists to stop saying.
    const { container } = await open(
      priceHistory({
        series: [
          priceSeries({
            points: [
              observation({
                scraped_at: "2026-09-01T10:00:00Z",
                price_basis: null,
                unit_price_unit: null,
              }),
              at("2026-09-05T10:00:00Z", "0.5000"),
            ],
            current: at("2026-09-13T10:00:00Z", "0.5000"),
          }),
        ],
      }),
    );
    hover(container);
    const tip = await screen.findByRole("status");
    expect(within(tip).queryByText(/pack/i)).not.toBeInTheDocument();
    expect(within(tip).getByText("$4.99")).toBeInTheDocument();
  });

  it("does not call two readings at the same price a trend", async () => {
    // A card price moving while the shelf price holds is a real change and is recorded --
    // but it plots two points at the same height, and counting rows called that a trend.
    await open(
      priceHistory({
        series: [
          priceSeries({
            points: [
              at("2026-09-01T10:00:00Z", "0.4158", { loyalty_price: null }),
              at("2026-09-05T10:00:00Z", "0.4158", { loyalty_price: "3.99" }),
            ],
            current: at("2026-09-13T10:00:00Z", "0.4158"),
          }),
        ],
      }),
    );
    expect(screen.getByText(/Not enough history yet|No price change/)).toBeInTheDocument();
    expect(screen.queryByText("Lowest")).not.toBeInTheDocument();
  });

  it("does not say 'now' about a store that no longer lists the product", async () => {
    const { container } = await open(
      priceHistory({
        series: [
          priceSeries({
            store_id: 2,
            store_name: "SoMa",
            points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.4500")],
            current: null,
            availability: null,
          }),
        ],
      }),
    );
    const chart = container.querySelector("figure svg");
    expect(chart?.getAttribute("aria-label")).toContain("last seen at");
    expect(chart?.getAttribute("aria-label")).not.toContain(", now ");
  });

  it("does not present an unconfirmed price as today's answer", async () => {
    await open(
      priceHistory({
        series: [
          priceSeries({
            availability: "unknown",
            stock_reporting: "not_published",
            current: at("2026-09-13T10:00:00Z", "0.4158"),
          }),
        ],
      }),
    );
    expect(screen.queryByText(/now at Safeway/)).not.toBeInTheDocument();
    expect(screen.getByText(/at Safeway · Market St/)).toBeInTheDocument();
    expect(screen.getByText(/Not published/i)).toBeInTheDocument();
  });
});

describe("the narrow viewport", () => {
  it("lays the chart out for a phone, not for the desktop fallback width", async () => {
    // jsdom reports `clientWidth: 0`, so the component always took its desktop fallback and
    // the whole mobile branch -- height, padding, tick count -- was unreachable by any test.
    const wide = await open(
      priceHistory({
        series: [
          priceSeries({
            points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.5000")],
          }),
        ],
      }),
    );
    const wideHeight = wide.container.querySelector("figure svg")?.getAttribute("height");
    cleanup();

    const restore = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 340,
    });
    try {
      const narrow = await open(
        priceHistory({
          series: [
            priceSeries({
              points: [at("2026-09-01T10:00:00Z", "0.4000"), at("2026-09-05T10:00:00Z", "0.5000")],
            }),
          ],
        }),
      );
      // The width arrives from a measurement in an effect, so it lands a render later.
      await waitFor(() =>
        expect(narrow.container.querySelector("figure svg")).toHaveAttribute("width", "340"),
      );
      const svg = narrow.container.querySelector("figure svg");
      expect(svg?.getAttribute("height")).not.toBe(wideHeight);
      // The chart must never be wider than the box it sits in, at any width.
      expect(Number(svg?.getAttribute("width"))).toBeLessThanOrEqual(340);
    } finally {
      if (restore) Object.defineProperty(HTMLElement.prototype, "clientWidth", restore);
      else Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    }
  });
});

/** Move the pointer into the middle of the plot, which is what opens the tooltip. */
function hover(container: HTMLElement): void {
  const svg = container.querySelector("figure svg");
  if (!svg) throw new Error("no chart");
  fireEvent.pointerMove(svg.parentElement!, { clientX: 300, clientY: 60 });
}
