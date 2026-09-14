"use client";

import { useState } from "react";
import { EXAMPLE_ZIP, isValidZip, useLocate, ZIP_FIELD_ID } from "@/lib/zip";
import { LocateIcon, PinIcon } from "./Icon";
import styles from "./ZipInput.module.css";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** The header variant: an inline field rather than a labelled block. */
  compact?: boolean;
}

/**
 * The ZIP every price on the page is answering for.
 *
 * Committed on blur or Enter rather than on every keystroke: each change re-runs the search,
 * and "9", "94", "941" are three searches nobody asked for.
 */
export function ZipInput({ value, onChange, compact = false }: Props) {
  const [draft, setDraft] = useState(value);
  const invalid = draft.length > 0 && !isValidZip(draft);
  // The same question the first-visit dialog asks, in the place a shopper goes to change it.
  // It writes the ZIP itself, so there is nothing to thread through `onChange`.
  const { locate, status, error: locateError } = useLocate();

  const commit = () => {
    if (isValidZip(draft) && draft !== value) onChange(draft);
    else if (!isValidZip(draft)) setDraft(value);
  };

  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ""}`}>
      <label className={compact ? "sr-only" : "label"} htmlFor={ZIP_FIELD_ID}>
        ZIP code
      </label>
      <div className={styles.field}>
        <PinIcon className={styles.icon} />
        <input
          id={ZIP_FIELD_ID}
          className={`${styles.input} mono`}
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d-]/g, "").slice(0, 10))}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder={compact ? "Set ZIP" : EXAMPLE_ZIP}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid || locateError ? "zip-error" : undefined}
        />
        <button
          type="button"
          className={styles.locate}
          onClick={locate}
          disabled={status === "locating"}
          aria-label="Use my location"
          title="Use my location"
        >
          {status === "locating" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <LocateIcon className={styles.locateIcon} />
          )}
        </button>
      </div>
      {invalid || locateError ? (
        <span className={styles.error} id="zip-error" role="alert">
          {invalid ? "Enter a 5-digit ZIP" : locateError}
        </span>
      ) : null}
    </div>
  );
}
