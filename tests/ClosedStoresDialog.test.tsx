import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ClosedStoresDialog } from "@/components/ClosedStoresDialog";
import type { HoursTodayOut, StoreOut } from "@/lib/api";
import { safeway } from "./fixtures";

// jsdom implements <dialog> but not its modal behaviour; these stand in for the parts the
// component drives, so what is under test is what it renders and when.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

function store(id: number, name: string, hours: Partial<HoursTodayOut>): StoreOut {
  return {
    ...safeway,
    id,
    retailer_name: name,
    hours_today: {
      state: "unknown",
      opens_at: null,
      closes_at: null,
      opens_day: null,
      closed_all_day: false,
      next_open_at: null,
      ...hours,
    },
  };
}

const lucky = store(1, "Lucky", {
  state: "closed",
  opens_at: "06:00",
  opens_day: "tomorrow",
  next_open_at: "2026-09-13T13:00:00Z",
});
const traderJoes = store(2, "Trader Joe's", {
  state: "closed",
  opens_at: "08:00",
  opens_day: "tomorrow",
  next_open_at: "2026-09-13T15:00:00Z",
});
const raleys = store(3, "Raley's", { state: "unknown" });

function show(stores: StoreOut[]) {
  return render(<ClosedStoresDialog stores={stores} open onClose={vi.fn()} onShowAll={vi.fn()} />);
}

describe("what the dialog says", () => {
  it("lists the earliest openings first, in the shop's own wall clock", () => {
    show([traderJoes, lucky]);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Luckyopens 6:00 AM tomorrow",
      "Trader Joe'sopens 8:00 AM tomorrow",
    ]);
  });

  it("names a store whose hours nobody publishes, and gives it no time", () => {
    show([lucky, raleys]);

    expect(screen.getByText(/Raley's/)).toHaveTextContent("publishes no hours");
    expect(screen.getByText(/Raley's/)).toHaveTextContent("They may be open.");
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(1);
  });

  it("still explains itself when nothing has a published opening", () => {
    show([raleys, store(4, "Nob Hill", { state: "closed", closed_all_day: true })]);

    expect(screen.getByText("Nothing is open right now.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("offers a way out of the filter", () => {
    const onShowAll = vi.fn();
    render(<ClosedStoresDialog stores={[lucky]} open onClose={vi.fn()} onShowAll={onShowAll} />);

    screen.getByRole("button", { name: "Show all stores" }).click();

    expect(onShowAll).toHaveBeenCalled();
  });

  it("renders nothing to the accessibility tree while closed", () => {
    render(
      <ClosedStoresDialog stores={[lucky]} open={false} onClose={vi.fn()} onShowAll={vi.fn()} />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
