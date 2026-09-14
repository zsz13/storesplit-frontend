import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BasketLineOut, BasketResponse, OfferOut, StoreOut } from "@/lib/api";
import { BasketResults } from "@/components/BasketResults";

function store(overrides: Partial<StoreOut> = {}): StoreOut {
  return {
    id: 1,
    retailer_slug: "lucky",
    retailer_name: "Lucky Supermarkets",
    retailer_host: "shop.luckysupermarkets.com",
    stock_reporting: "live",
    name: "Lucky 23130",
    address_line1: "1 Market St",
    city: "San Francisco",
    state: "CA",
    zip_code: "94105",
    latitude: null,
    longitude: null,
    timezone: null,
    maps_url: null,
    hours_today: {
      state: "unknown",
      opens_at: null,
      closes_at: null,
      opens_day: null,
      closed_all_day: false,
      next_open_at: null,
    },
    ...overrides,
  };
}

function offer(overrides: Partial<OfferOut> = {}): OfferOut {
  return {
    id: 10,
    store: store(),
    retailer_product_id: 1,
    retailer_sku: "sku-1",
    title: "Eggs 12 ct",
    product_url: "https://shop.luckysupermarkets.com/store/lucky-supermarkets/products/1",
    image_url: null,
    price: "4.99",
    price_basis: "package",
    regular_price: "4.99",
    max_total_price: null,
    min_weight: null,
    max_weight: null,
    weight_unit: null,
    loyalty_price: null,
    currency: "USD",
    availability: "in_stock",
    stock_status: "inStock",
    store_context: null,
    unit_price: "0.4158",
    unit_price_unit: "count",
    scraped_at: "2026-09-08T10:00:00Z",
    is_cheapest_for_product: true,
    is_cheapest_overall: true,
    ...overrides,
  };
}

function line(overrides: Partial<BasketLineOut> = {}): BasketLineOut {
  return {
    query: "eggs",
    category: "eggs",
    requested_quantity: "12",
    requested_unit: "count",
    needed_quantity: "12",
    comparison_unit: "egg",
    product_id: 100,
    product_name: "large white eggs",
    brand: "Lucerne",
    offer: offer(),
    packs: 1,
    line_total: "4.99",
    ...overrides,
  };
}

function response(overrides: Partial<BasketResponse> = {}): BasketResponse {
  const only = line();
  return {
    zip_code: "94105",
    availability: "in_stock",
    open_now: false,
    stores: [store()],
    items: [
      {
        query: "eggs",
        category: "eggs",
        category_label: "Eggs",
        needed_quantity: "12",
        comparison_unit: "egg",
        matching_products: 2,
        cheapest: only,
      },
    ],
    single_store_options: [
      {
        store: store(),
        total: "4.99",
        covers_all_items: true,
        missing_items: [],
        lines: [only],
      },
    ],
    cheapest_single_store: {
      store: store(),
      total: "4.99",
      covers_all_items: true,
      missing_items: [],
      lines: [only],
    },
    cheapest_split: { total: "4.99", stores: [store()], lines: [only] },
    savings: "0.00",
    savings_percent: "0.0",
    last_updated_at: "2026-09-08T10:00:00Z",
    oldest_updated_at: "2026-09-08T09:00:00Z",
    ...overrides,
  };
}

