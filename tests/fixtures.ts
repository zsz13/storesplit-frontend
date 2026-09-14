import type {
  FreshnessOut,
  OfferOut,
  PriceHistoryResponse,
  PriceObservationOut,
  PriceSeriesOut,
  ProductOut,
  SearchResponse,
  StoreOut,
} from "@/lib/api";

/** Builders for API-shaped fixtures, so a schema change breaks one file rather than five. */

export const safeway: StoreOut = {
  id: 1,
  retailer_slug: "safeway",
  retailer_name: "Safeway",
  retailer_host: "www.safeway.com",
  stock_reporting: "live",
  name: "Market St",
  address_line1: "1 Market St",
  city: "San Francisco",
  state: "CA",
  zip_code: "94105",
  latitude: 37.7936,
  longitude: -122.3965,
  timezone: "America/Los_Angeles",
  maps_url: "https://www.google.com/maps/search/?api=1&query=37.7936%2C-122.3965",
  hours_today: {
    state: "open",
    opens_at: "06:00",
    closes_at: "23:00",
    opens_day: null,
    closed_all_day: false,
    next_open_at: null,
  },
};

export const wholeFoods: StoreOut = {
  ...safeway,
  id: 2,
  retailer_slug: "wholefoods",
  retailer_name: "Whole Foods",
  retailer_host: "www.wholefoodsmarket.com",
  name: "SoMa",
};

/** Trader Joe's: real prices, real links, and no shelf stock published anywhere. */
export const traderJoes: StoreOut = {
  ...safeway,
  id: 3,
  retailer_slug: "traderjoes",
  retailer_name: "Trader Joe's",
  retailer_host: "www.traderjoes.com",
  stock_reporting: "not_published",
  name: "Nob Hill (200)",
  hours_today: {
    state: "unknown",
    opens_at: null,
    closes_at: null,
    opens_day: null,
    closed_all_day: false,
    next_open_at: null,
  },
};

export function offer(overrides: Partial<OfferOut> = {}): OfferOut {
  return {
    id: 10,
    store: safeway,
    retailer_product_id: 1000,
    retailer_sku: "sku-1",
    title: "Lucerne Large White Eggs, 12 ct",
    product_url: "https://www.safeway.com/shop/product-details.1000.html",
    image_url: "https://images.albertsons-media.com/is/image/ABS/1000",
    price: "4.99",
    price_basis: "package",
    regular_price: "4.99",
    loyalty_price: null,
    max_total_price: null,
    min_weight: null,
    max_weight: null,
    weight_unit: null,
    currency: "USD",
    availability: "in_stock",
    stock_status: null,
    store_context: null,
    unit_price: "0.4158",
    unit_price_unit: "count",
    scraped_at: "2026-09-10T10:00:00Z",
    is_cheapest_for_product: false,
    is_cheapest_overall: false,
    ...overrides,
  };
}

export function product(overrides: Partial<ProductOut> = {}): ProductOut {
  const offers = overrides.offers ?? [offer()];
  const best = overrides.best_offer !== undefined ? overrides.best_offer : (offers[0] ?? null);
  return {
    id: 100,
    category: "eggs",
    brand: "Lucerne",
    normalized_name: "Large White Eggs",
    quantity: "12.0000",
    quantity_unit: "count",
    count: 12,
    gtin: null,
    comparison_unit: "count",
    comparison_quantity: "12.0000",
    attributes: {},
    image_url: offers[0]?.image_url ?? null,
    best_offer_id: best?.id ?? null,
    best_offer: best,
    offer_count: offers.length,
    in_stock_offer_count: offers.filter((o) => o.availability === "in_stock").length,
    retailer_count: new Set(offers.map((o) => o.store.retailer_slug)).size,
    store_count: new Set(offers.map((o) => o.store.id)).size,
    price_low: offers[0]?.price ?? null,
    price_high: offers[offers.length - 1]?.price ?? null,
    ...overrides,
    offers,
  };
}

export function freshness(overrides: Partial<FreshnessOut> = {}): FreshnessOut {
  return {
    last_updated_at: "2026-09-10T10:00:00Z",
    age_seconds: 120,
    ttl_seconds: 1800,
    is_stale: false,
    refreshing: false,
    refresh_started_at: null,
    refresh_finished_at: null,
    cooldown_seconds: 300,
    refresh_available_in_seconds: 0,
    can_refresh: true,
    last_error: null,
    ...overrides,
  };
}

export function searchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  const products = overrides.products ?? [product()];
  return {
    query: "eggs",
    zip_code: "94105",
    category: "eggs",
    category_label: "Eggs",
    comparison_unit: "count",
    availability: "in_stock",
    open_now: false,
    offers_before_filter: 2,
    stores: [safeway, wholeFoods],
    unknown_products: [],
    cheapest_offer_id: 10,
    last_updated_at: "2026-09-10T10:00:00Z",
    freshness: freshness(),
    page: {
      page: 1,
      page_size: 20,
      total_products: products.length,
      total_pages: 1,
      has_next: false,
      has_previous: false,
    },
    ...overrides,
    products,
  };
}

/** One price observation. Unit price is the axis; the pack price is context beside it. */
export function observation(overrides: Partial<PriceObservationOut> = {}): PriceObservationOut {
  return {
    scraped_at: "2026-09-10T10:00:00Z",
    price: "4.99",
    regular_price: "4.99",
    loyalty_price: null,
    unit_price: "0.4158",
    price_basis: "package",
    unit_price_unit: "egg",
    before_window: false,
    ...overrides,
  };
}

export function priceSeries(overrides: Partial<PriceSeriesOut> = {}): PriceSeriesOut {
  return {
    retailer_product_id: 1000,
    retailer_sku: "sku-1",
    retailer_slug: "safeway",
    retailer_name: "Safeway",
    store_id: 1,
    store_name: "Market St",
    store_city: "San Francisco",
    current: observation({ scraped_at: "2026-09-13T10:00:00Z" }),
    availability: "in_stock",
    stock_reporting: "live",
    points: [observation()],
    truncated: false,
    ...overrides,
  };
}

export function priceHistory(overrides: Partial<PriceHistoryResponse> = {}): PriceHistoryResponse {
  return {
    product_id: 100,
    product_name: "Large White Eggs",
    category: "eggs",
    comparison_unit: "egg",
    currency: "USD",
    days: 30,
    since: "2026-08-14T10:00:00Z",
    now: "2026-09-13T10:00:00Z",
    series: [priceSeries()],
    ...overrides,
  };
}
