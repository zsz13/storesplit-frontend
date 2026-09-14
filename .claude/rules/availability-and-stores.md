---
paths:
  - "lib/availability.ts"
  - "lib/openNow.ts"
  - "components/AvailabilityPill.tsx"
  - "components/AvailabilityFilter.tsx"
  - "components/OpenNowFilter.tsx"
  - "components/ClosedStoresDialog.tsx"
  - "components/StoreLine.tsx"
  - "components/StoreContextBar.tsx"
  - "tests/availability.test.ts"
  - "tests/openNow.test.ts"
  - "tests/maps.test.ts"
---

# Availability wording and store context

The two kinds of `unknown`, who decides the filters, and the one component that renders a
store everywhere.

## Open now and availability are the backend's decisions

- **"Open now" is the backend's job, and it narrows stores rather than hiding rows.**
  `open_now` is a search query parameter and a `BasketRequest` field, and changing it
  re-queries. The backend decides open/closed in each store's **own** timezone; the browser's
  clock is the shopper's, not the shop's. Only a confirmed closure is excluded -- a store
  whose retailer publishes no hours stays, and `lib/openNow.ts::byOpenState` ranks it after
  the ones that really are open, so nothing unknown is presented as open. `SearchResponse.
stores` is never narrowed, which is what lets `ClosedStoresDialog` say what is shut and
  when it opens. It orders by `hours_today.next_open_at` (an instant) and prints
  `opens_at` (a wall clock), because two stores in different zones print the same "8:00 AM"
  and are not open at the same moment. The dialog is a native `<dialog>` + `showModal()`:
  the focus trap, `Esc` and `::backdrop` are the platform's and are not worth a dependency.
- **Availability filtering is the backend's job too.** It decides which offer is cheapest, so
  the filter is a query parameter (`in_stock` by default) and changing it re-queries, rather
  than hiding rows client-side. Offers that are not `in_stock` carry a visible label.

## `unknown` is two situations

- **`unknown` is two situations, and they are worded differently.** `StoreOut.stock_reporting`
  says whether the retailer publishes per-store stock at all. `live` plus `unknown` is a
  reading that failed -- "Stock not confirmed", amber, because something is missing.
  `not_published` plus `unknown` is a retailer that states no inventory anywhere (Trader
  Joe's sells nothing online; Raley's runs inventory tracking off) -- "Availability not
  published", slate, with "Carried here - check in store" beside the price, because nothing
  is missing: the price, the store and the product page are as real as any other offer's.
  "Stock unknown" was the wrong sentence for the second case in both directions -- it read
  as StoreSplit having failed to look, and as doubt about a perfectly good price.
  `lib/availability.ts` is the only place this becomes words, so a card, an offer row and a
  basket line cannot word it three ways; the section heading is "Also sold nearby" and its
  caption is written from what the section actually holds (`allStockUnpublished`), because
  a retailer that does publish stock can land there too. **None of it relaxes anything**:
  the backend still keeps `unknown` out of the comparison, so it cannot be badged cheapest,
  lead a card, or enter a basket.

## Which store, and is it open

- **Which store, and is it open -- one component, every surface.** `StoreLine` renders the
  branch, today's hours with an open/closed dot, a Maps link and a `View item` link, and it
  is what a collapsed result card, an expanded offer row and a basket line all use. Before
  it, the same four facts were answered three ways: an offer row had an address and hours, a
  basket line had neither, and a result card named a branch with nothing attached to it.
  `OfferLinks` owns the two links themselves (`ItemLink`, `MapsLink`) so their wording, icon
  and rules are identical wherever they appear, and an item with no valid page says "No item
  page" rather than leaving a shopper hunting for a link that is not there.
  The **street address** is the one part held back from the collapsed card (`variant="inline"`):
  a shopper comparing unit prices does not need one until they have chosen, and twenty
  addresses is clutter in the one place that has to stay scannable. `showBranch={false}`
  inside an offer row, whose first column already names the branch.
  A single-store basket states its store once, above the lines, and each line keeps its own
  `ItemLink`; a split basket puts the strip on every line, because the second trip is the
  whole proposition.
  The backend decides open/closed in the store's **own** timezone and sends
  `hours_today: {state, opens_at, closes_at, opens_day, closed_all_day}` as wall-clock
  strings; `storeHoursLabel` only formats them. `closed_all_day` earns its own sentence:
  "Closed today" ends a shopper's question, where "Closed - Opens 8:00 AM" answers it, and a
  weekday the retailer simply did not publish is neither. Never parse them as instants and never compute
  open/closed here -- the browser's clock is the shopper's, not the store's.
  **`unknown` is a real answer.** Raley's serves store details from a robots-disallowed path
  and its store page carries no store record, and Trader Joe's publishes a full week with no
  timezone anywhere -- so without a Google key both show "Hours not published". That is the
  honest rendering, not a gap to paper over. (Lucky, 99 Ranch, Sprouts, Safeway, Smart &
  Final and Whole Foods all publish real hours, and did not need the client to change.)
  The Maps link is likewise the backend's answer, not a guess made here: it may be a Google
  _place_ the retailer published (Target, Safeway) or an address search naming the retailer,
  and `mapsLinkHref` gates both the same way. `maps.google.com` is one of the hosts it
  accepts precisely because a `?cid=` place link lives there.
