import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, lookupZip: vi.fn() };
});

import { lookupZip } from "@/lib/api";
import { ZipInput } from "@/components/ZipInput";

const lookupMock = vi.mocked(lookupZip);

/** A browser whose location prompt is answered however the test says. */
function fakeGeolocation() {
  let success: ((p: { coords: { latitude: number; longitude: number } }) => void) | undefined;
  let failure: ((e: { code: number; PERMISSION_DENIED: 1; TIMEOUT: 3 }) => void) | undefined;
  const getCurrentPosition = vi.fn((ok: typeof success, no: typeof failure) => {
    success = ok;
    failure = no;
  });
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
  return {
    getCurrentPosition,
    allow: (latitude: number, longitude: number) => success?.({ coords: { latitude, longitude } }),
    refuse: () => failure?.({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("the header's ZIP field", () => {
  it("commits a valid ZIP on Enter and reverts anything that is not one", () => {
    const onChange = vi.fn();
    render(<ZipInput value="94105" onChange={onChange} compact />);
    const field = screen.getByLabelText("ZIP code") as HTMLInputElement;

    fireEvent.change(field, { target: { value: "60601" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledWith("60601");

    // Half a ZIP is not a location, so the field goes back to the one that is.
    onChange.mockClear();
    fireEvent.change(field, { target: { value: "941" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a 5-digit ZIP");
    fireEvent.blur(field);
    expect(onChange).not.toHaveBeenCalled();
    expect(field.value).toBe("94105");
  });

  it("invites a first-time visitor to set one rather than showing a ZIP nobody chose", () => {
    // The header is the only place the ZIP appears, and it has no visible label. A
    // placeholder shaped like a real ZIP is indistinguishable from a chosen one, which is
    // the whole of "StoreSplit silently started with a hardcoded ZIP".
    render(<ZipInput value="" onChange={vi.fn()} compact />);

    expect(screen.getByLabelText("ZIP code")).toHaveAttribute("placeholder", "Set ZIP");
  });

  it("changes the location from the header when the browser shares one", async () => {
    const geo = fakeGeolocation();
    lookupMock.mockResolvedValue({
      zip_code: "98121",
      latitude: 47.6205,
      longitude: -122.3493,
      distance_miles: 0.37,
    });
    render(<ZipInput value="94105" onChange={vi.fn()} compact />);

    // Nothing is asked of the browser until the control is pressed.
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1);

    geo.allow(47.6205, -122.3493);
    await waitFor(() => expect(window.localStorage.getItem("storesplit.zip")).toBe("98121"));
  });

  it("reports a refusal in the field's own error slot", async () => {
    const geo = fakeGeolocation();
    render(<ZipInput value="94105" onChange={vi.fn()} compact />);

    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    geo.refuse();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Location access was blocked/);
    expect(window.localStorage.getItem("storesplit.zip")).toBeNull();
  });
});
