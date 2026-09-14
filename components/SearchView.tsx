"use client";

import { useEffect, useState } from "react";
import type { AvailabilityFilter as Filter, SearchResponse } from "@/lib/api";
import { allStockUnpublished, unconfirmedSectionCopy } from "@/lib/availability";
import { STAPLE_QUERIES } from "@/lib/basket";
import { titleCaseName, unitLabel } from "@/lib/format";
import { openStores } from "@/lib/openNow";
import { useSearch } from "@/lib/useSearch";
import { useZip, useZipKnown } from "@/lib/zip";
import { AvailabilityFilter } from "./AvailabilityFilter";
import { ClosedStoresDialog } from "./ClosedStoresDialog";
import { EmptyState } from "./EmptyState";
import { LocationPrompt } from "./LocationPrompt";
import { ErrorMessage } from "./ErrorMessage";
import { OpenNowFilter } from "./OpenNowFilter";
import { Pagination } from "./Pagination";
import { ProductCard } from "./ProductCard";
import { ProductSkeleton } from "./ProductSkeleton";
import { RefreshControl } from "./RefreshControl";
import { SearchPanel } from "./SearchPanel";
import { StoreContextBar } from "./StoreContextBar";
import styles from "./SearchView.module.css";

/** How each filter reads in a sentence about what is missing. */
const FILTER_WORDS: Record<Filter, string> = {
  in_stock: "in-stock",
  out_of_stock: "out-of-stock",
  unknown: "unconfirmed",
  all: "",
};

