"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { errorMessage, lookupZip } from "@/lib/api";
import { readString, STORAGE_KEYS, writeString } from "@/lib/storage";

const ZIP_EVENT = "storesplit:zip";

/** Placeholder text only. It is an example of the shape, never a location anyone is given. */
export const EXAMPLE_ZIP = "94105";

/** The one ZIP field in the app. Declared here so nothing has to describe where it is. */
export const ZIP_FIELD_ID = "zip-input";

/**
 * Put the cursor in the ZIP field, wherever it happens to be rendered.
 *
 * It is what "Change ZIP" does, and it exists so no sentence has to say "in the header". A
 * shopper is told the task ("Change ZIP"), never the layout: the copy that named a region
 * assumed they knew which strip of the page that word meant, and it would be a lie the day
 * the field moved. Selecting the text is what makes the next keystroke replace the old ZIP
 * rather than append to it.
 */
export function focusZipField(): void {
  const field = document.getElementById(ZIP_FIELD_ID);
  if (!(field instanceof HTMLInputElement)) return;
  field.focus();
  field.select();
}

export function isValidZip(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}

function subscribe(listener: () => void): () => void {
  window.addEventListener(ZIP_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(ZIP_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The ZIP a shopper chose this session, kept only for a browser that will not store it.
 *
 * Safari's private mode and a blocked-site-data setting both accept `setItem` and hand back
 * nothing, so with the `94105` default gone the chosen ZIP evaporated on the next read: the
 * dialog could never close and the app was unusable for the whole visit. `storagePersists`
 * is what stops this from *also* breaking the ordinary case -- it is believed only once a
 * write has been proved not to survive, so a ZIP genuinely cleared in another tab still
 * clears here rather than being resurrected out of memory.
 */
let chosenZip = "";
let storagePersists = true;

/**
 * The stored ZIP, or `""` when there is not a valid one yet.
 *
 * Empty is a real state and it used to be hidden: an unset ZIP rendered as `94105`, so a
 * first-time visitor in Chicago was silently given San Francisco prices and nothing on the
 * page said so. The default is gone, and the empty string is what `LocationDialog` asks
 * about and what every surface that needs a location checks for.
 */
function getSnapshot(): string {
  const stored = readString(STORAGE_KEYS.zip);
  if (stored && isValidZip(stored)) return stored;
  return storagePersists ? "" : chosenZip;
}

/** Empty on the server, matching a browser that has nothing stored: no hydration mismatch. */
function getServerSnapshot(): string {
  return "";
}

/**
 * The ZIP code shared by every page. Persisted in localStorage and synchronised across
 * components (and tabs) through a window event. `""` until the shopper has chosen one.
 */
export function useZip(): [string, (zip: string) => void] {
  const zip = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setZip = useCallback((next: string) => {
    const value = next.trim();
    chosenZip = value;
    writeString(STORAGE_KEYS.zip, value);
    // `writeString` swallows a refusal by design, so reading it back is the only way to
    // learn whether this browser keeps anything at all.
    storagePersists = readString(STORAGE_KEYS.zip) === value;
    window.dispatchEvent(new Event(ZIP_EVENT));
  }, []);
  return [zip, setZip];
}

/**
 * False during the server render and the hydration pass that has to match it; true once the
 * browser has actually read storage.
 *
 * Without it the server's empty answer is indistinguishable from "this shopper has no ZIP",
 * with two consequences. Every prerendered page shipped "Choose a location first" to
 * returning visitors for a frame. And worse, `LocationDialog` opened on that empty value and
 * closed again the instant the real ZIP arrived -- firing its own `onClose`, which marked it
 * dismissed for the session, so a shopper whose ZIP was later cleared in another tab was
 * never asked again and had no way back to the question.
 */
export function useZipKnown(): boolean {
  // The same `useSyncExternalStore` shape the ZIP itself uses, with a store that never
  // changes: `false` is what the server renders and what hydration must match, `true` is
  // what the browser gets on the commit straight after. Setting state in an effect would say
  // the same thing and is what `react-hooks/set-state-in-effect` exists to refuse.
  return useSyncExternalStore(neverChanges, alwaysTrue, alwaysFalse);
}

const neverChanges = () => () => {};
const alwaysTrue = () => true;
const alwaysFalse = () => false;

type LocateStatus = "idle" | "locating" | "error";

/** How long to wait for a fix before giving up and offering the form instead. */
const GEOLOCATION_TIMEOUT_MS = 10_000;

/** A position the browser already has is fine; a shopper does not move between two clicks. */
const GEOLOCATION_MAX_AGE_MS = 5 * 60_000;

/**
 * Ask the browser where the shopper is, and store the ZIP it resolves to.
 *
 * Permission is requested **only** when `locate()` is called, never on mount: a page that
 * raises the browser's location prompt before anyone has asked for anything is the pattern
 * this dialog exists to avoid. Every failure ends in a sentence and leaves the ZIP alone, so
 * the caller can keep offering the form.
 *
 * Shared by the first-visit dialog and the header control, which is the whole reason it is a
 * hook rather than a handler: the two must ask the same question and report the same refusal.
 */
export function useLocate(): { locate: () => void; status: LocateStatus; error: string | null } {
  const [, setZip] = useZip();
  const [status, setStatus] = useState<LocateStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // A second press while one is in flight would raise a second prompt and race the first.
  const pending = useRef(false);

  const fail = useCallback((message: string) => {
    pending.current = false;
    setStatus("error");
    setError(message);
  }, []);

  const locate = useCallback(() => {
    if (pending.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      fail("This browser cannot share a location. Enter a ZIP code instead.");
      return;
    }
    pending.current = true;
    setStatus("locating");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          try {
            const { zip_code } = await lookupZip(
              position.coords.latitude,
              position.coords.longitude,
            );
            pending.current = false;
            setZip(zip_code);
            setStatus("idle");
          } catch (err) {
            fail(errorMessage(err));
          }
        })();
      },
      (err) => {
        // The three the spec defines, worded for what the shopper should do next rather than
        // for what the API called it.
        fail(
          err.code === err.PERMISSION_DENIED
            ? "Location access was blocked. Enter a ZIP code instead, or allow location in your browser and try again."
            : err.code === err.TIMEOUT
              ? "Finding your location took too long. Enter a ZIP code instead."
              : "Your location is not available right now. Enter a ZIP code instead.",
        );
      },
      {
        enableHighAccuracy: false,
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
      },
    );
  }, [fail, setZip]);

  return { locate, status, error };
}
