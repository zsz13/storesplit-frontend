import type { Availability, StoreOut } from "@/lib/api";
import { stockWording } from "@/lib/availability";
import styles from "./AvailabilityPill.module.css";

interface Props {
  availability: Availability;
  /** The store, for the retailer's name and whether it publishes stock at all. */
  store?: Pick<StoreOut, "retailer_name" | "stock_reporting">;
  /** The retailer's own wording, appended to the tooltip so a surprise stays traceable. */
  stockStatus?: string | null;
  /** Show the pill even for `in_stock`; used where states are mixed in one list. */
  always?: boolean;
  /**
   * Use the shortest wording, for a card where the badge sits in a narrow price column.
   * Which words that is belongs to `lib/availability.ts`, not here: a card and the offer row
   * one click below it must not word the same fact differently.
   */
  compact?: boolean;
}

/**
 * An offer's stock state as a pill.
 *
 * Four wordings, not three: `unknown` splits into a retailer that could not be read and a
 * retailer that publishes nothing, and they are coloured as differently as they read.
 * "Stock not confirmed" is amber because something is missing; "Availability not published"
 * is slate because nothing is -- it is a fact about the retailer, not a warning about the
 * offer, and dressing it in amber told shoppers to distrust a perfectly good price.
 *
 * `in_stock` carries no pill in the default view, where every offer is in stock and a badge
 * on every row is noise. Everywhere states are mixed, `always` turns it back on. Status is
 * never carried by colour alone: each state says what it is, and the dot is decoration.
 */
export function AvailabilityPill({
  availability,
  store,
  stockStatus,
  always = false,
  compact = false,
}: Props) {
  if (availability === "in_stock" && !always) return null;
  const { tone, label, short, detail } = stockWording(availability, store);
  return (
    <span
      className={styles.pill}
      data-tone={tone}
      title={stockStatus ? `${detail} Retailer reported: ${stockStatus}` : detail}
    >
      <span className={styles.dot} aria-hidden="true" />
      {compact ? short : label}
    </span>
  );
}
