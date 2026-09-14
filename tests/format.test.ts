import { describe, expect, it } from "vitest";
import {
  basketLineLabel,
  brandLabel,
  formatMoney,
  formatPackage,
  formatPercent,
  formatQuantity,
  formatRelativeTime,
  formatUnitPrice,
  productTitle,
  secondaryUnitPriceLabel,
  titleCaseName,
  unitLabel,
} from "@/lib/format";
import type { OfferOut } from "@/lib/api";

describe("formatMoney", () => {
  it("formats decimal strings from the API", () => {
    expect(formatMoney("4.99")).toBe("$4.99");
    expect(formatMoney("12")).toBe("$12.00");
    expect(formatMoney(0.5)).toBe("$0.50");
  });

  it("falls back to a dash for missing or invalid values", () => {
    expect(formatMoney(null)).toBe("-");
    expect(formatMoney(undefined)).toBe("-");
    expect(formatMoney("abc")).toBe("-");
  });
});

describe("formatUnitPrice and unitLabel", () => {
  it("labels counted eggs per egg", () => {
    expect(formatUnitPrice("0.42", "count", "eggs")).toBe("$0.42 / egg");
    expect(unitLabel("count", "eggs")).toBe("egg");
  });

  it("uses each for generic counts and passes through weight/volume units", () => {
    expect(formatUnitPrice("1.25", "count", "bread")).toBe("$1.25 / each");
    expect(formatUnitPrice("3.49", "gal", "milk")).toBe("$3.49 / gal");
    expect(formatUnitPrice("0.19", "oz", "bread")).toBe("$0.19 / oz");
    expect(formatUnitPrice("2.99", "lb")).toBe("$2.99 / lb");
  });

  it("handles a missing unit price", () => {
    expect(formatUnitPrice(null, "lb")).toBe("-");
  });
});

describe("formatPackage", () => {
  it("shows count packages", () => {
    expect(
      formatPackage({ count: 12, quantity: null, quantity_unit: null, comparison_unit: "count" }),
    ).toBe("12 ct");
  });

  it("shows quantity with unit", () => {
    expect(
      formatPackage({
        count: null,
        quantity: "64.0000",
        quantity_unit: "fl oz",
        comparison_unit: "gal",
      }),
    ).toBe("64 fl oz");
  });

  it("falls back to the comparison unit for loose items", () => {
    expect(
      formatPackage({ count: null, quantity: null, quantity_unit: null, comparison_unit: "lb" }),
    ).toBe("per lb");
  });
});