export function SearchView() {
  const [zip, setZip] = useZip();
  const known = useZipKnown();
  const { state, search, goToPage, setAvailability, setOpenNow, refresh } = useSearch(zip);
  // Dismissing the "everything is closed" dialog must not re-open it on the next poll, so
  // what is remembered is the dismissal rather than the condition.
  const [closedDialogDismissed, setClosedDialogDismissed] = useState(false);

  // The ZIP lives in the header and is shared with the basket page, so a change there
  // re-runs whatever is on screen here. An empty ZIP is the first-visit state and never a
  // query: there is no location for a result to be "near".
  useEffect(() => {
    if (zip && state.query && zip !== state.zip)
      search(state.query, zip, state.availability, state.openNow);
  }, [zip, state.query, state.zip, state.availability, state.openNow, search]);

  const { data } = state;

  return (
    <div className={styles.page}>
      <section className={styles.intro}>
        <h1>Where are groceries cheapest near you?</h1>
        <p className={styles.lede}>
          Real prices collected from each retailer&rsquo;s own site, compared by unit price: per
          egg, per gallon, per pound, never by pack size.
        </p>
      </section>

      {/* Without a ZIP there is nothing to search and nothing a result could be near, so the
          panel is not offered at all. Showing it would invite a query that cannot be run.
          `known` keeps the panel on screen until the browser has read storage, so a returning
          shopper does not see a frame of "choose a location" on every page load. */}
      {known && !zip ? (
        <LocationPrompt lede="StoreSplit compares a staple across the shops near one ZIP code." />
      ) : (
        <SearchPanel
          activeQuery={state.query || undefined}
          onSearch={(q) => search(q, zip, state.availability, state.openNow)}
        />
      )}

      {zip && state.status === "idle" ? (
        <EmptyState title="Pick a staple to compare">
          StoreSplit compares {STAPLE_QUERIES.map(titleCaseName).join(", ")} across every store it
          can read near <span className="mono">{zip}</span>.
        </EmptyState>
      ) : null}

      {state.status === "error" && !data ? (
        <ErrorMessage title={state.unreachable ? "Backend unreachable" : "Search failed"}>
          <p>{state.message}</p>
          {state.unreachable ? (
            <p className="small muted">
              Start the StoreSplit backend: <code>docker compose up --build</code> in the backend
              repository.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => search(state.query, zip, state.availability, state.openNow)}
          >
            Try again
          </button>
        </ErrorMessage>
      ) : null}

      {state.status === "loading" && !data ? (
        <>
          <p className="sr-only" role="status">
            Searching for {state.query} near {zip}
          </p>
          <ProductSkeleton />
        </>
      ) : null}

      {data ? (
        <Results
          data={data}
          zip={zip}
          busy={state.status === "loading"}
          refreshPending={state.refreshPending}
          cooldownEndsAt={state.cooldownEndsAt}
          refreshError={state.refreshError}
          onAvailability={setAvailability}
          onOpenNow={(next) => {
            setClosedDialogDismissed(false);
            setOpenNow(next);
          }}
          closedDialogDismissed={closedDialogDismissed}
          onDismissClosedDialog={() => setClosedDialogDismissed(true)}
          onRefresh={() => void refresh()}
          onPage={goToPage}
          onZip={setZip}
        />
      ) : null}
    </div>
  );
}

interface ResultsProps {
  data: SearchResponse;
  zip: string;
  busy: boolean;
  refreshPending: boolean;
  cooldownEndsAt: number | null;
  refreshError: string | null;
  onAvailability: (next: Filter) => void;
  onOpenNow: (next: boolean) => void;
  /** Remembered by the page, not by this view: a poll must not re-open a dismissed dialog. */
  closedDialogDismissed: boolean;
  onDismissClosedDialog: () => void;
  onRefresh: () => void;
  onPage: (page: number) => void;
  onZip: (zip: string) => void;
}

function Results({
  data,
  zip,
  busy,
  refreshPending,
  cooldownEndsAt,
  refreshError,
  onAvailability,
  onOpenNow,
  onRefresh,
  onPage,
  closedDialogDismissed,
  onDismissClosedDialog,
}: ResultsProps) {
  const unsupported = data.category === null;
  const hasProducts = data.products.length > 0;
  const openCount = openStores(data.stores).length;
  const unknownProducts = data.unknown_products ?? [];
  // The dialog explains why there is nothing to compare, so it fires only when there is
  // nothing to compare. Three conditions, and the last is the one that is easy to miss:
  // unknown-hours stores are deliberately *kept* by the filter, so a ZIP holding only
  // Raley's and Kroger answers with real prices while no store is confirmed open.
  // Opening a modal over those results to say "every store near you is closed" would
  // contradict both the prices underneath it and the dialog's own "they may be open".
  const everythingClosed =
    data.open_now &&
    data.stores.length > 0 &&
    openCount === 0 &&
    !hasProducts &&
    unknownProducts.length === 0;
  const unconfirmed = unconfirmedSectionCopy(
    allStockUnpublished(unknownProducts.flatMap((p) => p.offers)),
  );
  const unitText = data.comparison_unit
    ? `per ${unitLabel(data.comparison_unit, data.category)}`
    : null;
  const total = data.page?.total_products ?? data.products.length;

  return (
    <div className={styles.results}>
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <h2 className={styles.title}>
            {titleCaseName(data.category_label ?? data.query)}
            {unitText ? <span className={styles.unitHint}>compared {unitText}</span> : null}
          </h2>
          <p className={styles.count} aria-live="polite">
            {total} product{total === 1 ? "" : "s"} near <span className="mono">{zip}</span>
            {data.availability === "all" ? null : <> · {FILTER_WORDS[data.availability]} only</>}
          </p>
        </div>
        <RefreshControl
          freshness={data.freshness}
          onRefresh={onRefresh}
          pending={refreshPending}
          cooldownEndsAt={cooldownEndsAt}
          requestError={refreshError}
        />
      </div>

      <div className={styles.controls}>
        <div className={styles.filters}>
          <AvailabilityFilter value={data.availability} onChange={onAvailability} />
          <OpenNowFilter
            value={data.open_now}
            onChange={onOpenNow}
            openCount={openCount}
            storeCount={data.stores.length}
          />
        </div>
        <StoreContextBar stores={data.stores} zipCode={data.zip_code} openNow={data.open_now} />
      </div>

      {/* Every shop this ZIP means is shut. The filter has nothing to show and the reason is
          not a fault, so it is said plainly and with the next opening beside it -- and the
          way out of it is the dialog's own primary action. */}
      <ClosedStoresDialog
        stores={data.stores}
        open={everythingClosed && !closedDialogDismissed}
        onClose={onDismissClosedDialog}
        onShowAll={() => {
          onDismissClosedDialog();
          onOpenNow(false);
        }}
      />

      {unsupported ? (
        <EmptyState title={`“${data.query}” is not a staple StoreSplit compares`}>
          It compares {STAPLE_QUERIES.map(titleCaseName).join(", ")}. Those are the categories with
          a normalized unit price behind them.
        </EmptyState>
      ) : !hasProducts && everythingClosed ? (
        <EmptyState
          title="Every store near you is closed right now"
          action={
            <button type="button" className="btn btn-sm" onClick={() => onOpenNow(false)}>
              Show all stores
            </button>
          }
        >
          Nothing within range of <span className="mono">{zip}</span> is open. Turn off{" "}
          <strong>Open now</strong> to compare prices anyway.
        </EmptyState>
      ) : !hasProducts && data.offers_before_filter > 0 ? (
        // Offers exist and the filter hid every one of them. Collecting again would change
        // nothing, so this state offers the filter rather than a refresh.
        <EmptyState
          title={`No ${FILTER_WORDS[data.availability]} offers for ${titleCaseName(data.category_label ?? data.query)}`}
          action={
            <button type="button" className="btn btn-sm" onClick={() => onAvailability("all")}>
              Show all {data.offers_before_filter} offers
            </button>
          }
        >
          {data.offers_before_filter} offer
          {data.offers_before_filter === 1 ? " is" : "s are"} hidden by this filter, including
          retailers that publish no stock levels at all.
        </EmptyState>
      ) : !hasProducts ? (
        <EmptyState
          title={`No prices collected for ${titleCaseName(data.category_label ?? data.query)} near ${zip} yet`}
          action={
            <RefreshControl
              freshness={data.freshness}
              onRefresh={onRefresh}
              pending={refreshPending}
              cooldownEndsAt={cooldownEndsAt}
              requestError={refreshError}
            />
          }
        >
          Prices are collected on demand, straight from each retailer&rsquo;s site. Collecting takes
          about a minute and runs in the background.
        </EmptyState>
      ) : (
        <div className={styles.list} data-busy={busy || undefined}>
          {data.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              cheapestOfferId={data.cheapest_offer_id}
            />
          ))}
        </div>
      )}

      {data.page ? <Pagination page={data.page} onPage={onPage} /> : null}

      {/*
        Retailers that publish no stock at all. Trader Joe's sells nothing online and says
        nothing about its shelves, so filtering it out of the confirmed view is right and
        hiding it entirely is not: the price is real and the link is real. Kept below the
        confirmed results, under its own heading, so the two are never read as one claim.

        The heading is written from what the section actually holds. Mostly that is
        retailers who publish nothing -- and "Availability unknown" was a poor name for
        them, because nothing about those offers is unknown except a number that does not
        exist. But a retailer that does publish stock can land here too, when its answer
        for one product could not be read, and captioning that as "they don't publish it"
        would be wrong in the other direction.
      */}
      {unknownProducts.length > 0 ? (
        <section className={styles.unknown} aria-labelledby="availability-unknown">
          <div className={styles.unknownHead}>
            <h2 id="availability-unknown" className={styles.unknownTitle}>
              {unconfirmed.heading}
            </h2>
            <p className={styles.unknownNote}>{unconfirmed.caption}</p>
          </div>
          <div className={styles.list}>
            {unknownProducts.map((product) => (
              <ProductCard key={product.id} product={product} cheapestOfferId={null} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
