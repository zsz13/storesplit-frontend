"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  DEFAULT_AVAILABILITY,
  errorMessage,
  refreshPrices,
  searchProducts,
  type AvailabilityFilter,
  type SearchResponse,
} from "./api";

/** How often to re-ask while a refresh is in flight, and for how long before giving up. */
const POLL_INTERVAL_MS = 5_000;
const POLL_LIMIT = 40; // ~3.5 minutes, comfortably past a full-category collection

export type SearchStatus = "idle" | "loading" | "error" | "done";

export interface SearchState {
  status: SearchStatus;
  query: string;
  zip: string;
  availability: AvailabilityFilter;
  /**
   * Whether to compare only stores that are not shut. Like the availability filter, it is a
   * query parameter and not a client-side hide: the backend decides which offer is cheapest,
   * so removing a store's rows here would leave the badge on one that is no longer shown.
   */
  openNow: boolean;
  data: SearchResponse | null;
  message: string;
  unreachable: boolean;
  /** True between pressing refresh and the API confirming one is in flight. */
  refreshPending: boolean;
  /**
   * The page being shown or requested. Kept here rather than read back off `data.page`,
   * because the poll effect below has to see a page change *immediately*: a request in
   * flight leaves `data` at the same object reference, so a `page` derived from it would not
   * change until the response landed, the poll timer would not be reset, and the poll would
   * then fire with the page the reader had just navigated away from -- aborting their click
   * and putting the old page back with no error.
   */
  page: number;
  /** The last thing a refresh request said, for the message it produced. */
  refreshError: string | null;
  /**
   * When this ZIP+category may be refreshed again, as a `Date.now()` moment.
   *
   * The API reports the cooldown as seconds *remaining*, so it is turned into a deadline
   * here -- at the moment the response arrived, which is the only point where the two clocks
   * can be reconciled. A skew against the server can then never show a wrong countdown.
   */
  cooldownEndsAt: number | null;
}

const INITIAL: SearchState = {
  status: "idle",
  query: "",
  zip: "",
  availability: DEFAULT_AVAILABILITY,
  openNow: false,
  data: null,
  message: "",
  unreachable: false,
  refreshPending: false,
  page: 1,
  refreshError: null,
  cooldownEndsAt: null,
};

/** Turn "seconds left" into a deadline, at the moment the answer arrived. */
function cooldownDeadline(seconds: number | undefined): number | null {
  return seconds && seconds > 0 ? Date.now() + seconds * 1000 : null;
}

/**
 * Everything the results page needs to run: the current search, its page, and the
 * stale-while-revalidate loop behind it.
 *
 * The two behaviours worth knowing about:
 *
 * **Results are never taken away.** A re-query for a new page, a new filter or a poll keeps
 * the previous response on screen until the new one arrives, so the page does not blink back
 * to a skeleton every time something changes. Only a genuinely new search clears it.
 *
 * **Polling is driven by the API, not by a timer we invented.** While `freshness.refreshing`
 * is true the same search is re-issued every five seconds; the moment the backend says the
 * refresh has finished, the loop stops and whatever it collected is already in the response
 * that said so.
 */