describe("formatQuantity and formatPercent", () => {
  it("trims trailing zeros", () => {
    expect(formatQuantity("12.0000")).toBe("12");
    expect(formatQuantity("0.5000")).toBe("0.5");
    expect(formatPercent("12.5")).toBe("12.5%");
    expect(formatPercent("20.00")).toBe("20%");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-09-08T12:00:00Z");

  it("is deterministic given now", () => {
    expect(formatRelativeTime("2026-09-08T11:59:40Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-09-08T11:55:00Z", now)).toBe("5 min ago");
    expect(formatRelativeTime("2026-09-08T09:00:00Z", now)).toBe("3 h ago");
    expect(formatRelativeTime("2026-09-06T12:00:00Z", now)).toBe("2 d ago");
    expect(formatRelativeTime("2026-06-08T12:00:00Z", now)).toBe("3 mo ago");
  });

  it("handles missing or invalid timestamps", () => {
    expect(formatRelativeTime(null, now)).toBe("unknown");
    expect(formatRelativeTime("not a date", now)).toBe("unknown");
  });
});

describe("basketLineLabel", () => {
  const line = (over: Partial<OfferOut> & { packs?: number } = {}) => ({
    packs: over.packs ?? 3,
    offer: {
      price: over.price ?? "4.99",
      price_basis: over.price_basis ?? ("package" as const),
      currency: "USD",
    },
  });

  it("counts packages for a fixed package", () => {
    expect(basketLineLabel(line())).toBe("3 × $4.99");
  });

  it("counts pounds for a price that is a rate", () => {
    // The backend divides what you need by the product's comparison quantity, which for a
    // weighed product is one pound. "3 × $2.59" would say three trays.
    expect(basketLineLabel(line({ price: "2.59", price_basis: "lb" }))).toBe("3 lb × $2.59");
  });
});

/**
 * The secondary conversion is a convenience, and a convenience that prints a number is still
 * a number a shopper will act on. These tests pin the two things that make it safe: it never
 * touches the comparable price above it, and it never invents precision the data has not got.
 */
describe("secondaryUnitPriceLabel", () => {
  const weighed = (over: Partial<OfferOut> = {}) =>
    ({
      price: "2.59",
      price_basis: "lb" as const,
      unit_price: "2.5900",
      unit_price_unit: "lb",
      currency: "USD",
      ...over,
    }) as OfferOut;

  it("offers ounces beside a per-pound comparison", () => {
    expect(secondaryUnitPriceLabel(weighed())).toBe("≈ $0.16 / oz");
  });

  it("offers pounds beside a per-ounce comparison", () => {
    expect(
      secondaryUnitPriceLabel(
        weighed({
          price: "3.49",
          price_basis: "package",
          unit_price: "0.1900",
          unit_price_unit: "oz",
        }),
      ),
    ).toBe("≈ $3.04 / lb");
  });

  it("converts a fixed package that is still compared by weight", () => {
    // Bread is sold as a sealed loaf and compared per ounce: the package price is fixed, but
    // a comparable weight unit exists, so the conversion is not redundant.
    expect(
      secondaryUnitPriceLabel(
        weighed({
          price: "4.29",
          price_basis: "package",
          unit_price: "0.2100",
          unit_price_unit: "oz",
        }),
      ),
    ).toBe("≈ $3.36 / lb");
  });

  it("says nothing for counted or volume comparisons", () => {
    expect(
      secondaryUnitPriceLabel(
        weighed({
          price: "4.99",
          price_basis: "package",
          unit_price: "0.4158",
          unit_price_unit: "count",
        }),
      ),
    ).toBeNull();
    expect(
      secondaryUnitPriceLabel(
        weighed({
          price: "3.49",
          price_basis: "package",
          unit_price: "3.4900",
          unit_price_unit: "gal",
        }),
      ),
    ).toBeNull();
    expect(
      secondaryUnitPriceLabel(
        weighed({
          price: "1.29",
          price_basis: "each",
          unit_price: "1.2900",
          unit_price_unit: "count",
        }),
      ),
    ).toBeNull();
  });

  it("lands back on the retailer's own rate when the retailer quotes that unit", () => {
    // The backend derives the per-pound comparison from this very rate ($0.37 x 16 = $5.92),
    // so converting it back has to return what Target said rather than drift off it. The
    // round trip is exact: 4-decimal quantization moves a per-pound figure by at most
    // $0.0008, and it takes $0.005 to move a cent.
    expect(
      secondaryUnitPriceLabel(
        weighed({ price: "0.37", price_basis: "oz", unit_price: "5.9200", unit_price_unit: "lb" }),
      ),
    ).toBe("≈ $0.37 / oz");
  });

  it("is not fooled by a unit name that every object answers to", () => {
    // `MASS_UNITS[key]` on a plain object finds inherited members, and a function is not
    // nullish, so a `?? null` guard alone would let "constructor" through as a weight and
    // print "≈ $41.44 / lb" under a per-pound price.
    for (const unit of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(secondaryUnitPriceLabel(weighed({ unit_price_unit: unit }))).toBeNull();
    }
  });

  it("keeps sub-cent precision even when the currency code is unusable", () => {
    // An unreadable currency falls back to dollars; it must not also fall back to two
    // decimals, because that reintroduces the "$0.00" this line exists to avoid.
    expect(
      secondaryUnitPriceLabel(
        weighed({ price: "0.04", unit_price: "0.0400", currency: "not-a-currency" }),
      ),
    ).toBe("≈ $0.0025 / oz");
  });

  it("rounds to two decimals like every other price on the card", () => {
    expect(secondaryUnitPriceLabel(weighed({ price: "5.99", unit_price: "5.9900" }))).toBe(
      "≈ $0.37 / oz",
    );
    expect(secondaryUnitPriceLabel(weighed({ price: "1.60", unit_price: "1.6000" }))).toBe(
      "≈ $0.10 / oz",
    );
  });

  it("extends precision rather than pricing something at zero", () => {
    expect(secondaryUnitPriceLabel(weighed({ price: "0.04", unit_price: "0.0400" }))).toBe(
      "≈ $0.0025 / oz",
    );
  });

  it("gives up rather than print a zero it cannot escape", () => {
    expect(secondaryUnitPriceLabel(weighed({ price: "0.0001", unit_price: "0.0001" }))).toBeNull();
  });

  it("gives up on a missing or unrecognized comparison unit", () => {
    expect(secondaryUnitPriceLabel(weighed({ unit_price_unit: null }))).toBeNull();
    expect(secondaryUnitPriceLabel(weighed({ unit_price_unit: "widget" }))).toBeNull();
  });

  it("gives up when there is no unit price to convert", () => {
    expect(secondaryUnitPriceLabel(weighed({ unit_price: null }))).toBeNull();
    expect(secondaryUnitPriceLabel(weighed({ unit_price: "abc" }))).toBeNull();
    expect(secondaryUnitPriceLabel(weighed({ unit_price: "0" }))).toBeNull();
  });
});

describe("titleCaseName", () => {
  it("writes a stored canonical name the way a person would", () => {
    expect(titleCaseName("premium med grain rice")).toBe("Premium Med Grain Rice");
    expect(titleCaseName("long grain brown rice")).toBe("Long Grain Brown Rice");
    expect(titleCaseName("boneless skinless chicken breast")).toBe(
      "Boneless Skinless Chicken Breast",
    );
  });

  it("leaves casing that is already stated exactly as it is", () => {
    // The fixture names, and anything a backend that preserves retailer casing would send.
    expect(titleCaseName("Large White Eggs")).toBe("Large White Eggs");
    expect(titleCaseName("KerryGold Irish Butter")).toBe("KerryGold Irish Butter");
    expect(titleCaseName("organic eXtra large eggs")).toBe("Organic eXtra Large Eggs");
  });

  it("cases known tokens as tokens rather than as words", () => {
    expect(titleCaseName("100 usda organic certified large brown eggs")).toBe(
      "100 USDA Organic Certified Large Brown Eggs",
    );
    expect(titleCaseName("cage free grade aa brown eggs")).toBe("Cage Free Grade AA Brown Eggs");
    expect(titleCaseName("organic regenerative uht a2 whole milk")).toBe(
      "Organic Regenerative UHT A2 Whole Milk",
    );
    expect(titleCaseName("premium jasmine rice gluten free non gmo")).toBe(
      "Premium Jasmine Rice Gluten Free Non GMO",
    );
  });

  it("keeps a minor word lowercase inside a title and capital at either end", () => {
    expect(titleCaseName("365 by whole foods market")).toBe("365 by Whole Foods Market");
    expect(titleCaseName("mahatma extra long enriched rice in bag")).toBe(
      "Mahatma Extra Long Enriched Rice in Bag",
    );
    // First and last are never demoted, however minor the word is.
    expect(titleCaseName("by bag by bag by")).toBe("By Bag by Bag By");
  });

  it("leaves a token that starts with a digit alone and raises a letter after a break", () => {
    expect(titleCaseName("2 reduced fat milk")).toBe("2 Reduced Fat Milk");
    expect(titleCaseName("100pct whole milk")).toBe("100pct Whole Milk");
    expect(titleCaseName("extra-large free/range eggs")).toBe("Extra-Large Free/Range Eggs");
  });

  it("is empty for nothing, and collapses the whitespace it is given", () => {
    expect(titleCaseName(null)).toBe("");
    expect(titleCaseName("")).toBe("");
    expect(titleCaseName("  long   grain  rice \n")).toBe("Long Grain Rice");
  });
});

describe("productTitle and brandLabel", () => {
  it("read a product and its brand the same way", () => {
    expect(productTitle({ brand: "mogami", normalized_name: "premium med grain rice" })).toBe(
      "Premium Med Grain Rice",
    );
    expect(brandLabel("365 by whole foods market")).toBe("365 by Whole Foods Market");
    expect(brandLabel(null)).toBe("");
  });
});
