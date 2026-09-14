"use client";

import { useCallback, useSyncExternalStore } from "react";
import { basketReducer, sanitizeItems, type BasketAction, type BasketItem } from "@/lib/basket";
import { readJson, STORAGE_KEYS, writeJson } from "@/lib/storage";

const EMPTY: BasketItem[] = [];
let items: BasketItem[] | null = null;
const listeners = new Set<() => void>();

function load(): BasketItem[] {
  if (items === null) items = sanitizeItems(readJson<unknown>(STORAGE_KEYS.basket, []));
  return items;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getServerSnapshot(): BasketItem[] {
  return EMPTY;
}

/**
 * The stored basket, read outside React.
 *
 * A shared link has to know whether there is already a basket to overwrite, and it has to
 * know it in the effect that runs on mount. The hook's value cannot answer that there: the
 * server renders an empty basket, hydration has to match it, and the real one arrives on a
 * later commit -- so an effect reading the rendered value can see `[]` over a full basket
 * and replace it. This reads the same store the hook does, at the moment the question is
 * asked, which is the only reading that cannot be stale.
 */
export function currentBasket(): BasketItem[] {
  return load();
}

/** Basket items persisted in localStorage, shared by every component that calls this hook. */
export function useBasket(): [BasketItem[], (action: BasketAction) => void] {
  const current = useSyncExternalStore(subscribe, load, getServerSnapshot);
  const dispatch = useCallback((action: BasketAction) => {
    items = basketReducer(load(), action);
    writeJson(STORAGE_KEYS.basket, items);
    listeners.forEach((l) => l());
  }, []);
  return [current, dispatch];
}
