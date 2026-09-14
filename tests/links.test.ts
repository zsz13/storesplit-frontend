import { describe, expect, it } from "vitest";
import type { OfferOut } from "@/lib/api";
import { productLinkHref } from "@/lib/links";

const HOSTS: Record<string, string> = {
  lucky: "shop.luckysupermarkets.com",
  wholefoods: "www.wholefoodsmarket.com",
  raleys: "www.raleys.com",
};

function offer(retailerSlug: string, productUrl: unknown, host?: string | null): OfferOut {
  return {
    id: 1,
    store: {
      id: 1,
      retailer_slug: retailerSlug,
      retailer_name: retailerSlug,
      retailer_host: host === undefined ? (HOSTS[retailerSlug] ?? null) : host,
      stock_reporting: "live",
      name: "Store",
      address_line1: null,
      city: null,
      state: null,
      zip_code: null,
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
    },
    retailer_product_id: 1,
    retailer_sku: "sku",
    title: "Product",
    product_url: productUrl as string | null,
    image_url: null,
    price: "1.00",
    price_basis: "package",
    regular_price: "1.00",
    loyalty_price: null,
    max_total_price: null,
    min_weight: null,
    max_weight: null,
    weight_unit: null,
    currency: "USD",
    availability: "in_stock",
    stock_status: null,
    store_context: null,
    unit_price: null,
    unit_price_unit: null,
    scraped_at: "2026-09-08T10:00:00Z",
    is_cheapest_for_product: false,
    is_cheapest_overall: false,
  };
}

describe("productLinkHref", () => {
  it("keeps a real page on the retailer's own host", () => {
    const url = "https://shop.luckysupermarkets.com/store/lucky-supermarkets/products/28294760";
    expect(productLinkHref(offer("lucky", url))).toBe(url);
  });

  it.each([
    ["a stringified payload object", "{'id': 'dce2530a', 'canonicalUrl': None}"],
    ["an object toString", "[object Object]"],
    ["the string None", "None"],
    ["a relative path the browser resolves against our origin", "/store/lucky/products/1"],
    ["a bare token", "28294760"],
    ["an empty string", ""],
    ["whitespace", "   "],
    ["null", null],
    ["a non-string payload", { canonicalUrl: null }],
  ])("renders no link for %s", (_label, value) => {
    expect(productLinkHref(offer("lucky", value))).toBeNull();
  });

  it("refuses a non-https scheme", () => {
    expect(productLinkHref(offer("lucky", "javascript:alert(1)"))).toBeNull();
    expect(productLinkHref(offer("lucky", "http://shop.luckysupermarkets.com/p/1"))).toBeNull();
  });

  it("refuses a URL belonging to a different retailer", () => {
    const wfm = "https://www.wholefoodsmarket.com/grocery/product/a-b01";
    expect(productLinkHref(offer("lucky", wfm))).toBeNull();
    expect(productLinkHref(offer("wholefoods", wfm))).toBe(wfm);
  });

  it("refuses a lookalike host", () => {
    expect(
      productLinkHref(offer("wholefoods", "https://wholefoodsmarket.com.evil.test/p/1")),
    ).toBeNull();
  });

  it("refuses a bare host with no product path", () => {
    expect(productLinkHref(offer("raleys", "https://www.raleys.com"))).toBeNull();
    expect(productLinkHref(offer("raleys", "https://www.raleys.com/"))).toBeNull();
  });

  it("renders no link when the API names no host for the retailer", () => {
    // Fail closed: "belongs to the right retailer" is the thing that could not be checked.
    const url = "https://some-new-grocer.example/product/1";
    expect(productLinkHref(offer("newcomer", url, null))).toBeNull();
  });

  it("uses the host the API supplied rather than a copy kept here", () => {
    const url = "https://newly-moved-host.example/product/1";
    expect(productLinkHref(offer("raleys", url, "newly-moved-host.example"))).toBe(url);
    expect(productLinkHref(offer("raleys", url))).toBeNull();
  });

  it.each([
    ["a backslash smuggling another host", "https://evil.test\\@www.raleys.com/product/1"],
    ["embedded credentials", "https://user:pass@www.raleys.com/product/1"],
  ])("renders no link for %s", (_label, value) => {
    expect(productLinkHref(offer("raleys", value))).toBeNull();
  });
});
