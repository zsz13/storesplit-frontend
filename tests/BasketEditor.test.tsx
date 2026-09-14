import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BasketEditor } from "@/components/BasketEditor";
import { STAPLES, type BasketItem } from "@/lib/basket";
import { titleCaseName } from "@/lib/format";

const eggs: BasketItem = { id: "a", query: "eggs", quantity: 1, unit: "dozen" };
const bread: BasketItem = { id: "b", query: "bread", quantity: 1, unit: "lb" };

function unitOptionsFor(query: string): string[] {
  const select = screen.getByLabelText(`Unit of ${titleCaseName(query)}`);
  return within(select)
    .getAllByRole("option")
    .map((o) => o.textContent ?? "");
}

describe("the units a row offers", () => {
  it("offers only what fits the item, not the whole global list", () => {
    render(<BasketEditor items={[eggs, bread]} dispatch={vi.fn()} />);

    expect(unitOptionsFor("eggs")).toEqual(["count", "dozen"]);
    expect(unitOptionsFor("bread")).toEqual(["lb", "oz", "g", "kg"]);
  });

  it("never offers count for something sold by weight", () => {
    render(<BasketEditor items={[bread]} dispatch={vi.fn()} />);

    expect(unitOptionsFor("bread")).not.toContain("count");
  });

  it("offers milk by volume only", () => {
    render(
      <BasketEditor
        items={[{ id: "c", query: "milk", quantity: 1, unit: "gal" }]}
        dispatch={vi.fn()}
      />,
    );

    expect(unitOptionsFor("milk")).toEqual(["gal", "qt", "pt", "fl oz", "L", "mL"]);
  });
});

