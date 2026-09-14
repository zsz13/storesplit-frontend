import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, compareBasket: vi.fn() };
});

import type { BasketResponse } from "@/lib/api";
import { safeway } from "./fixtures";

const EMPTY_RESULT: BasketResponse = {
  zip_code: "94105",
  availability: "in_stock",
  open_now: false,
  stores: [safeway],
  items: [],
  single_store_options: [],
  cheapest_single_store: null,
  cheapest_split: null,
  savings: null,
  savings_percent: null,
  last_updated_at: null,
  oldest_updated_at: null,
};

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
  // A returning visitor; the no-location state has its own tests at the end of this file.
  window.localStorage.setItem("storesplit.zip", "94105");
  // No shared link unless a test puts one there: `?b=` is read once per mount, and one left
  // behind would arrive in the next test's basket.
  window.history.replaceState(null, "", "/basket");
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

/** The clipboard jsdom does not have. Reassigned per test so a refusal can be staged. */
let writeText = vi.fn();

const shareButton = () => screen.getByRole("button", { name: "Share basket" });

/**
 * Seed the persisted basket and mount the view.
 *
 * `useBasket` caches the loaded items in a module-level variable -- it is one basket shared
 * by every component that asks for it -- so the module graph is reset per test. Otherwise
 * the first test's basket is still in memory for the second, whatever localStorage says.
 */
async function mount(items: Array<{ id: string; query: string; quantity: number; unit: string }>) {
  vi.resetModules();
  window.localStorage.setItem("storesplit.basket", JSON.stringify(items));
  const { compareBasket } = await import("@/lib/api");
  const { BasketView } = await import("@/components/BasketView");
  const compare = vi.mocked(compareBasket);
  compare.mockResolvedValue(EMPTY_RESULT);
  render(<BasketView />);
  return compare;
}

const compareButton = () => screen.getByRole("button", { name: /^Compare/ });