export function useSearch(zip: string) {
  const [state, setState] = useState<SearchState>({ ...INITIAL, zip });
  const abortRef = useRef<AbortController | null>(null);
  const pollsRef = useRef(0);

  const run = useCallback(
    async (
      query: string,
      zipCode: string,
      availability: AvailabilityFilter,
      openNow: boolean,
      page: number,
      { keepResults = false }: { keepResults?: boolean } = {},
    ) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((previous) => ({
        ...previous,
        status: keepResults && previous.data ? "done" : "loading",
        query,
        zip: zipCode,
        availability,
        openNow,
        page,
        data: keepResults ? previous.data : null,
        message: "",
        unreachable: false,
      }));

      try {
        const data = await searchProducts(query, zipCode, {
          availability,
          openNow,
          page,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setState((previous) => ({
          ...previous,
          status: "done",
          data,
          // The response is the authority on whether a refresh is running, so a pending
          // click resolves the moment one comes back saying so.
          refreshPending: previous.refreshPending && !data.freshness?.refreshing,
          cooldownEndsAt: cooldownDeadline(data.freshness?.refresh_available_in_seconds),
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((previous) => ({
          ...previous,
          status: "error",
          message: errorMessage(error),
          unreachable: error instanceof ApiError && error.status === null,
        }));
      }
    },
    [],
  );

  const search = useCallback(
    (query: string, zipCode: string, availability: AvailabilityFilter, openNow = false) => {
      pollsRef.current = 0;
      void run(query, zipCode, availability, openNow, 1);
    },
    [run],
  );

  const goToPage = useCallback(
    (page: number) => {
      if (!state.query || page === state.page) return;
      void run(state.query, state.zip, state.availability, state.openNow, page, {
        keepResults: true,
      });
      // A new page starts at the top of the list, the way every paginated result set does.
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [run, state.query, state.zip, state.availability, state.openNow, state.page],
  );

  const setAvailability = useCallback(
    (availability: AvailabilityFilter) => {
      if (!state.query) {
        setState((previous) => ({ ...previous, availability }));
        return;
      }
      // The filter also decides which offer is cheapest, so it is a new query rather than a
      // client-side hide.
      void run(state.query, state.zip, availability, state.openNow, 1, { keepResults: true });
    },
    [run, state.query, state.zip, state.openNow],
  );

  const setOpenNow = useCallback(
    (openNow: boolean) => {
      if (!state.query) {
        setState((previous) => ({ ...previous, openNow }));
        return;
      }
      // Same reasoning as the availability filter: it narrows which stores are compared, so
      // the cheapest offer can change and only the backend can say what it is now.
      void run(state.query, state.zip, state.availability, openNow, 1, { keepResults: true });
    },
    [run, state.query, state.zip, state.availability],
  );

  const refresh = useCallback(async () => {
    if (!state.zip) return;
    setState((previous) => ({ ...previous, refreshPending: true, refreshError: null }));
    try {
      const response = await refreshPrices(state.zip, state.query || undefined);
      pollsRef.current = 0;
      setState((previous) => ({
        ...previous,
        refreshError: null,
        refreshPending: response.state === "started" || response.state === "already_running",
        // Adopt the freshness the refresh reported, so the cooldown starts counting down at
        // once rather than at the next search.
        data: previous.data ? { ...previous.data, freshness: response.freshness } : previous.data,
        cooldownEndsAt: cooldownDeadline(response.freshness.refresh_available_in_seconds),
      }));
    } catch (error) {
      // The request to *start* a refresh failed -- distinct from a refresh that ran and
      // failed, which comes back in `freshness.last_error`. Either way the results already
      // on screen stay there; this only adds a line saying the button did not work.
      setState((previous) => ({
        ...previous,
        refreshPending: false,
        refreshError: errorMessage(error),
      }));
    }
  }, [state.zip, state.query]);

  // The revalidation half of stale-while-revalidate: re-ask while the backend is collecting.
  const refreshing = state.data?.freshness?.refreshing ?? false;
  // A fresh budget for each period of collecting, rather than one for the session: without
  // this, a page that has polled forty times stops revalidating for good.
  const wasRefreshing = useRef(false);
  if (refreshing && !wasRefreshing.current) pollsRef.current = 0;
  wasRefreshing.current = refreshing;

  useEffect(() => {
    if (!refreshing || !state.query) return;
    if (pollsRef.current >= POLL_LIMIT) return;

    const timer = setTimeout(() => {
      pollsRef.current += 1;
      void run(state.query, state.zip, state.availability, state.openNow, state.page, {
        keepResults: true,
      });
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [
    refreshing,
    run,
    state.query,
    state.zip,
    state.availability,
    state.openNow,
    state.page,
    state.data,
  ]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, search, goToPage, setAvailability, setOpenNow, refresh };
}
