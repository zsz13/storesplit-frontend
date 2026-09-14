import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getPriceHistory: vi.fn() };
});

import { getPriceHistory } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";
import { priceHistory, product } from "./fixtures";

const historyMock = vi.mocked(getPriceHistory);

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
  historyMock.mockResolvedValue(priceHistory());
});

describe("the price-history action", () => {
  it("is on the card, and costs nothing until it is used", () => {
    render(<ProductCard product={product()} cheapestOfferId={null} />);
    expect(screen.getByRole("button", { name: /price history/i })).toBeInTheDocument();
    // Twenty cards on a page must not be twenty queries against a table that grows for ever.
    expect(historyMock).not.toHaveBeenCalled();
  });

  it("opens the chart for this product when pressed", async () => {
    render(<ProductCard product={product({ id: 42 })} cheapestOfferId={null} />);
    fireEvent.click(screen.getByRole("button", { name: /price history/i }));
    await waitFor(() => expect(historyMock).toHaveBeenCalledWith(42, 30, expect.any(AbortSignal)));
    // The dialog names the same product the card does: `productTitle` is the one place
    // that decides what a product is called.
    const headings = await screen.findAllByRole("heading", { name: /Large White Eggs/i });
    expect(headings.length).toBeGreaterThan(1);
  });

  it("does not disturb the disclosure beside it", () => {
    render(<ProductCard product={product()} cheapestOfferId={null} />);
    const disclosure = screen.getByRole("button", { name: /offer details|compare/i });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /price history/i }));
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
  });
});

describe("how a card names its product", () => {
  it("title-cases the stored canonical name rather than printing the database row", () => {
    // The reported symptom, on the surface it was reported from. A case-insensitive matcher
    // here would pass against the raw `normalized_name` and prove nothing, so the assertion
    // is exact.
    render(
      <ProductCard
        product={product({ normalized_name: "premium med grain rice", brand: null })}
        cheapestOfferId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Premium Med Grain Rice", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("premium med grain rice")).not.toBeInTheDocument();
  });

  it("cases the brand too, and keeps a minor word lowercase inside it", () => {
    render(
      <ProductCard
        product={product({ brand: "365 by whole foods market", normalized_name: "white bread" })}
        cheapestOfferId={null}
      />,
    );

    // `textContent`, not the rendered glyphs: the card sets the brand in small caps with CSS,
    // and it is the text a screen reader announces and a shopper copies that has to be right.
    expect(screen.getByText("365 by Whole Foods Market")).toBeInTheDocument();
  });

  it("uses the same name for the picture's alt text", () => {
    render(
      <ProductCard
        product={product({
          normalized_name: "long grain brown rice",
          image_url: "https://cdn.example.com/rice.jpg",
        })}
        cheapestOfferId={null}
      />,
    );

    expect(screen.getByRole("img", { name: "Long Grain Brown Rice" })).toBeInTheDocument();
  });
});
