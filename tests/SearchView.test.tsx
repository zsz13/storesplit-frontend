import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, searchProducts: vi.fn(), refreshPrices: vi.fn() };
});

import { ApiError, refreshPrices, searchProducts } from "@/lib/api";
import { SearchView } from "@/components/SearchView";
import {
  freshness,
  offer,
  product,
  safeway,
  searchResponse,
  traderJoes,
  wholeFoods,
} from "./fixtures";

const searchMock = vi.mocked(searchProducts);
const refreshMock = vi.mocked(refreshPrices);

async function searchFor(staple = "eggs") {
  render(<SearchView />);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${staple}$`, "i") }));
  await waitFor(() => expect(searchMock).toHaveBeenCalled());
}

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
  vi.clearAllMocks();
  window.localStorage.clear();
  // A returning visitor. The first-visit state -- no stored ZIP -- has its own tests below;
  // everything else here is about what happens once a location has been chosen.
  window.localStorage.setItem("storesplit.zip", "94105");
});

describe("grouping and the collapsed card", () => {
  it("shows one card per canonical product however many stores carry it", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        products: [
          product({
            offers: [
              offer({ id: 10, store: safeway, price: "4.99", unit_price: "0.4158" }),
              offer({ id: 11, store: wholeFoods, price: "5.49", unit_price: "0.4575" }),
            ],
          }),
        ],
      }),
    );
    await searchFor();

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText(/2 offers at 2 retailers/i)).toBeInTheDocument();
  });

  it("shows only the best in-stock offer before the card is expanded", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        products: [
          product({
            offers: [
              offer({ id: 10, store: safeway, price: "4.99", unit_price: "0.4158" }),
              offer({ id: 11, store: wholeFoods, price: "5.49", unit_price: "0.4575" }),
            ],
          }),
        ],
      }),
    );
    await searchFor();

    expect((await screen.findAllByText("$4.99"))[0]).toBeVisible();
    // The dearer offer is in the collapsed panel, and the collapsed panel is not shown.
    expect(screen.getByText("$5.49")).not.toBeVisible();
    for (const row of screen.getAllByTestId("offer-row")) expect(row).not.toBeVisible();
  });

  it("never shows a price for a product with nothing in stock", async () => {
    const unknown = offer({ id: 12, availability: "unknown", price: "3.29" });
    searchMock.mockResolvedValue(
      searchResponse({
        availability: "unknown",
        products: [product({ offers: [unknown], best_offer: null, best_offer_id: null })],
      }),
    );
    await searchFor();

    const card = await screen.findByRole("article");
    // Safeway does publish stock, so an unreadable answer is stated as one.
    expect(within(card).getAllByText(/stock not confirmed/i)[0]).toBeVisible();
    // The price is quoted as a floor, never as an answer, and carries no "cheapest" badge.
    expect(within(card).queryByText(/cheapest overall/i)).not.toBeInTheDocument();
  });
});

describe("expanding a card in place", () => {
  it("reveals every offer without navigating or re-fetching", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        products: [
          product({
            offers: [
              offer({ id: 10, store: safeway, price: "4.99" }),
              offer({ id: 11, store: wholeFoods, price: "5.49" }),
            ],
          }),
        ],
      }),
    );
    await searchFor();
    const callsBefore = searchMock.mock.calls.length;

    fireEvent.click(await screen.findByRole("button", { name: /compare 2 offers/i }));

    expect(await screen.findByText("$5.49")).toBeInTheDocument();
    expect(screen.getAllByTestId("offer-row")).toHaveLength(2);
    expect(searchMock).toHaveBeenCalledTimes(callsBefore);
  });

  it("marks the disclosure state for assistive technology", async () => {
    searchMock.mockResolvedValue(searchResponse());
    await searchFor();

    const toggle = await screen.findByRole("button", { name: /offer details|compare/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("renders a retailer link only when the URL belongs to that retailer", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        products: [
          product({
            offers: [
              offer({ id: 10, product_url: "https://www.safeway.com/shop/p/1" }),
              // Resolves against StoreSplit's own origin, so it must never become a link.
              offer({ id: 11, store: wholeFoods, product_url: "/grocery/product/x" }),
            ],
          }),
        ],
      }),
    );
    await searchFor();
    fireEvent.click(await screen.findByRole("button", { name: /compare 2 offers/i }));

    // Each row also carries a Maps link now, so the product link is named rather than
    // assumed to be the only one.
    const rows = screen.getAllByTestId("offer-row");
    expect(within(rows[0]).getByRole("link", { name: /^View/ })).toHaveAttribute(
      "href",
      "https://www.safeway.com/shop/p/1",
    );
    expect(within(rows[1]).queryByRole("link", { name: /^View/ })).not.toBeInTheDocument();
    expect(within(rows[1]).getByText(/no item page/i)).toBeInTheDocument();
  });
});

describe("pagination", () => {
  it("pages by product and asks the API for the next page", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        page: {
          page: 1,
          page_size: 20,
          total_products: 41,
          total_pages: 3,
          has_next: true,
          has_previous: false,
        },
      }),
    );
    await searchFor();

    const pager = await screen.findByRole("navigation", { name: /results pages/i });
    expect(within(pager).getByText(/page 1 of 3/i)).toBeInTheDocument();
    expect(within(pager).getByText(/41 products/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() =>
      expect(searchMock).toHaveBeenLastCalledWith(
        "eggs",
        "94105",
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it("hides the pager when everything fits on one page", async () => {
    searchMock.mockResolvedValue(searchResponse());
    await searchFor();

    await screen.findByRole("article");
    expect(screen.queryByRole("navigation", { name: /results pages/i })).not.toBeInTheDocument();
  });
});

describe("freshness and refresh", () => {
  it("shows results immediately and a refreshing state while revalidating", async () => {
    searchMock.mockResolvedValue(
      searchResponse({ freshness: freshness({ is_stale: true, refreshing: true }) }),
    );
    await searchFor();

    // Stale-while-revalidate: the prices are on screen, and so is the fact they are being
    // collected again.
    expect(await screen.findByRole("article")).toBeInTheDocument();
    expect(screen.getAllByText(/refreshing/i).length).toBeGreaterThan(0);
  });

  it("asks the backend to refresh the ZIP and category on screen", async () => {
    searchMock.mockResolvedValue(searchResponse());
    refreshMock.mockResolvedValue({
      state: "started",
      zip_code: "94105",
      category: "eggs",
      category_label: "Eggs",
      freshness: freshness({ refreshing: true }),
    });
    await searchFor();

    fireEvent.click(await screen.findByRole("button", { name: /refresh prices/i }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledWith("94105", "eggs"));
  });

  it("disables the button and counts down while the key is cooling down", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        freshness: freshness({ can_refresh: false, refresh_available_in_seconds: 272 }),
      }),
    );
    await searchFor();

    const button = await screen.findByRole("button", { name: /refresh available in 4:32/i });
    expect(button).toBeDisabled();
  });

  it("adopts the cooldown the refresh reported, without waiting for another search", async () => {
    searchMock.mockResolvedValue(searchResponse());
    refreshMock.mockResolvedValue({
      state: "cooling_down",
      zip_code: "94105",
      category: "eggs",
      category_label: "Eggs",
      freshness: freshness({ can_refresh: false, refresh_available_in_seconds: 180 }),
    });
    await searchFor();

    fireEvent.click(await screen.findByRole("button", { name: /refresh prices/i }));

    expect(
      await screen.findByRole("button", { name: /refresh available in 3:00/i }),
    ).toBeDisabled();
  });

  it("keeps the last results on screen when a refresh failed", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        freshness: freshness({ last_error: "RuntimeError: retailer unreachable" }),
      }),
    );
    await searchFor();

    expect(await screen.findByRole("article")).toBeInTheDocument();
    expect(screen.getByText(/last refresh failed/i)).toBeInTheDocument();
    expect(screen.getAllByText("$4.99")[0]).toBeVisible();
  });
});

describe("the revalidation poll", () => {
  it("re-asks while the backend is collecting, and stops when it finishes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      searchMock.mockResolvedValue(
        searchResponse({ freshness: freshness({ is_stale: true, refreshing: true }) }),
      );
      await searchFor();
      const afterFirst = searchMock.mock.calls.length;

      await vi.advanceTimersByTimeAsync(5_100);
      expect(searchMock.mock.calls.length).toBe(afterFirst + 1);

      // The backend says it has finished; the loop must stop rather than poll forever.
      searchMock.mockResolvedValue(searchResponse({ freshness: freshness() }));
      await vi.advanceTimersByTimeAsync(5_100);
      const afterStop = searchMock.mock.calls.length;
      await vi.advanceTimersByTimeAsync(30_000);

      expect(searchMock.mock.calls.length).toBe(afterStop);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not lose a page change to an in-flight poll", async () => {
    // The poll used to hold the page it started with. Clicking Next while `Refreshing…` was
    // showing let the timer fire, abort the page request and put the old page back, with no
    // error and nothing to explain it.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      searchMock.mockResolvedValue(
        searchResponse({
          freshness: freshness({ is_stale: true, refreshing: true }),
          page: {
            page: 1,
            page_size: 20,
            total_products: 41,
            total_pages: 3,
            has_next: true,
            has_previous: false,
          },
        }),
      );
      await searchFor();

      fireEvent.click(screen.getByRole("button", { name: /next/i }));
      await vi.advanceTimersByTimeAsync(6_000);

      const pages = searchMock.mock.calls.map((call) => call[2]?.page);
      expect(pages[0]).toBe(1); // the original search
      // Nothing after the click may ask for page one again: the poll must follow the reader.
      expect(pages.slice(1)).toEqual(pages.slice(1).map(() => 2));
      expect(pages.at(-1)).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("a refresh that could not be started", () => {
  it("keeps the results and says the button failed", async () => {
    searchMock.mockResolvedValue(searchResponse());
    refreshMock.mockRejectedValue(new ApiError("Could not reach the API at http://localhost:8000"));
    await searchFor();

    fireEvent.click(await screen.findByRole("button", { name: /refresh prices/i }));

    expect(await screen.findByText(/could not start a refresh/i)).toBeInTheDocument();
    // The last valid prices are still on screen, and the button is usable again.
    expect(screen.getAllByText("$4.99")[0]).toBeVisible();
    expect(screen.getByRole("button", { name: /refresh prices/i })).toBeEnabled();
  });
});

describe("filters and empty states", () => {
  it("re-queries the backend when the availability filter changes", async () => {
    searchMock.mockResolvedValue(searchResponse());
    await searchFor();

    fireEvent.click(screen.getByRole("radio", { name: /^all$/i }));

    await waitFor(() =>
      expect(searchMock).toHaveBeenLastCalledWith(
        "eggs",
        "94105",
        expect.objectContaining({ availability: "all" }),
      ),
    );
  });

  it("offers the filter, not a refresh, when the filter hid everything", async () => {
    searchMock.mockResolvedValue(
      searchResponse({ products: [], offers_before_filter: 7, page: undefined }),
    );
    await searchFor();

    expect(await screen.findByText(/no in-stock offers/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show all 7 offers/i })).toBeInTheDocument();
  });

  it("offers a refresh when nothing has been collected at all", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        products: [],
        offers_before_filter: 0,
        freshness: freshness({ last_updated_at: null, age_seconds: null, is_stale: true }),
      }),
    );
    await searchFor();

    expect(await screen.findByText(/no prices collected/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /refresh prices/i }).length).toBeGreaterThan(0);
  });

  it("keeps unknown-stock products in their own labelled section", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        unknown_products: [
          product({
            id: 200,
            brand: "Trader Joe's",
            offers: [offer({ id: 30, availability: "unknown", store: traderJoes })],
            best_offer: null,
            best_offer_id: null,
          }),
        ],
      }),
    );
    await searchFor();

    const section = await screen.findByRole("region", { name: /also sold nearby/i });
    expect(within(section).getAllByText(/Trader Joe's/)[0]).toBeInTheDocument();
    expect(within(section).getByText(/never win Cheapest/i)).toBeInTheDocument();
  });

  it("says a retailer does not publish stock, rather than calling it unknown", async () => {
    // The wording this replaced read as a fault of StoreSplit's. Trader Joe's states no
    // shelf stock anywhere; the price, the store and the page are all real.
    searchMock.mockResolvedValue(
      searchResponse({
        unknown_products: [
          product({
            id: 200,
            offers: [offer({ id: 30, availability: "unknown", store: traderJoes })],
            best_offer: null,
            best_offer_id: null,
          }),
        ],
      }),
    );
    await searchFor();

    const section = await screen.findByRole("region", { name: /also sold nearby/i });
    expect(
      within(section).getAllByText(/availability not published|not published/i)[0],
    ).toBeVisible();
    expect(within(section).getAllByText(/check in store/i)[0]).toBeVisible();
    expect(within(section).queryByText(/stock unknown/i)).not.toBeInTheDocument();
    // Still excluded from the comparison: no badge, no headline price.
    expect(within(section).queryByText(/cheapest overall/i)).not.toBeInTheDocument();
  });

  it("keeps the cautious wording for a retailer that does publish stock", async () => {
    // Safeway states inventory, so an unreadable answer is a gap and says so. Excusing it
    // as "the retailer does not publish this" would be the wrong sentence the other way.
    searchMock.mockResolvedValue(
      searchResponse({
        unknown_products: [
          product({
            id: 201,
            offers: [offer({ id: 31, availability: "unknown" })],
            best_offer: null,
            best_offer_id: null,
          }),
        ],
      }),
    );
    await searchFor();

    const section = await screen.findByRole("region", { name: /also sold nearby/i });
    expect(within(section).getAllByText(/stock not confirmed/i)[0]).toBeVisible();
    expect(within(section).queryByText(/availability not published/i)).not.toBeInTheDocument();
  });

  it("offers the ounce conversion on a card nobody can buy today", async () => {
    // The out-of-stock card renders its own unit price rather than a PriceBlock, and a
    // shopper scanning a column of weighed chicken should not find the ounce line appearing
    // and disappearing with the stock status.
    searchMock.mockResolvedValue(
      searchResponse({
        unknown_products: [
          product({
            id: 201,
            category: "chicken_breast",
            brand: "Target",
            normalized_name: "Boneless Skinless Chicken Breast",
            offers: [
              offer({
                id: 31,
                availability: "unknown",
                price: "2.59",
                price_basis: "lb",
                unit_price: "2.5900",
                unit_price_unit: "lb",
              }),
            ],
            best_offer: null,
            best_offer_id: null,
          }),
        ],
      }),
    );
    await searchFor();

    // The collapsed summary comes first in the DOM; the offer table below it is in the tree
    // but hidden until the card is expanded, so both carry the same two lines.
    const section = await screen.findByRole("region", { name: /also sold nearby/i });
    const [collapsedRate] = within(section).getAllByText("$2.59 / lb");
    const [collapsedOunces] = within(section).getAllByText("\u2248 $0.16 / oz");

    expect(collapsedRate).toBeVisible();
    expect(collapsedOunces).toBeVisible();
  });

  it("says so when the query is not a staple it can compare", async () => {
    searchMock.mockResolvedValue(
      searchResponse({
        query: "kumquat",
        category: null,
        category_label: null,
        comparison_unit: null,
        products: [],
      }),
    );
    render(<SearchView />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "kumquat" } });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByText(/is not a staple StoreSplit compares/i)).toBeInTheDocument();
  });
});

describe("the Open now filter", () => {
  /** The filter chip, anchored: the store disclosure beside it also says "N open now". */
  const openNowChip = () => screen.getByRole("button", { name: /^Open now/ });

  it("re-queries the backend rather than hiding rows here", async () => {
    // The backend also decides which offer is cheapest, so narrowing the store set in the
    // browser would leave the badge on an offer that had just been hidden.
    searchMock.mockResolvedValue(searchResponse({ stores: [safeway] }));
    await searchFor();

    fireEvent.click(openNowChip());

    await waitFor(() =>
      expect(searchMock).toHaveBeenLastCalledWith(
        "eggs",
        "94105",
        expect.objectContaining({ openNow: true, page: 1 }),
      ),
    );
  });

  it("reports the state the server applied, not the one that was clicked", async () => {
    searchMock.mockResolvedValue(searchResponse({ stores: [safeway], open_now: false }));
    await searchFor();

    expect(openNowChip()).toHaveAttribute("aria-pressed", "false");
  });

  it("counts the stores that are open beside the control", async () => {
    const shut = {
      ...wholeFoods,
      hours_today: { ...wholeFoods.hours_today, state: "closed" as const },
    };
    searchMock.mockResolvedValue(searchResponse({ stores: [safeway, shut], open_now: true }));
    await searchFor();

    expect(openNowChip()).toHaveTextContent("1");
  });

  it("opens the dialog when the filter leaves nothing open, and names what opens first", async () => {
    const shut = {
      ...safeway,
      hours_today: {
        state: "closed" as const,
        opens_at: "06:00",
        closes_at: "23:00",
        opens_day: "tomorrow",
        closed_all_day: false,
        next_open_at: "2026-09-13T13:00:00Z",
      },
    };
    searchMock.mockResolvedValue(searchResponse({ stores: [shut], products: [], open_now: true }));
    await searchFor();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Every store near you is closed/)).toBeInTheDocument();
    expect(within(dialog).getByRole("listitem")).toHaveTextContent("opens 6:00 AM tomorrow");
  });

  it("leaves the dialog shut while the filter is off, however many shops are closed", async () => {
    const shut = { ...safeway, hours_today: { ...safeway.hours_today, state: "closed" as const } };
    searchMock.mockResolvedValue(searchResponse({ stores: [shut], open_now: false }));
    await searchFor();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("before a location has been chosen", () => {
  beforeEach(() => {
    window.localStorage.removeItem("storesplit.zip");
  });

  it("asks for one instead of searching a ZIP nobody picked", () => {
    // The default used to be `94105`, so a first-time visitor in Chicago was quietly shown
    // San Francisco prices. There is no default now, and no query is possible without one.
    render(<SearchView />);

    expect(screen.getByText("Choose a location first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Use my location/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^eggs$/i })).not.toBeInTheDocument();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("searches as soon as a ZIP is stored", async () => {
    searchMock.mockResolvedValue(searchResponse({}));
    render(<SearchView />);

    window.localStorage.setItem("storesplit.zip", "60601");
    fireEvent(window, new Event("storesplit:zip"));

    fireEvent.click(await screen.findByRole("button", { name: /^eggs$/i }));
    await waitFor(() => expect(searchMock).toHaveBeenCalled());
    expect(searchMock.mock.calls[0][1]).toBe("60601");
  });
});
