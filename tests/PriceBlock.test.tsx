import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PriceBlock } from "@/components/PriceBlock";
import { offer } from "./fixtures";

/**
 * The second line of a price block says what the number above it is *for*, and getting that
 * wrong is what this file exists to stop.
 *
 * Target sells A-86676070 at $2.59 per pound in trays weighing 2.5-5.25 lb. StoreSplit used
 * to render "$0.49 / lb" over "$2.59 for the pack" -- the rate divided by the tray's own
 * upper weight, above the rate itself relabelled as a total. Both halves were wrong, and
 * together they made the most expensive-looking chicken on the shelf look like the cheapest.
 */

const valuePack = offer({
  title: "Fresh All Natural Boneless & Skinless Chicken Breast Value Pack - 2.5-5.25lbs",
  price: "2.59",
  price_basis: "lb",
  regular_price: "2.59",
  unit_price: "2.5900",
  unit_price_unit: "lb",
  max_total_price: "12.95",
  min_weight: "2.5000",
  max_weight: "5.2500",
  weight_unit: "lb",
});

describe("PriceBlock, variable weight", () => {
  it("sets the retailer's own rate as the comparable price", () => {
    render(<PriceBlock offer={valuePack} category="chicken_breast" />);

    expect(screen.getByText("$2.59 / lb")).toBeVisible();
  });

  it("never presents a per-pound rate as the price of the pack", () => {
    render(<PriceBlock offer={valuePack} category="chicken_breast" />);

    expect(screen.queryByText("for the pack")).not.toBeInTheDocument();
    expect(screen.queryByText(/^\$2\.59$/)).not.toBeInTheDocument();
  });

  it("shows the published weight range and says the total depends on it", () => {
    render(<PriceBlock offer={valuePack} category="chicken_breast" />);

    expect(screen.getByText("2.5–5.25 lb · final price based on weight")).toBeVisible();
  });

  it("shows the retailer's own ceiling, labelled as a ceiling", () => {
    render(<PriceBlock offer={valuePack} category="chicken_breast" />);

    expect(screen.getByText(/up to \$12\.95/)).toBeVisible();
  });

  it("never derives a ceiling the retailer did not publish", () => {
    // $2.59 x 5.25 lb is $13.60. Target charges at most $12.95, so a computed figure would be
    // wrong -- and with no figure at all the line is simply absent.
    render(
      <PriceBlock offer={{ ...valuePack, max_total_price: null }} category="chicken_breast" />,
    );

    expect(screen.queryByText(/up to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/13\.60/)).not.toBeInTheDocument();
    expect(screen.getByText("2.5–5.25 lb · final price based on weight")).toBeVisible();
  });

  it("still says the total depends on weight when no range was published", () => {
    render(
      <PriceBlock
        offer={{
          ...valuePack,
          min_weight: null,
          max_weight: null,
          weight_unit: null,
          max_total_price: null,
        }}
        category="chicken_breast"
      />,
    );

    expect(screen.getByText("final price based on weight")).toBeVisible();
  });
});

describe("PriceBlock, fixed package", () => {
  it("still shows the pack price beneath the unit price", () => {
    render(<PriceBlock offer={offer()} category="eggs" />);

    expect(screen.getByText("$0.42 / egg")).toBeVisible();
    expect(screen.getByText("$4.99")).toBeVisible();
    expect(screen.getByText("for the pack")).toBeInTheDocument();
  });

  it("says nothing about weight", () => {
    render(<PriceBlock offer={offer()} category="eggs" />);

    expect(screen.queryByText(/based on weight/)).not.toBeInTheDocument();
  });

  it("marks a real reduction against the regular price", () => {
    render(
      <PriceBlock
        offer={offer({ price: "3.99", regular_price: "4.99", unit_price: "0.3325" })}
        category="eggs"
      />,
    );

    expect(screen.getByText("$4.99")).toBeVisible();
    expect(screen.getByText("Regular price")).toBeInTheDocument();
  });

  it("shows a loyalty price as needing the card", () => {
    render(<PriceBlock offer={offer({ loyalty_price: "3.49" })} category="eggs" />);

    expect(screen.getByText("$3.49 with card")).toBeVisible();
  });
});

/**
 * The ounce line is a convenience for a shopper who thinks in ounces, and its whole risk is
 * that it looks exactly as authoritative as the comparable price above it. So it is checked
 * for what it must never do: replace that price, move the ranking, or appear over a dozen
 * eggs, where there is no weight to convert.
 *
 * Both fixtures are the reported Target SKUs, with the numbers the backend's own
 * `test_variable_weight_api.py` pins from Target's payloads: A-86676070 is $2.59/lb over a
 * 2.5-5.25 lb tray capped at $12.95, A-84991365 is $5.99/lb over 1.25-2.5 lb capped at $11.98.
 */
