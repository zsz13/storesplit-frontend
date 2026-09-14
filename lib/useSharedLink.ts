"use client";

import { useSyncExternalStore } from "react";
import type { BasketItem } from "@/lib/basket";
import { decodeBasket, SHARE_PARAM } from "@/lib/share";
import { currentBasket } from "@/lib/useBasket";

/** What the address bar was carrying, weighed against the basket already stored here. */
export interface SharedLink {
  /**
   * `open`: there was no basket to lose, so it goes straight in.
   * `conflict`: a basket exists, so the shopper decides which one survives.
   * `unreadable`: a `?b=` that decoded to nothing StoreSplit can price.
   */
  kind: "open" | "conflict" | "unreadable";
  items: BasketItem[];
  /**
   * How far this link has got, and the reason this is a store rather than component state.
   *
   * `pending` until a mount has acted on it; then `offered` while the shopper is being
   * asked, `opening` once its basket is in place and a comparison is owed, `said` once that
   * comparison has been asked for, and `done` when they have moved on.
   *
   * Holding it here is what makes a link a **one-time** instruction: the module survives a
   * client-side navigation between `/` and `/basket`, so a phase kept in `useState` would
   * reset to `pending` on the way back and the effect would apply the same link a second
   * time -- over whatever the shopper had edited since, without asking. An answered offer
   * would likewise be re-asked, and the comparison the link opened with would be run again
   * on every return to the page.
   */
  phase: "pending" | "offered" | "opening" | "said" | "done";
}

/** `undefined` until the first client render asks; `null` once asked and there was no link. */
let link: SharedLink | null | undefined;
const listeners = new Set<() => void>();

function read(): SharedLink | null {
  if (link !== undefined) return link;
  const encoded = new URLSearchParams(window.location.search).get(SHARE_PARAM);
  if (encoded === null) return (link = null);
  const shared = decodeBasket(encoded);
  link =
    shared === null
      ? { kind: "unreadable", items: [], phase: "pending" }
      : {
          kind: currentBasket().length > 0 ? "conflict" : "open",
          items: shared,
          phase: "pending",
        };
  return link;
}

/**
 * Move the link on. A new object, because that is what tells `useSyncExternalStore` the
 * snapshot changed; the old one is what every render before this keeps seeing.
 */
export function setSharedLinkPhase(phase: SharedLink["phase"]): void {
  if (!link || link.phase === phase) return;
  link = { ...link, phase };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const nothing = () => null;

/**
 * The basket a `?b=` link is carrying, resolved once and never again.
 *
 * It is a store rather than an effect for the reason `useZipKnown` is: the server renders no
 * link and hydration has to match that, so the answer can only arrive on the commit after --
 * and `setState` in an effect to say so is exactly what `react-hooks/set-state-in-effect`
 * refuses.
 *
 * The basket already stored is read here, at the moment the question is asked, through
 * `currentBasket()` rather than through the hook. They are not the same value on this pass:
 * a component reading its own rendered `items` during hydration sees `[]` over a full
 * basket, and would replace somebody's shopping list with a stranger's without asking.
 */
export function useSharedLink(): SharedLink | null {
  return useSyncExternalStore(subscribe, read, nothing);
}
