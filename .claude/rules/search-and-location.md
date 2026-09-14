---
paths:
  - "lib/zip.ts"
  - "lib/useSearch.ts"
  - "components/ZipInput.tsx"
  - "components/SearchPanel.tsx"
  - "components/SearchView.tsx"
  - "components/LocationDialog.tsx"
  - "components/LocationPrompt.tsx"
  - "components/RefreshControl.tsx"
  - "components/Pagination.tsx"
  - "tests/ZipInput.test.tsx"
  - "tests/SearchView.test.tsx"
---

# ZIP, location, results and freshness

- **There is no default ZIP, and the one in use was chosen by the shopper.** `useZip` used
  to answer `94105` when nothing was stored, so a first-time visitor in Chicago was shown San
  Francisco stores -- correctly labelled, completely useless, and with nothing on the page
  saying a location had been picked for them. It now answers `""`, which is a real state both
  pages check: `SearchView` offers no search panel without one and `BasketView` builds the
  basket but will not compare it. `LocationDialog`, rendered once from the layout, asks the
  question while that state holds, and only while it holds -- a returning visitor never sees
  it. The browser's location permission is requested **only** from `useLocate`, which nothing
  calls on mount: a prompt that appears on load is the one people refuse on reflex. A refusal,
  a timeout and a coordinate with no ZIP each end in their own sentence with the ZIP form
  still on screen, and the same hook sits behind the header's locate control, so changing
  location later asks the identical question and reports the identical refusal.
- **Coordinates become a ZIP at the backend, over the table that ranks stores.** `lookupZip`
  calls `GET /location/zip`; the frontend never geocodes and never calls a third party. The
  answer is the nearest ZCTA _centroid_, which is what the backend then measures store
  distances from, so it is the right ZIP for this product even where it is not the ZIP the
  shopper is legally standing in.
- **Results are canonical products, one card each, paged by product.** `page_size` and `page`
  are query parameters; `ProductOut` arrives with everything a collapsed card needs
  (`best_offer`, `offer_count`, `retailer_count`, `image_url`, `price_low`/`price_high`) and
  its `offers` already sorted in-stock-first then by unit price. Never re-sort or re-group
  them here: the same order decides which offer the backend called best, so a client-side
  sort would let the summary and the detail disagree.
- **Stale prices are shown, not hidden.** `freshness` says how old the data is, whether a
  refresh is in flight, and how long until one may start. While `refreshing` is true
  `useSearch` re-issues the same query every 5s and swaps the results in; results are never
  replaced by a spinner once they exist. The cooldown arrives as seconds _remaining_ and is
  turned into a `Date.now()` deadline at the moment the response lands (`cooldownEndsAt`), so
  a clock skew against the server cannot show a wrong countdown -- `useCountdown` is then a
  pure function of a shared 1s clock read through `useSyncExternalStore`. The cooldown is
  enforced by the API; the disabled button is a courtesy, not the protection.