describe("a row that cannot be priced", () => {
  it("is marked in place, with a message saying what is wrong", () => {
    // The stored shape of the reported bug: a basket saved by an older build, with a unit
    // this item can no longer be measured in.
    const stale: BasketItem = { id: "x", query: "bread", quantity: 1, unit: "count" };
    render(<BasketEditor items={[stale]} dispatch={vi.fn()} />);

    expect(screen.getByText("This unit does not fit this item.")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit of Bread")).toHaveAttribute("aria-invalid", "true");
  });

  it("keeps its own unit selectable rather than snapping to one nobody chose", () => {
    const stale: BasketItem = { id: "x", query: "bread", quantity: 1, unit: "count" };
    render(<BasketEditor items={[stale]} dispatch={vi.fn()} />);

    expect(screen.getByLabelText("Unit of Bread")).toHaveValue("count");
    expect(unitOptionsFor("bread")).toContain("count");
  });

  it("is never removed from the basket on the shopper's behalf", () => {
    const dispatch = vi.fn();
    render(
      <BasketEditor
        items={[{ id: "x", query: "bread", quantity: 0, unit: "lb" }]}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByText("Enter a quantity greater than zero.")).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("says so when the item is not a staple at all", () => {
    render(
      <BasketEditor
        items={[{ id: "x", query: "saffron", quantity: 1, unit: "g" }]}
        dispatch={vi.fn()}
      />,
    );

    expect(screen.getByText("Not a staple StoreSplit compares.")).toBeInTheDocument();
  });

  it("leaves a valid row unmarked", () => {
    render(<BasketEditor items={[eggs]} dispatch={vi.fn()} />);

    expect(
      screen.queryByText(/does not fit|greater than zero|not a staple/i),
    ).not.toBeInTheDocument();
  });
});

describe("the add form", () => {
  it("follows the typed item with that item's units and default", () => {
    render(<BasketEditor items={[]} dispatch={vi.fn()} />);
    const item = screen.getByLabelText("Item");

    fireEvent.change(item, { target: { value: "bread" } });

    const select = screen.getByLabelText("Unit");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["lb", "oz", "g", "kg"]);
    expect(select).toHaveValue("lb");
  });

  it("disables the unit control for a query that names no staple", () => {
    render(<BasketEditor items={[]} dispatch={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "saffron" } });

    expect(screen.getByLabelText("Unit")).toBeDisabled();
  });

  it("adds a staple with its own default quantity and unit", () => {
    const dispatch = vi.fn();
    render(<BasketEditor items={[]} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Bananas" }));

    expect(dispatch).toHaveBeenCalledWith({
      type: "add",
      item: expect.objectContaining({ query: "bananas", quantity: 3, unit: "lb" }),
    });
  });
});

describe("the add form", () => {
  /** Type an item into the custom-add form, the way a shopper who ignores the chips does. */
  function typeItem(query: string) {
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: query } });
  }
  const qtyField = () => screen.getByLabelText("Qty") as HTMLInputElement;
  const addButton = () => screen.getByRole("button", { name: "Add" });

  it("adds a staple typed by hand, with the defaults it filled in", () => {
    // The regression this exists for: `min` and `step` together made every staple's own
    // default a step mismatch (the step grid is anchored at `min`), so typing "bread" filled
    // in 1 lb and the browser then refused to submit the form -- "the two nearest valid
    // values are 0.5022 and 1.0022" -- and nothing was ever added. jsdom runs no interactive
    // validation, so only the attributes themselves can be asserted here.
    const dispatch = vi.fn();
    render(<BasketEditor items={[]} dispatch={dispatch} />);

    typeItem("bread");
    expect(qtyField().value).toBe("1");
    expect(qtyField()).not.toHaveAttribute("min");
    expect(qtyField().closest("form")).toHaveAttribute("novalidate");
    expect(addButton()).toBeEnabled();

    fireEvent.click(addButton());
    expect(dispatch).toHaveBeenCalledWith({
      type: "add",
      item: expect.objectContaining({ query: "bread", quantity: 1, unit: "lb" }),
    });
  });

  it("leaves every staple's own default on its own step grid", () => {
    // The property that made the mismatch possible, pinned for every staple rather than for
    // the one that was reported.
    render(<BasketEditor items={[]} dispatch={vi.fn()} />);

    for (const staple of STAPLES) {
      typeItem(staple.query);
      const step = Number(qtyField().step);
      expect(step).toBeGreaterThan(0);
      // Anchored at zero, because there is no `min`: the default must be a whole number of
      // steps or a browser rejects it.
      expect(
        Math.abs(Number(qtyField().value) / step - Math.round(Number(qtyField().value) / step)),
      ).toBeLessThan(1e-9);
    }
  });

  it("refuses a quantity under the item's floor, and says which number it wants", () => {
    const dispatch = vi.fn();
    render(<BasketEditor items={[]} dispatch={dispatch} />);

    typeItem("bread");
    fireEvent.change(qtyField(), { target: { value: "0.001" } });

    expect(addButton()).toBeDisabled();
    expect(screen.getByText("Enter at least 0.0022 lb.")).toBeInTheDocument();

    fireEvent.click(addButton());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses a query it cannot price, and names that rather than the quantity", () => {
    render(<BasketEditor items={[]} dispatch={vi.fn()} />);

    typeItem("saffron");

    expect(addButton()).toBeDisabled();
    expect(screen.getByText("Not a staple StoreSplit compares.")).toBeInTheDocument();
  });

  it("converts the draft quantity when the unit changes, rather than relabelling it", () => {
    render(<BasketEditor items={[]} dispatch={vi.fn()} />);

    typeItem("bread");
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "oz" } });

    expect(qtyField().value).toBe("16");
  });
});

describe("a row's own controls", () => {
  it("carries no min, so the stepper lands on round numbers", () => {
    // `min` is the step base in HTML: with a floor of 0.0022 lb the up arrow offered
    // 1.5022 lb. The floor is `itemProblem`'s job, and it can name the number it wants.
    render(<BasketEditor items={[bread]} dispatch={vi.fn()} />);

    const qty = screen.getByLabelText("Quantity of Bread");
    expect(qty).not.toHaveAttribute("min");
    expect(qty).toHaveAttribute("step", "0.5");
  });

  it("names the item the way the results panel does", () => {
    // One noun, one casing, everywhere a shopper meets it: the chip that adds it, this row,
    // the shared-basket preview and the results panel all run it through `titleCaseName`.
    render(
      <BasketEditor
        items={[{ id: "d", query: "chicken breast", quantity: 2, unit: "lb" }]}
        dispatch={vi.fn()}
      />,
    );

    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();
  });
});
