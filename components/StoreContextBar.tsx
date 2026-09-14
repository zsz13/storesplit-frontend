"use client";

import { useId, useState } from "react";
import type { StoreOut } from "@/lib/api";
import { storeLabel, storeHoursLabel } from "@/lib/format";
import { byOpenState, openStores } from "@/lib/openNow";
import { ChevronDown } from "./Icon";
import styles from "./StoreContextBar.module.css";

interface Props {
  stores: StoreOut[];
  zipCode: string;
  /** Whether the results beside this were narrowed to stores that are not shut. */
  openNow?: boolean;
}

/**
 * Which stores these prices came from, collapsed to one line.
 *
 * Sixteen store chips used to fill the whole first screen before a single price was visible.
 * The count and the retailer names are the part anyone reads; the branch addresses are
 * reference material, so they sit behind a disclosure.
 */
export function StoreContextBar({ stores, zipCode, openNow = false }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (stores.length === 0) return null;

  const retailers = [...new Set(stores.map((store) => store.retailer_name))];
  // Open first, then the ones nobody publishes hours for, then the shut ones -- the same
  // order the backend compared them in, so this list and the prices beside it agree about
  // which shops were preferred. `stores` is never narrowed by the filter, so a shopper who
  // filtered everything away can still read here what is shut and when it opens.
  const ordered = openNow ? byOpenState(stores) : stores;
  const openCount = openStores(stores).length;

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.summary}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        <span className={styles.count}>
          {stores.length} store{stores.length === 1 ? "" : "s"}
        </span>
        <span className={styles.names}>
          {retailers.slice(0, 3).join(", ")}
          {retailers.length > 3 ? ` +${retailers.length - 3} more` : ""}
        </span>
        <span className={styles.near}>near {zipCode}</span>
        {openNow ? <span className={styles.openCount}>{openCount} open now</span> : null}
        <ChevronDown className={styles.chevron} />
      </button>

      <div id={panelId} className={styles.list} hidden={!open}>
        {ordered.map((store) => (
          <span key={store.id} className={styles.store} data-state={store.hours_today.state}>
            <span className={styles.retailer}>{store.retailer_name}</span>
            <span className={styles.branch} title={storeLabel(store)}>
              {store.name}
            </span>
            {/* Only while filtering, and always as words: a shopper who asked to see open
                shops needs to know which of these are which, and a tint alone would not
                say it. `storeHoursLabel` is the one place hours become a sentence. */}
            {openNow ? (
              <span className={styles.hours}>{storeHoursLabel(store.hours_today)}</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
