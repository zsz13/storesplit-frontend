---
paths:
  - "lib/priceHistory.ts"
  - "lib/format.ts"
  - "components/PriceBlock.tsx"
  - "components/PriceHistory*.tsx"
  - "components/OfferTable.tsx"
  - "components/ProductCard.tsx"
  - "tests/priceHistory.test.ts"
  - "tests/format.test.ts"
  - "tests/PriceBlock.test.tsx"
---

# Prices, bases and the history chart

## A price means nothing without its basis

- **A price means nothing without its basis.** `OfferOut` carries `price_basis` (`package`,
  `lb`, `oz`, `each`) beside `price`, and the second line of a `PriceBlock` has to match it.
  Rendering "$2.59 for the pack" over Target's per-pound chicken was half of the reported
  bug -- the rate relabelled as a total, above a unit price that had been divided by the
  tray's weight a second time. For a per-unit price the pack line is replaced by the
  published weight range and "final price based on weight", plus "up to $12.95" **only** when
  the retailer supplies `max_total_price`. Never multiply the rate by `max_weight` to make
  one: Target charges at most $12.95 for a tray its own title tops out at 5.25 lb, and
  $2.59 x 5.25 is $13.60. The screen-reader gloss matches the basis too; "for the pack" read
  aloud over a rate is the same wrong sentence. `packPriceLabel`, `weightRangeLabel` and
  `variableWeightNote` in `lib/format.ts` are the only place this is decided.
- **Ounces are offered, never substituted.** A weighed product carries a second, much fainter
  line under its unit price -- "≈ $0.16 / oz" beneath "$2.59 / lb" -- so a shopper who
  thinks in ounces does not have to divide by sixteen in their head. It is display only.
  `secondaryUnitPriceLabel` in `lib/format.ts` decides it, and three rules keep it safe. The
  large line stays the backend's canonical unit price, which is the number the list is ranked
  by, so the conversion cannot move a card up or down. The converted figure comes from that
  same canonical price and from no other field: where a retailer quotes the second unit
  itself, that rate is what the backend multiplied or divided by sixteen to get the
  comparison price, so converting it back returns what the retailer said -- 4-decimal
  quantization moves a per-pound figure by at most $0.0008 and it takes $0.005 to move a
  cent -- and reading `offer.price` instead would be a second source for one number, able to
  contradict the line above it and never able to change what is printed. And nothing is
  offered at all unless the comparison unit is a weight, so eggs compared per egg and milk
  compared per gallon get no invented ounce; the unit lookup is a `Map` because an object
  literal answers to "constructor" and "**proto**" with inherited members that are not
  nullish. Sub-cent conversions widen to four decimals rather than print "$0.00 / oz" (the
  dollar fallback for an unreadable currency code keeps that precision), and drop the line
  entirely below what four decimals can show.

## Price history is a series per store

- **Price history is a series per store, and the chart must never merge two.** `PriceSeriesOut`
  is one retailer's SKU at one physical store; `GET /products/{id}/price-history?days=30`
  returns one per store plus `current`, the live offer. Three rules the UI inherits from the
  API and must not relax. `points` are _changes_, not samples -- a price holds from its own
  observation until the next one, so the chart draws steps and never a diagonal. The newest
  observation _before_ the window comes back flagged `before_window`, purely to give the line
  a value to start at; it is not something that happened inside the range. And `current` is
  null for a store that no longer lists the product, so its last price is not drawn forward
  to today. Two nulls carry meaning of their own: `price_basis: null` is a row nobody
  recorded a basis for, and the tooltip then prints the amount with **no** qualifier --
  "$4.99 pack" over what may have been a per-pound rate is the sentence this whole app is
  built to avoid. `availability` on a series is what stops the chart being the one screen
  that leads with an offer nobody has confirmed; `lib/availability.ts` words it, here as
  everywhere. `lib/priceHistory.ts` holds all of the arithmetic -- scales, step paths, ticks,
  the summary -- away from the component, because "lowest in 30 days" is a claim a shopper
  reads as fact and has to be testable without a DOM. The chart plots `unit_price` only; the
  pack price is tooltip context, and `price_basis` decides whether it is even called a pack.
  What the chart may and may not say is written down in `DESIGN-BRIEF.md` under **The price
  chart**, including why its palette is not the app's green.
