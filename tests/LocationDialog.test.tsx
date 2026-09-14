import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, lookupZip: vi.fn() };
});

import { ApiError, lookupZip } from "@/lib/api";
import { LocationDialog } from "@/components/LocationDialog";

const lookupMock = vi.mocked(lookupZip);

/** The three failures `GeolocationPositionError` defines, by the codes the spec fixes. */
const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

type GeolocationHandlers = {
  success?: (position: { coords: { latitude: number; longitude: number } }) => void;
  failure?: (error: {
    code: number;
    PERMISSION_DENIED: 1;
    POSITION_UNAVAILABLE: 2;
    TIMEOUT: 3;
  }) => void;
};

/**
 * A browser that answers the location prompt however the test says.
 *
 * `getCurrentPosition` is recorded rather than auto-resolved, so a test can assert the thing
 * that matters most here: that it was not called until the shopper pressed the button.
 */
function fakeGeolocation() {
  const calls: GeolocationHandlers[] = [];
  const getCurrentPosition = vi.fn(
    (success: GeolocationHandlers["success"], failure: GeolocationHandlers["failure"]) => {
      calls.push({ success, failure });
    },
  );
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
  return {
    getCurrentPosition,
    allow(latitude: number, longitude: number) {
      calls.at(-1)?.success?.({ coords: { latitude, longitude } });
    },
    refuse(code: number) {
      calls.at(-1)?.failure?.({
        code,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    },
  };
}

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
});

const dialog = () => document.querySelector("dialog");
const locateButton = () => screen.getByRole("button", { name: /Use my location/ });

describe("the first visit", () => {
  it("asks where the shopper is, and does not ask the browser until they say so", () => {
    const geo = fakeGeolocation();
    render(<LocationDialog />);

    expect(dialog()).toHaveAttribute("open");
    expect(screen.getByText("Where are you shopping?")).toBeInTheDocument();
    // The whole point of a modal here rather than a prompt on load: nothing has been asked
    // of the browser, so nothing has been refused on reflex.
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("turns an accepted location into a ZIP and remembers it", async () => {
    const geo = fakeGeolocation();
    lookupMock.mockResolvedValue({
      zip_code: "60601",
      latitude: 41.8843,
      longitude: -87.6216,
      distance_miles: 0.3,
    });
    render(<LocationDialog />);

    fireEvent.click(locateButton());
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);
    geo.allow(41.8843, -87.6216);

    await waitFor(() => expect(window.localStorage.getItem("storesplit.zip")).toBe("60601"));
    expect(lookupMock).toHaveBeenCalledWith(41.8843, -87.6216);
    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
  });

  it("stays open and offers the form when permission is refused", async () => {
    const geo = fakeGeolocation();
    render(<LocationDialog />);

    fireEvent.click(locateButton());
    geo.refuse(PERMISSION_DENIED);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Location access was blocked/);
    expect(dialog()).toHaveAttribute("open");
    // And the cursor is put where the shopper can still answer.
    await waitFor(() => expect(screen.getByLabelText("Enter a ZIP code")).toHaveFocus());
    expect(window.localStorage.getItem("storesplit.zip")).toBeNull();
  });

  it("words a timeout and an unavailable fix differently from a refusal", async () => {
    const geo = fakeGeolocation();
    render(<LocationDialog />);

    fireEvent.click(locateButton());
    geo.refuse(TIMEOUT);
    expect(await screen.findByRole("alert")).toHaveTextContent(/took too long/);

    fireEvent.click(locateButton());
    geo.refuse(POSITION_UNAVAILABLE);
    expect(await screen.findByRole("alert")).toHaveTextContent(/not available right now/);
  });

  it("says so when the coordinates land outside any ZIP, rather than inventing one", async () => {
    const geo = fakeGeolocation();
    lookupMock.mockRejectedValue(
      new ApiError("No US ZIP code within 100 miles of that location.", 404, null),
    );
    render(<LocationDialog />);

    fireEvent.click(locateButton());
    geo.allow(48.8584, 2.2945);

    expect(await screen.findByRole("alert")).toHaveTextContent(/No US ZIP code within 100 miles/);
    expect(window.localStorage.getItem("storesplit.zip")).toBeNull();
    expect(dialog()).toHaveAttribute("open");
  });

  it("accepts a ZIP typed by hand and closes", () => {
    fakeGeolocation();
    render(<LocationDialog />);

    fireEvent.change(screen.getByLabelText("Enter a ZIP code"), { target: { value: "02139" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this ZIP" }));

    expect(window.localStorage.getItem("storesplit.zip")).toBe("02139");
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("rejects a ZIP that is not five digits without touching what is stored", () => {
    fakeGeolocation();
    render(<LocationDialog />);

    fireEvent.change(screen.getByLabelText("Enter a ZIP code"), { target: { value: "941" } });
    fireEvent.click(screen.getByRole("button", { name: "Use this ZIP" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 5-digit ZIP code.");
    expect(window.localStorage.getItem("storesplit.zip")).toBeNull();
    expect(dialog()).toHaveAttribute("open");
  });

  it("does not come back after being dismissed", () => {
    fakeGeolocation();
    render(<LocationDialog />);

    fireEvent.click(dialog() as HTMLDialogElement); // the backdrop
    expect(dialog()).not.toHaveAttribute("open");
  });
});

describe("a returning visitor", () => {
  it("is never asked again", () => {
    const geo = fakeGeolocation();
    window.localStorage.setItem("storesplit.zip", "94105");
    render(<LocationDialog />);

    expect(dialog()).not.toHaveAttribute("open");
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("is asked again only if what was stored is not a ZIP", () => {
    fakeGeolocation();
    window.localStorage.setItem("storesplit.zip", "not-a-zip");
    render(<LocationDialog />);

    expect(dialog()).toHaveAttribute("open");
  });
});

describe("browsers that make the ordinary path fail", () => {
  it("keeps a chosen ZIP for the session when the browser refuses to store it", async () => {
    // Safari's private mode and a blocked site-data setting both accept `setItem` and hand
    // back nothing. With the hardcoded default gone, the chosen ZIP evaporated on the next
    // read: the dialog could never close and the whole app was unusable for that visit.
    fakeGeolocation();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    try {
      vi.resetModules();
      const { LocationDialog: Fresh } = await import("@/components/LocationDialog");
      render(<Fresh />);

      fireEvent.change(screen.getByLabelText("Enter a ZIP code"), { target: { value: "02139" } });
      fireEvent.click(screen.getByRole("button", { name: "Use this ZIP" }));

      expect(window.localStorage.getItem("storesplit.zip")).toBeNull();
      await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
    } finally {
      setItem.mockRestore();
    }
  });

  it("asks again when the ZIP is cleared in another tab", async () => {
    // The dialog used to open on the server's empty answer and close again the instant the
    // real ZIP arrived, which fired its own `onClose` and marked it dismissed for the
    // session -- so this shopper was never asked again and had no way back to the question.
    fakeGeolocation();
    window.localStorage.setItem("storesplit.zip", "94105");
    render(<LocationDialog />);
    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));

    window.localStorage.removeItem("storesplit.zip");
    fireEvent(window, new Event("storesplit:zip"));

    await waitFor(() => expect(dialog()).toHaveAttribute("open"));
  });
});
