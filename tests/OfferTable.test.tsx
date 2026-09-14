import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfferTable } from "@/components/OfferTable";
import { offer, safeway, wholeFoods } from "./fixtures";
import type { StoreOut } from "@/lib/api";

function withStore(store: Partial<StoreOut>, id = 10) {
  return offer({ id, store: { ...safeway, ...store } });
}

function renderTable(offers = [offer()]) {
  return render(
    <OfferTable offers={offers} category="eggs" packageLabel="12 ct" bestOfferId={null} />,
  );
}

describe("OfferTable store details", () => {
  it("names the exact store and its address", () => {
    renderTable([withStore({ name: "SoMa", address_line1: "399 4th St", city: "San Francisco" })]);

    const row = screen.getByTestId("offer-row");
    expect(within(row).getByText("SoMa")).toBeInTheDocument();
    expect(within(row).getByText(/399 4th St/)).toBeInTheDocument();
  });

  it("shows today's hours for the store", () => {
    renderTable([
      withStore({
        hours_today: {
          state: "open",
          opens_at: "08:00",
          closes_at: "22:00",
          opens_day: null,
          closed_all_day: false,
          next_open_at: null,
        },
      }),
    ]);

    expect(screen.getByText("Open until 10:00 PM")).toBeInTheDocument();
  });

  it("says so when the retailer publishes no hours", () => {
    renderTable([
      withStore({
        hours_today: {
          state: "unknown",
          opens_at: null,
          closes_at: null,
          opens_day: null,
          closed_all_day: false,
          next_open_at: null,
        },
      }),
    ]);

    expect(screen.getByText("Hours not published")).toBeInTheDocument();
  });

  it("links to the store on Google Maps", () => {
    renderTable([
      withStore({ maps_url: "https://www.google.com/maps/search/?api=1&query=37.78%2C-122.39" }),
    ]);

    const maps = screen.getByRole("link", { name: /Maps/ });
    expect(maps).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=37.78%2C-122.39",
    );
    expect(maps).toHaveAttribute("target", "_blank");
    expect(maps).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders no Maps link when the store cannot be pointed at", () => {
    renderTable([withStore({ maps_url: null })]);

    expect(screen.queryByRole("link", { name: /Maps/ })).not.toBeInTheDocument();
  });

  it("renders no Maps link for a URL that is not Google Maps", () => {
    renderTable([withStore({ maps_url: "https://evil.test/maps?q=1" })]);

    expect(screen.queryByRole("link", { name: /Maps/ })).not.toBeInTheDocument();
  });

  it("keeps every offer's own store details with that offer", () => {
    render(
      <OfferTable
        offers={[
          offer({ id: 1, store: { ...safeway, name: "Market St" } }),
          offer({
            id: 2,
            store: {
              ...wholeFoods,
              name: "SoMa",
              hours_today: {
                state: "closed",
                opens_at: "08:00",
                closes_at: "22:00",
                opens_day: "tomorrow",
                closed_all_day: false,
                next_open_at: null,
              },
            },
          }),
        ]}
        category="eggs"
        packageLabel="12 ct"
        bestOfferId={null}
      />,
    );

    const rows = screen.getAllByTestId("offer-row");
    expect(within(rows[0]).getByText("Open until 11:00 PM")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Closed · Opens 8:00 AM tomorrow")).toBeInTheDocument();
  });
});
