"use client";

import { useEffect, useRef } from "react";
import type { StoreOut } from "@/lib/api";
import { clockLabel } from "@/lib/format";
import { earliestByRetailer, nextOpenings, unknownHoursStores } from "@/lib/openNow";
import styles from "./ClosedStoresDialog.module.css";

/** Enough to plan a morning around; more is a directory, and there is a page for that. */
const MAX_OPENINGS = 6;

interface Props {
  stores: readonly StoreOut[];
  open: boolean;
  onClose: () => void;
  /** Turns the filter off and closes, for the shopper who would rather see everything. */
  onShowAll: () => void;
}

/**
 * Every shop near this ZIP is shut, and here is what opens first.
 *
 * A native `<dialog>` opened with `showModal()`: the focus trap, the `Esc` key, the inert
 * background and the `::backdrop` are the platform's, and none of them is worth
 * reimplementing or worth a dependency. The only things added are closing on a backdrop
 * click and keeping React's idea of open in step with the element's.
 */
export function ClosedStoresDialog({ stores, open, onClose, onShowAll }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // One row per retailer, and at most a handful: this is the answer to "when can I shop
  // again", not a directory.
  const byRetailer = earliestByRetailer(nextOpenings(stores));
  const openings = byRetailer.slice(0, MAX_OPENINGS);
  const hiddenOpenings = byRetailer.length - openings.length;
  // Retailers, not branches, for the same reason: "Raley's, Raley's" says one thing twice.
  const unpublished = [...new Set(unknownHoursStores(stores).map((s) => s.retailer_name))];

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // `open` is a prop, and a dialog can also be dismissed by the platform (Esc). Driving
    // the element from the prop each time keeps the two from drifting apart.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="closed-stores-title"
      onClose={onClose}
      onClick={(event) => {
        // A click that lands on the dialog element itself is a click on its backdrop: the
        // content sits in the child below, so anything inside it never reaches here.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className={styles.body}>
        <h2 id="closed-stores-title" className={styles.title}>
          Every store near you is closed
        </h2>
        <p className={styles.lede}>
          {openings.length > 0
            ? "Nothing is open right now. These open first:"
            : "Nothing is open right now."}
        </p>

        {openings.length > 0 ? (
          <ul className={styles.list}>
            {openings.map(({ store, opensAt, opensDay }) => (
              <li key={store.id} className={styles.row}>
                <span className={styles.store}>{store.retailer_name}</span>
                <span className={styles.opens}>
                  opens <span className="tabular">{clockLabel(opensAt) ?? opensAt}</span>
                  {opensDay && opensDay !== "today" ? ` ${opensDay}` : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {hiddenOpenings > 0 ? (
          <p className={styles.note}>
            {hiddenOpenings} more {hiddenOpenings === 1 ? "retailer opens" : "retailers open"}{" "}
            later.
          </p>
        ) : null}

        {/* Named, not counted, and never given a time: these are the shops whose retailer
            publishes no hours on any surface StoreSplit may read. Inventing an opening for
            them is the one thing this dialog must not do. */}
        {unpublished.length > 0 ? (
          <p className={styles.note}>
            {unpublished.join(", ")} publish{unpublished.length === 1 ? "es" : ""} no hours anywhere
            StoreSplit can read. They may be open.
          </p>
        ) : null}

        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" onClick={onShowAll}>
            Show all stores
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
