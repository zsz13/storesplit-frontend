"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { EXAMPLE_ZIP, isValidZip, useLocate, useZip, useZipKnown } from "@/lib/zip";
import { LocateIcon, PinIcon } from "./Icon";
import styles from "./LocationDialog.module.css";

/**
 * The first thing a new visitor is asked, and the only thing StoreSplit cannot work without.
 *
 * Every price on either page is answering for one ZIP. Before this, an unset ZIP silently
 * became `94105`: a shopper in Chicago was shown San Francisco stores, correctly labelled and
 * completely useless, with nothing saying a default had been chosen for them. So the default
 * is gone and the question is asked instead.
 *
 * Asked **once**. It opens only while there is no valid stored ZIP, so a returning visitor
 * never sees it, and dismissing it within a session does not bring it back. The browser's own
 * location permission is requested only if the shopper presses the button that asks for it —
 * a prompt that appears on load is the thing people refuse on reflex.
 *
 * A native `<dialog>` opened with `showModal()`, like `ClosedStoresDialog`: the focus trap,
 * `Esc`, the inert background and the `::backdrop` are the platform's. It stays dismissible
 * because a modal with no way out is a trap, and both pages show a prompt that reopens it.
 */
export function LocationDialog() {
  const [zip, setZip] = useZip();
  const known = useZipKnown();
  const { locate, status, error } = useLocate();
  const [dismissed, setDismissed] = useState(false);
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  // `known` first: the server renders an empty ZIP, and opening on it meant the dialog
  // opened and immediately closed during hydration, which fired `onClose` and dismissed it
  // for the session -- so a shopper whose ZIP was later cleared was never asked again.
  const open = known && zip === "" && !dismissed;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // A refusal is not a dead end: the form is the other half of the offer, so the cursor is
  // put in it rather than leaving the shopper to find it under an error message.
  useEffect(() => {
    if (status === "error") zipRef.current?.focus();
  }, [status]);

  const submitZip = (event: FormEvent) => {
    event.preventDefault();
    if (!isValidZip(draft)) {
      setFormError("Enter a 5-digit ZIP code.");
      zipRef.current?.focus();
      return;
    }
    setFormError(null);
    setZip(draft);
  };

  const locating = status === "locating";

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="location-title"
      aria-describedby="location-lede"
      onClose={() => setDismissed(true)}
      onClick={(event) => {
        // A click landing on the dialog element itself is a click on its backdrop; the
        // content sits in the child below, so nothing inside it reaches here.
        if (event.target === ref.current) setDismissed(true);
      }}
    >
      <div className={styles.body}>
        <span className={styles.mark} aria-hidden="true">
          <PinIcon size={20} />
        </span>

        <h2 id="location-title" className={styles.title}>
          Where are you shopping?
        </h2>
        <p id="location-lede" className={styles.lede}>
          StoreSplit compares prices at the shops near one ZIP code. Pick yours and every price
          below answers for it.
        </p>

        <button
          type="button"
          className={`btn btn-primary ${styles.locate}`}
          onClick={locate}
          disabled={locating}
        >
          {locating ? (
            <>
              <span className="spinner" aria-hidden="true" /> Finding you…
            </>
          ) : (
            <>
              <LocateIcon /> Use my location
            </>
          )}
        </button>

        {/* Said up front, because "why does this site want my location" is the question the
            browser's own prompt never answers. */}
        <p className={styles.privacy}>
          StoreSplit uses your coordinates once, to find your ZIP code, and stores neither them nor
          anything else about you.
        </p>

        <div className={styles.divider} role="presentation">
          <span>or</span>
        </div>

        <form className={styles.form} onSubmit={submitZip} noValidate>
          <label className={styles.label} htmlFor="location-zip">
            Enter a ZIP code
          </label>
          <div className={styles.row}>
            <input
              ref={zipRef}
              id="location-zip"
              className={`${styles.input} mono`}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value.replace(/[^\d-]/g, "").slice(0, 10));
                setFormError(null);
              }}
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder={EXAMPLE_ZIP}
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? "location-zip-error" : undefined}
            />
            <button type="submit" className="btn" disabled={draft.length === 0}>
              Use this ZIP
            </button>
          </div>
          {formError ? (
            <p className={styles.error} id="location-zip-error" role="alert">
              {formError}
            </p>
          ) : null}
        </form>

        {error && draft.length === 0 ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <p className={styles.note}>You can change it any time.</p>
      </div>
    </dialog>
  );
}