const fosterFarms = offer({
  title: "Foster Farms No Antibiotics Ever Boneless Skinless Chicken Breasts - 1.25-2.5lbs",
  price: "5.99",
  price_basis: "lb",
  regular_price: "5.99",
  unit_price: "5.9900",
  unit_price_unit: "lb",
  max_total_price: "11.98",
  min_weight: "1.2500",
  max_weight: "2.5000",
  weight_unit: "lb",
});

describe("PriceBlock, secondary ounce conversion", () => {
  it("offers ounces beneath Target's per-pound chicken breast", () => {
    render(<PriceBlock offer={valuePack} category="chicken_breast" />);

    expect(screen.getByText("$2.59 / lb")).toBeVisible();
    expect(screen.getByText("≈ $0.16 / oz")).toBeVisible();
  });

  it("offers ounces beneath Target's second per-pound chicken breast", () => {
    render(<PriceBlock offer={fosterFarms} category="chicken_breast" />);

    expect(screen.getByText("$5.99 / lb")).toBeVisible();
    expect(screen.getByText("≈ $0.37 / oz")).toBeVisible();
  });

  it("never puts the converted price where the comparable one belongs", () => {
    // The list is ranked by the per-pound price, so the per-pound price stays the headline.
    // An ounce figure set large would be the cheapest-looking number on a card that is not
    // the cheapest, which is the exact failure the price block already exists to prevent.
    // The conversion also has to sit immediately under the rate it restates -- adrift at the
    // bottom of the block it reads as a fact about some other line.
    const { container } = render(<PriceBlock offer={valuePack} category="chicken_breast" />);
    const lines = Array.from(container.querySelectorAll("span")).map((el) => el.textContent);

    expect(lines[0]).toBe("$2.59 / lb");
    expect(lines[1]).toBe("≈ $0.16 / oz");
  });

  it("keeps the comparison unit large when the retailer quotes the other one", () => {
    // Target and Walmart can price an item per ounce inside a category compared per pound.
    // The ranked column is per pound, so per pound stays the headline whatever the retailer
    // quotes, and the retailer's own unit becomes the line underneath.
    const perOunce = offer({
      title: "Deli Sliced Chicken Breast",
      price: "0.37",
      price_basis: "oz",
      regular_price: "0.37",
      unit_price: "5.9200",
      unit_price_unit: "lb",
      max_total_price: null,
      min_weight: null,
      max_weight: null,
      weight_unit: null,
    });
    const { container } = render(<PriceBlock offer={perOunce} category="chicken_breast" />);
    const lines = Array.from(container.querySelectorAll("span")).map((el) => el.textContent);

    expect(lines[0]).toBe("$5.92 / lb");
    expect(lines[1]).toBe("≈ $0.37 / oz");
  });

  it("converts a fixed package that a category compares by weight", () => {
    // Bread: the price is a package total, but the comparison is per ounce, so a pound
    // figure is a real second reading rather than a redundant one.
    const loaf = offer({
      title: "Dave's Killer Bread 21 Whole Grains - 27oz",
      price: "5.99",
      price_basis: "package",
      regular_price: "5.99",
      unit_price: "0.2219",
      unit_price_unit: "oz",
    });
    render(<PriceBlock offer={loaf} category="bread" />);

    expect(screen.getByText("$0.22 / oz")).toBeVisible();
    expect(screen.getByText("≈ $3.55 / lb")).toBeVisible();
  });

  it("leaves the weight range and the retailer's ceiling untouched", () => {
    render(<PriceBlock offer={valuePack} category="chicken_breast" />);

    expect(screen.getByText("2.5–5.25 lb · final price based on weight")).toBeVisible();
    expect(screen.getByText(/up to \$12\.95/)).toBeVisible();
  });

  it("offers the same conversion in an expanded offer row", () => {
    render(<PriceBlock offer={valuePack} category="chicken_breast" variant="row" />);

    expect(screen.getByText("≈ $0.16 / oz")).toBeVisible();
  });

  it("says nothing about ounces over a dozen eggs", () => {
    render(<PriceBlock offer={offer()} category="eggs" />);

    expect(screen.queryByText(/oz/)).not.toBeInTheDocument();
    expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
  });
});
