"use client";

import { useEffect, useRef } from "react";
import styles from "./ShareBasketDialog.module.css";

interface Props {
  /** The link to share, or `null` while the dialog is closed. */
  url: string | null;
  /** Whether the link is on the clipboard: set by the automatic copy, or by `Copy link`. */
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

/**
 * The link to this basket, already on the clipboard wherever the browser allows it.
 *
 * The copy is attempted first and the dialog then reports what happened, rather than opening
 * with a button and waiting: on every browser that permits it the share is already done by
 * the time this is read, and the field below is a receipt. Where the clipboard is refused --
 * an insecure origin, a denied permission, an unfocused document -- the same dialog opens
 * saying what to do instead, because a share that silently failed is worse than one that
 * asks for a keystroke. That is the whole reason `copied` is a prop: one boolean decides the
 * sentence and the button, and neither can claim a copy that did not happen.
 *
 * A native `<dialog>` opened with `showModal()`, like every other dialog here: the focus
 * trap, `Esc`, the inert background and the `::backdrop` are the platform's. The link field
 * is readonly and selects itself on focus, so the browser's own focus-the-first-control
 * behaviour lands on a link that Ctrl+C already copies.
 */
export function ShareBasketDialog({ url, copied, onCopy, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = url !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Driven from the prop each time, because the platform can close this too (Esc, a
    // backdrop click) and the two ideas of "open" must not drift apart.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="share-basket-title"
      aria-describedby="share-basket-lede"
      onClose={onClose}
      onClick={(event) => {
        // A click on the dialog element itself is a click on its backdrop: the content sits
        // in the child below, so nothing inside it reaches here.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.body}>
        <h2 id="share-basket-title" className={styles.title}>
          Share your basket
        </h2>
        {/* A live region, so pressing `Copy link` is confirmed to a screen reader and not
            only to the eye watching the button relabel itself. */}
        <p className={styles.status} role="status" data-copied={copied || undefined}>
          {copied ? "Basket link copied" : "Copy this link to share your basket."}
        </p>
        <p id="share-basket-lede" className={styles.lede}>
          Anyone with this link can open the same basket. Prices and nearby stores will be refreshed
          for their location.
        </p>

        <div className={styles.row}>
          <input
            className={`${styles.link} mono`}
            value={url ?? ""}
            readOnly
            aria-label="Basket link"
            onFocus={(event) => {
              const field = event.currentTarget;
              field.select();
              // `select()` leaves the caret at the end, and the browser scrolls to it: the
              // field then opens showing the tail of a base64 payload, which does not look
              // like a link at all. The selection is what matters; the view starts at "http".
              field.scrollLeft = 0;
            }}
          />
          <button type="button" className="btn btn-primary" onClick={onCopy}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        <div className={styles.actions}>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
