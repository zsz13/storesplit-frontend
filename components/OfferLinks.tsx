import type { OfferOut, StoreOut } from "@/lib/api";
import { mapsLinkHref, productLinkHref } from "@/lib/links";
import { ExternalIcon, PinIcon } from "./Icon";
import styles from "./OfferLinks.module.css";

/**
 * The two ways out of StoreSplit: the retailer's page for this item, and the store on a map.
 *
 * They are components rather than markup because they appear on five surfaces -- a result
 * card, an expanded offer row, a basket's chosen store, a basket line, a split line -- and
 * every one of them used to spell them differently: "View", "↗", "Maps", and on the basket,
 * nothing at all. A shopper should not have to learn a new affordance one screen over.
 *
 * Both render nothing when the URL does not pass `lib/links.ts`. That is not defensive
 * tidiness: an unvalidated `product_url` resolves against StoreSplit's own origin and looks
 * like a real destination, and a store with no published address or coordinates has no
 * honest pin to drop. Absent is the correct rendering for both.
 */

export function ItemLink({ offer, className }: { offer: OfferOut; className?: string }) {
  const href = productLinkHref(offer);
  // Said rather than left blank. An offer with no page of its own is a fact about the
  // retailer -- some publish prices with no addressable product page -- and a shopper
  // hunting for a link they cannot see is worse served than one told there is not one.
  if (!href) {
    return (
      <span className={`${styles.absent} ${className ?? ""}`} title={offer.title}>
        No item page
      </span>
    );
  }
  return (
    <a
      className={`${styles.link} ${className ?? ""}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <ExternalIcon size={13} />
      View item
      <span className="sr-only">
        : {offer.title} at {offer.store.retailer_name}, opens in a new tab
      </span>
    </a>
  );
}

export function MapsLink({ store, className }: { store: StoreOut; className?: string }) {
  const href = mapsLinkHref(store);
  if (!href) return null;
  return (
    <a
      className={`${styles.link} ${className ?? ""}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <PinIcon size={13} />
      Maps
      <span className="sr-only">
        : {store.retailer_name} {store.name} on Google Maps, opens in a new tab
      </span>
    </a>
  );
}
