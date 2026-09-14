"use client";

import { focusZipField, useLocate } from "@/lib/zip";
import { EmptyState } from "./EmptyState";
import { LocateIcon } from "./Icon";
import styles from "./LocationPrompt.module.css";

/**
 * What a page says while it has no ZIP to answer for.
 *
 * `LocationDialog` asks first and can be dismissed; this is what is underneath it, and what
 * remains if it was. Both pages need the sentence and neither may invent its own wording — a
 * shopper who dismissed the dialog on the search page and walked to the basket must not be
 * told two different things about the same missing fact.
 *
 * It is an `EmptyState` because that is exactly what this is: something missing, said plainly,
 * with the next step attached. It offers the same two answers the dialog does: share a
 * location, or type a ZIP in. The second one is a *button* rather than a sentence pointing at
 * a region of the page, because "the field in the header" asks a shopper to translate a
 * layout word into a place to click, and stops being true the day the field moves.
 */
export function LocationPrompt({ lede }: { lede?: string }) {
  const { locate, status, error } = useLocate();

  return (
    <EmptyState
      title="Choose a location first"
      action={
        <>
          <button
            type="button"
            className="btn btn-primary"
            onClick={locate}
            disabled={status === "locating"}
          >
            {status === "locating" ? (
              <>
                <span className="spinner" aria-hidden="true" /> Finding you…
              </>
            ) : (
              <>
                <LocateIcon /> Use my location
              </>
            )}
          </button>
          <button type="button" className="btn" onClick={focusZipField}>
            Enter a ZIP code
          </button>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </>
      }
    >
      {lede ?? "Every price StoreSplit shows is for the shops near one ZIP code."} Share your
      location, or type in a ZIP code.
    </EmptyState>
  );
}