describe("BasketResults", () => {
  it("links the recommended product to the retailer's own page", () => {
    render(<BasketResults data={response()} />);
    const link = screen.getAllByRole("link")[0];
    expect(link).toHaveAttribute(
      "href",
      "https://shop.luckysupermarkets.com/store/lucky-supermarkets/products/1",
    );
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders no link at all when the URL is not a page on that retailer", () => {
    // The Lucky bug, as it would reach this component: an object serialized into the field.
    const poisoned = response();
    poisoned.items[0].cheapest!.offer = offer({
      product_url: "{'id': 'dce2530a', 'canonicalUrl': None}",
    });
    render(<BasketResults data={poisoned} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    // The product itself is still shown; only the link is withheld -- and the stored
    // canonical name is title-cased for display, as it is on a search card.
    expect(screen.getAllByText(/Large White Eggs/).length).toBeGreaterThan(0);
  });

  it("renders no link for a URL belonging to a different retailer", () => {
    const wrong = response();
    wrong.items[0].cheapest!.offer = offer({
      product_url: "https://www.wholefoodsmarket.com/grocery/product/a-b01",
    });
    render(<BasketResults data={wrong} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the totals it was given", () => {
    render(<BasketResults data={response()} />);
    expect(screen.getAllByText("$4.99").length).toBeGreaterThan(0);
  });

  it("gives every chosen offer its store, its hours and a way to get there", () => {
    // The reason this component was rebuilt: a basket recommends a shopping trip, and the
    // old tables named a store and said nothing else about it -- no address, no hours, no
    // map, no link to the item. All four now travel with the offer, exactly as they do in
    // search results, because it is the same `StoreLine` in both places.
    const open = store({
      id: 3,
      retailer_slug: "sprouts",
      retailer_name: "Sprouts Farmers Market",
      retailer_host: "shop.sprouts.com",
      name: "Sprouts Farmers Market Daly City (Store #276)",
      address_line1: "301 Gellert Blvd.",
      city: "Daly City",
      maps_url: "https://www.google.com/maps/search/?api=1&query=37.6688%2C-122.4669",
      hours_today: {
        state: "open",
        opens_at: "07:00",
        closes_at: "22:00",
        opens_day: null,
        closed_all_day: false,
        next_open_at: null,
      },
    });
    const sprouts = line({
      offer: offer({
        store: open,
        product_url: "https://shop.sprouts.com/store/sprouts/products/1",
      }),
    });
    const data = response();
    data.cheapest_split = { total: "4.99", stores: [open], lines: [sprouts] };

    render(<BasketResults data={data} />);
    const split = screen.getByRole("region", { name: /split across stores/i });

    expect(
      within(split).getByText("Sprouts Farmers Market Daly City (Store #276)", {
        selector: "span",
      }),
    ).toBeVisible();
    expect(within(split).getByText(/301 Gellert Blvd\./, { selector: "span" })).toBeVisible();
    expect(within(split).getByText("Open until 10:00 PM")).toBeVisible();
    expect(within(split).getByRole("link", { name: /Maps/ })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=37.6688%2C-122.4669",
    );
    expect(within(split).getByRole("link", { name: /View item/ })).toHaveAttribute(
      "href",
      "https://shop.sprouts.com/store/sprouts/products/1",
    );
  });

  it("states the store once for a single-store basket, not once per line", () => {
    // Every line in a one-store basket is at the same shop. Repeating the address and the
    // hours under each of them is the clutter this layout exists to avoid; the line still
    // carries its own item link, because that part really does differ per line.
    render(<BasketResults data={response()} />);
    const single = screen.getByRole("region", { name: /one store/i });

    expect(within(single).getAllByText(/1 Market St/, { selector: "span" })).toHaveLength(1);
    expect(within(single).getAllByRole("link", { name: /View item/ })).toHaveLength(1);
  });

  it("says a store's hours are unavailable rather than implying it is shut", () => {
    render(<BasketResults data={response()} />);
    const single = screen.getByRole("region", { name: /one store/i });

    expect(within(single).getByText("Hours not published")).toBeVisible();
  });

  it("names the items a store cannot cover", () => {
    const partial = response({
      single_store_options: [
        {
          store: store({ id: 2, retailer_name: "Sprouts" }),
          total: "4.99",
          covers_all_items: false,
          missing_items: ["milk"],
          lines: [line()],
        },
      ],
      cheapest_single_store: null,
      cheapest_split: null,
      savings: null,
      savings_percent: null,
    });
    const { container } = render(<BasketResults data={partial} />);
    expect(within(container).getByText(/Milk/)).toBeInTheDocument();
  });
});