describe("a basket a previous build left in an impossible state", () => {
  it("repairs a legacy bread/count row instead of greeting the shopper with an error", async () => {
    // The reported bug: opening /basket showed "Bread / This unit does not fit this item"
    // over a basket nobody had touched, because bread's own default used to be `count`.
    // A row StoreSplit itself broke is StoreSplit's to fix, so it is fixed on load.
    const compare = await mount([{ id: "b", query: "bread", quantity: 1, unit: "count" }]);

    expect(screen.queryByText("This unit does not fit this item.")).not.toBeInTheDocument();
    expect(screen.queryByText(/needs fixing or removing/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Unit of Bread")).toHaveValue("lb");
    expect(compareButton()).toBeEnabled();

    fireEvent.click(compareButton());
    await waitFor(() => expect(compare).toHaveBeenCalled());
    // The category default, not a converted count: there is no number of pounds "1 count"
    // was ever going to mean.
    expect(compare.mock.calls[0][0].items).toEqual([{ query: "bread", quantity: 1, unit: "lb" }]);
  });

  it("carries the quantity across when the stored unit measures the same thing", async () => {
    const compare = await mount([{ id: "b", query: "milk", quantity: 2, unit: "qt" }]);

    fireEvent.click(compareButton());
    await waitFor(() => expect(compare).toHaveBeenCalled());
    expect(compare.mock.calls[0][0].items).toEqual([{ query: "milk", quantity: 2, unit: "qt" }]);
  });
});

describe("a basket holding a row only a shopper could have made", () => {
  it("blocks the comparison instead of sending the rest", async () => {
    // The requirement is unchanged for genuine user data: an invalid row stays visible and
    // stops the compare rather than being quietly dropped from the request.
    const compare = await mount([
      { id: "a", query: "eggs", quantity: 1, unit: "dozen" },
      { id: "b", query: "saffron", quantity: 1, unit: "g" },
    ]);

    expect(compareButton()).toBeDisabled();
    expect(screen.getByText(/needs fixing or removing/)).toBeInTheDocument();

    fireEvent.click(compareButton());
    expect(compare).not.toHaveBeenCalled();
  });

  it("keeps the offending row on screen so it can be removed", async () => {
    await mount([{ id: "b", query: "saffron", quantity: 1, unit: "g" }]);

    expect(screen.getByText("Not a staple StoreSplit compares.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Saffron" })).toBeInTheDocument();
  });

  it("counts more than one blocking row", async () => {
    await mount([
      { id: "a", query: "saffron", quantity: 1, unit: "g" },
      { id: "b", query: "vanilla", quantity: 1, unit: "g" },
    ]);

    expect(screen.getByText(/2 items need fixing or removing/)).toBeInTheDocument();
  });

  it("blocks a quantity typed below the item's minimum, and names it", async () => {
    // A thousandth of a pound is under a gram, the least a weighed row can state. Storage
    // raises a quantity it finds too small; typing one is a decision, and the shopper is told
    // the floor rather than having their number silently multiplied.
    await mount([{ id: "b", query: "bread", quantity: 1, unit: "lb" }]);

    fireEvent.change(screen.getByLabelText("Quantity of Bread"), { target: { value: "0.001" } });

    expect(compareButton()).toBeDisabled();
    expect(screen.getByText("Enter at least 0.0022 lb.")).toBeInTheDocument();
  });

  it("compares once the offending row is removed", async () => {
    const compare = await mount([
      { id: "a", query: "eggs", quantity: 1, unit: "dozen" },
      { id: "b", query: "saffron", quantity: 1, unit: "g" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Saffron" }));

    expect(compareButton()).toBeEnabled();
    fireEvent.click(compareButton());
    await waitFor(() => expect(compare).toHaveBeenCalled());
    expect(compare.mock.calls[0][0].items).toEqual([{ query: "eggs", quantity: 1, unit: "dozen" }]);
  });

  it("converts the quantity when the unit changes, rather than reinterpreting it", async () => {
    const compare = await mount([{ id: "b", query: "bread", quantity: 1, unit: "lb" }]);

    fireEvent.change(screen.getByLabelText("Unit of Bread"), { target: { value: "oz" } });

    expect(screen.getByLabelText("Quantity of Bread")).toHaveValue(16);
    fireEvent.click(compareButton());
    await waitFor(() => expect(compare).toHaveBeenCalled());
    expect(compare.mock.calls[0][0].items).toEqual([{ query: "bread", quantity: 16, unit: "oz" }]);
  });
});

describe("a basket every row of which is priceable", () => {
  it("sends the whole basket", async () => {
    const compare = await mount([
      { id: "a", query: "eggs", quantity: 1, unit: "dozen" },
      { id: "b", query: "milk", quantity: 1, unit: "gal" },
    ]);

    fireEvent.click(compareButton());

    await waitFor(() => expect(compare).toHaveBeenCalled());
    expect(compare.mock.calls[0][0].items).toHaveLength(2);
  });

  it("carries the open-now filter into the request", async () => {
    const compare = await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    fireEvent.click(screen.getByRole("button", { name: /^Open now/ }));
    fireEvent.click(compareButton());

    await waitFor(() => expect(compare).toHaveBeenCalled());
    expect(compare.mock.calls[0][0].open_now).toBe(true);
  });
});

describe('the basket\'s "everything closed" dialog', () => {
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

  it("opens when the filter left nothing to compare", async () => {
    const compare = await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    compare.mockResolvedValue({ ...EMPTY_RESULT, open_now: true, stores: [shut] });

    fireEvent.click(screen.getByRole("button", { name: /^Open now/ }));
    fireEvent.click(compareButton());

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Every store near you is closed");
    expect(dialog).toHaveTextContent("opens 6:00 AM tomorrow");
  });

  it("stays shut when the basket still priced somewhere", async () => {
    // Unknown-hours stores are kept by the filter, so a basket can price perfectly well
    // while nothing is confirmed open. A modal over those results would contradict them.
    const compare = await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    compare.mockResolvedValue({
      ...EMPTY_RESULT,
      open_now: true,
      stores: [shut],
      single_store_options: [
        {
          store: safeway,
          total: "4.99",
          covers_all_items: true,
          missing_items: [],
          lines: [],
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: /^Open now/ }));
    fireEvent.click(compareButton());

    await waitFor(() => expect(compare).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays shut while the filter is off", async () => {
    const compare = await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    compare.mockResolvedValue({ ...EMPTY_RESULT, open_now: false, stores: [shut] });

    fireEvent.click(compareButton());

    await waitFor(() => expect(compare).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("before a location has been chosen", () => {
  it("builds the basket but will not compare it", async () => {
    // A basket is a shopping list and is worth writing without a ZIP; only the comparison
    // needs one, because a comparison is a statement about particular shops.
    window.localStorage.removeItem("storesplit.zip");
    const compare = await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    expect(screen.getByText("Choose a location first")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity of Eggs")).toBeInTheDocument();
    expect(compareButton()).toBeDisabled();

    fireEvent.click(compareButton());
    expect(compare).not.toHaveBeenCalled();
  });
});

/**
 * A basket handed to somebody else.
 *
 * What travels is what the shopper decided: the staples, the amounts and the units. What
 * does not travel is every answer StoreSplit worked out around them -- the prices, the
 * stores, which one was cheapest, whether any of them is open. Those are facts about one
 * moment and one neighbourhood, and the whole point of the link is that the receiver gets
 * their own.
 */
describe("sharing a basket", () => {
  const linkField = () => screen.getByLabelText("Basket link") as HTMLInputElement;

  /**
   * The dialog's own markup is in the document from the first render -- a `<dialog>` holds
   * its children whether or not it is open -- so every test here waits on the *open* dialog
   * rather than on a sentence inside it. Waiting on the text would pass before the click
   * had been handled at all, for the fallback wording that is on screen from the start.
   */
  const openDialog = () => screen.findByRole("dialog");

  it("copies the link and says so", async () => {
    await mount([
      { id: "a", query: "eggs", quantity: 1, unit: "dozen" },
      { id: "b", query: "milk", quantity: 2, unit: "qt" },
    ]);

    fireEvent.click(shareButton());
    const dialog = await openDialog();

    expect(within(dialog).getByText("Basket link copied")).toBeInTheDocument();
    expect(linkField().value).toMatch(/\/basket\?b=[\w-]+$/);
    expect(writeText).toHaveBeenCalledWith(linkField().value);
    expect(within(dialog).getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("carries the basket and not the results", async () => {
    const compare = await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    fireEvent.click(compareButton());
    await waitFor(() => expect(compare).toHaveBeenCalled());

    fireEvent.click(shareButton());
    await openDialog();

    const encoded = new URL(linkField().value).searchParams.get("b") ?? "";
    const payload = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    expect(payload).toContain("eggs");
    // No prices, no stores, no ZIP: the receiver's own location answers all three.
    expect(payload).not.toContain("94105");
    expect(payload).not.toContain("Safeway");
  });

  it("opens anyway when the clipboard is refused, and says what to do instead", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    fireEvent.click(shareButton());
    const dialog = await openDialog();

    expect(within(dialog).getByText("Copy this link to share your basket.")).toBeInTheDocument();
    expect(linkField().value).toMatch(/\/basket\?b=/);
    expect(within(dialog).getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("opens anyway on a browser with no clipboard at all", async () => {
    Object.defineProperty(window.navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    fireEvent.click(shareButton());
    const dialog = await openDialog();

    expect(within(dialog).getByText("Copy this link to share your basket.")).toBeInTheDocument();
    expect(linkField().value).toMatch(/\/basket\?b=/);
  });

  it("copies from its own button after a refusal", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    fireEvent.click(shareButton());
    const dialog = await openDialog();
    expect(within(dialog).getByText("Copy this link to share your basket.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Copy link" }));

    expect(await within(dialog).findByText("Basket link copied")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("offers the link to be selected and copied by hand", async () => {
    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    fireEvent.click(shareButton());
    await openDialog();

    expect(linkField()).toHaveAttribute("readonly");
    fireEvent.focus(linkField());
    expect(linkField().selectionStart).toBe(0);
    expect(linkField().selectionEnd).toBe(linkField().value.length);
  });

  it("closes on the Close button", async () => {
    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    fireEvent.click(shareButton());
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  /**
   * Escape is the platform's, and this is the wiring it arrives on: a native `<dialog>`
   * dismissed by the key fires `close`, and React's idea of open has to follow the
   * element's or the dialog can never be reopened.
   */
  it("follows the dialog when the platform closes it", async () => {
    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    fireEvent.click(shareButton());
    const dialog = await openDialog();

    fireEvent(dialog, new Event("close"));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // And it opens again, which is what a stale `open` would have prevented.
    fireEvent.click(shareButton());
    expect(await openDialog()).toBeInTheDocument();
  });

  it("stays closed when a copy settles after the dialog was dismissed", async () => {
    // A browser can stall a clipboard write on focus or a permission prompt. Writing the
    // captured state back when it finally settles would reopen a dialog the shopper shut.
    const pending: Array<() => void> = [];
    writeText.mockImplementation(() => new Promise<void>((resolve) => pending.push(resolve)));
    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    fireEvent.click(shareButton());
    await waitFor(() => expect(pending).toHaveLength(1));
    pending.shift()?.();
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "Copied" }));
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    pending.shift()?.();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shares the basket as it stands now, not as it stood the first time", async () => {
    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    fireEvent.click(shareButton());
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "+ Rice" }));
    fireEvent.click(shareButton());
    await openDialog();

    const { decodeBasket } = await import("@/lib/share");
    const encoded = new URL(linkField().value).searchParams.get("b") ?? "";
    expect(decodeBasket(encoded)?.map((i) => i.query)).toEqual(["eggs", "rice"]);
  });

  it("is not offered for a basket with nothing priceable in it", async () => {
    await mount([{ id: "b", query: "saffron", quantity: 1, unit: "g" }]);
    expect(shareButton()).toBeDisabled();
  });
});

/**
 * Opening somebody else's link.
 *
 * A basket already on this browser is somebody's shopping list, so the link never replaces
 * one without being asked. An empty basket has nothing to lose and is simply filled.
 */
describe("a basket arriving in a link", () => {
  /** The link a sharer would have sent, built by the encoder that builds the real one. */
  async function openLink(items: Array<{ query: string; quantity: number; unit: string }>) {
    const { encodeBasket } = await import("@/lib/share");
    const { createItem } = await import("@/lib/basket");
    return encodeBasket(items.map((i) => createItem(i.query, i.quantity, i.unit)));
  }

  it("fills an empty basket and says where it came from", async () => {
    const encoded = await openLink([
      { query: "eggs", quantity: 1, unit: "dozen" },
      { query: "chicken breast", quantity: 2, unit: "lb" },
    ]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);

    await mount([]);

    await screen.findByText(/Shared basket opened, 2 items/);
    expect(screen.getByLabelText("Quantity of Eggs")).toHaveValue(1);
    expect(screen.getByLabelText("Quantity of Chicken Breast")).toHaveValue(2);
    expect(screen.getByLabelText("Unit of Chicken Breast")).toHaveValue("lb");
  });

  it("takes the parameter back out of the address bar", async () => {
    const encoded = await openLink([{ query: "eggs", quantity: 1, unit: "dozen" }]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);

    await mount([]);

    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("asks before replacing a basket that is already here", async () => {
    const encoded = await openLink([{ query: "milk", quantity: 1, unit: "gal" }]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);

    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    await screen.findByText("Someone shared a basket with you");
    // Still theirs until they say otherwise, and the offer names what it holds.
    expect(screen.getByLabelText("Quantity of Eggs")).toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity of Milk")).not.toBeInTheDocument();
    expect(screen.getByText("Milk")).toBeInTheDocument();
  });

  it("keeps the shopper's own basket when they say so", async () => {
    const encoded = await openLink([{ query: "milk", quantity: 1, unit: "gal" }]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);

    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    fireEvent.click(await screen.findByRole("button", { name: "Keep my basket" }));

    expect(screen.queryByText("Someone shared a basket with you")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quantity of Eggs")).toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity of Milk")).not.toBeInTheDocument();
  });

  it("replaces it when they ask for the shared one", async () => {
    const encoded = await openLink([{ query: "milk", quantity: 1, unit: "gal" }]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);

    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    fireEvent.click(await screen.findByRole("button", { name: "Open shared basket" }));

    expect(screen.getByLabelText("Quantity of Milk")).toHaveValue(1);
    expect(screen.queryByLabelText("Quantity of Eggs")).not.toBeInTheDocument();
    expect(screen.getByText(/Shared basket opened, 1 item/)).toBeInTheDocument();
  });

  it("says so when the link cannot be read, and leaves the basket alone", async () => {
    window.history.replaceState(null, "", "/basket?b=not-a-real-basket");

    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    await screen.findByText(/could not be read/);
    expect(screen.getByLabelText("Quantity of Eggs")).toBeInTheDocument();
  });

  /**
   * A shopper who followed a link to see what a basket costs *here* has already asked the
   * question. Pressing Compare over a basket they did not write would be confirming the
   * thing they just clicked, so the page answers instead.
   */
  it("prices itself, against the ZIP of whoever opened it", async () => {
    const encoded = await openLink([{ query: "milk", quantity: 2, unit: "qt" }]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);
    window.localStorage.setItem("storesplit.zip", "60601");

    const compare = await mount([]);

    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));
    expect(compare.mock.calls[0][0]).toMatchObject({
      zip_code: "60601",
      items: [{ query: "milk", quantity: 2, unit: "qt" }],
    });
    expect(await screen.findByText(/worked out for your location/)).toBeInTheDocument();
  });

  it("prices the shared basket when the offer is accepted, too", async () => {
    const encoded = await openLink([{ query: "milk", quantity: 1, unit: "gal" }]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);

    const compare = await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    // Nothing is priced while the shopper is still being asked which basket wins.
    await screen.findByText("Someone shared a basket with you");
    expect(compare).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open shared basket" }));

    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));
    expect(compare.mock.calls[0][0].items).toEqual([{ query: "milk", quantity: 1, unit: "gal" }]);
  });

  it("leaves a basket the shopper built themselves alone", async () => {
    const compare = await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);

    await screen.findByRole("button", { name: /^Compare/ });
    expect(compare).not.toHaveBeenCalled();
  });

  /**
   * The commonest shared link of all is somebody's first visit, and a first visit has no
   * ZIP: the location dialog is in front of them. The comparison waits for an answer to
   * that rather than being dropped, so choosing a location prices the basket they arrived
   * holding.
   */
  it("waits for a location rather than giving up, then prices itself", async () => {
    const encoded = await openLink([{ query: "milk", quantity: 1, unit: "gal" }]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);
    window.localStorage.removeItem("storesplit.zip");

    const compare = await mount([]);
    await screen.findByText(/Choose a location and it will be priced for you/);
    expect(compare).not.toHaveBeenCalled();

    await act(async () => {
      window.localStorage.setItem("storesplit.zip", "60601");
      window.dispatchEvent(new Event("storesplit:zip"));
    });

    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));
    expect(compare.mock.calls[0][0]).toMatchObject({ zip_code: "60601" });
  });
});

/**
 * A link is a one-time instruction.
 *
 * The module graph outlives a client-side navigation, so everything that decides whether a
 * `?b=` has already been acted on has to outlive it too. These mount the view twice against
 * the *same* modules -- deliberately not calling `vi.resetModules()` between them -- because
 * that is the only arrangement in which the bug they cover can happen: `?b=` is stripped
 * from the address bar on the first pass, so a second pass is reading nothing but memory.
 */
describe("a shared link, after the shopper has walked away and come back", () => {
  /** Mount `/basket` again, as `next/link` does: same modules, same stored basket. */
  async function remount() {
    cleanup();
    const { BasketView } = await import("@/components/BasketView");
    render(<BasketView />);
  }

  it("does not price itself again on the way back to the page", async () => {
    const { encodeBasket } = await import("@/lib/share");
    const { createItem } = await import("@/lib/basket");
    const encoded = encodeBasket([createItem("milk", 1, "gal")]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);

    const compare = await mount([]);
    await waitFor(() => expect(compare).toHaveBeenCalledTimes(1));

    await remount();

    await screen.findByLabelText("Quantity of Milk");
    expect(compare).toHaveBeenCalledTimes(1);
  });

  it("is not applied a second time over what was edited since", async () => {
    const encoded = await (async () => {
      const { encodeBasket } = await import("@/lib/share");
      const { createItem } = await import("@/lib/basket");
      return encodeBasket([createItem("eggs", 1, "dozen")]);
    })();
    window.history.replaceState(null, "", `/basket?b=${encoded}`);

    await mount([]);
    await screen.findByText(/Shared basket opened/);

    // The shopper adds something of their own to the basket the link gave them.
    fireEvent.click(screen.getByRole("button", { name: "+ Rice" }));
    expect(screen.getByLabelText("Quantity of Rice")).toBeInTheDocument();

    await remount();

    expect(screen.getByLabelText("Quantity of Rice")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity of Eggs")).toBeInTheDocument();
  });

  it("does not re-ask an offer the shopper already answered", async () => {
    const { encodeBasket } = await import("@/lib/share");
    const { createItem } = await import("@/lib/basket");
    const encoded = encodeBasket([createItem("milk", 1, "gal")]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);

    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    fireEvent.click(await screen.findByRole("button", { name: "Keep my basket" }));

    await remount();

    expect(screen.queryByText("Someone shared a basket with you")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quantity of Eggs")).toBeInTheDocument();
  });
});

describe("an offer, while the shopper decides", () => {
  async function offerOver(
    stored: Array<{ id: string; query: string; quantity: number; unit: string }>,
  ) {
    vi.resetModules();
    const { encodeBasket } = await import("@/lib/share");
    const { createItem } = await import("@/lib/basket");
    const encoded = encodeBasket([createItem("milk", 1, "gal")]);
    window.history.replaceState(null, "", `/basket?b=${encoded}`);
    return mount(stored);
  }

  /**
   * Clearing is the likeliest way to *accept* a shared basket -- make room, then open it --
   * and the link it came from was stripped from the address bar the moment it was read. So
   * the offer has to survive the clear, or it is gone with no way back to it.
   */
  it("survives the shopper clearing their own basket to make room", async () => {
    await offerOver([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    await screen.findByText("Someone shared a basket with you");

    fireEvent.click(screen.getByRole("button", { name: "Clear basket" }));

    expect(screen.getByText("Someone shared a basket with you")).toBeInTheDocument();
    expect(screen.getByText(/nothing of yours is replaced/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open shared basket" }));
    expect(screen.getByLabelText("Quantity of Milk")).toHaveValue(1);
  });
});

describe("the actions beside the basket", () => {
  it("sends the shopper to the ZIP field rather than describing where it is", async () => {
    await mount([{ id: "a", query: "eggs", quantity: 1, unit: "dozen" }]);
    // The field itself is rendered by the header, which this view does not mount, so it is
    // stood up here: the assertion is that the button reaches whatever holds that id.
    const field = document.createElement("input");
    field.id = "zip-input";
    document.body.append(field);

    fireEvent.click(screen.getByRole("button", { name: "Change ZIP" }));

    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it("will not share a basket it will not compare", async () => {
    await mount([
      { id: "a", query: "eggs", quantity: 1, unit: "dozen" },
      { id: "b", query: "saffron", quantity: 1, unit: "g" },
    ]);

    // A link carries only the priceable rows, so sharing here would send one item of the
    // two on screen and say nothing about it.
    expect(shareButton()).toBeDisabled();
    expect(compareButton()).toBeDisabled();
    expect(screen.getByText(/compared or shared/)).toBeInTheDocument();
  });
});
