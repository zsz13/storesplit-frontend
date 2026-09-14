"use client";

import styles from "./OpenNowFilter.module.css";

interface Props {
  value: boolean;
  onChange: (next: boolean) => void;
  /** How many of the stores this ZIP means are open right now, for the count beside it. */
  openCount: number;
  storeCount: number;
  disabled?: boolean;
}

/**
 * Compare only the shops that are not shut.
 *
 * A toggle rather than a member of the availability radiogroup beside it: those four are
 * mutually exclusive views of one result set, and this is an independent narrowing that
 * combines with any of them. `aria-pressed` is what says so to a screen reader.
 *
 * The backend applies it, in each store's own timezone. Deciding it here would mean reading
 * the shopper's clock instead of the store's, which is wrong by up to a day for a store in
 * another zone and wrong by an hour twice a year for one in the same.
 */
export function OpenNowFilter({ value, onChange, openCount, storeCount, disabled }: Props) {
  return (
    <button
      type="button"
      className={`chip ${styles.chip}`}
      aria-pressed={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
    >
      <span className={styles.dot} data-on={value || undefined} aria-hidden="true" />
      Open now
      {storeCount > 0 ? <span className={styles.count}>{openCount}</span> : null}
    </button>
  );
}
