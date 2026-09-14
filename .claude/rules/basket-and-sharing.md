---
paths:
  - "lib/basket.ts"
  - "lib/useBasket.ts"
  - "lib/share.ts"
  - "lib/useSharedLink.ts"
  - "app/basket/**"
  - "components/Basket*.tsx"
  - "components/ShareBasketDialog.tsx"
  - "tests/*asket*"
  - "tests/share.test.ts"
---

# Basket rules and shareable links

Unit validity, quantity handling, what blocks a comparison, and what a shared link may and
may not carry. Root `CLAUDE.md` states the invariants; the reasoning is here.

## Units, quantities and what blocks Compare

- **A basket row offers only the units its item can be measured in.** Each staple in
  `lib/basket.ts` declares what it measures (`count`, `mass`, `volume`) and the units follow
  from that -- two for eggs, six for milk, four for anything weighed. Rendering the full
  twelve-unit list on every row is what let a shopper ask for "bread, 1 count", which the API
  can only answer with `bread is compared per oz; quantity unit 'count' cannot be converted`,
  as a 422 that failed the _whole_ basket; bread's own default was `count`, so it was the
  shortest path to that error rather than an unlikely one. A test asserts every staple's
  default and every offered unit converts into its category's comparison unit, so the table
  cannot drift back into it. Adding a query the basket already holds merges into that row,
  converting the quantity, so `eggs/dozen` and `egg/count` cannot become two lines of the
  same eggs.
- **Compare is blocked only by what a shopper did, never by what StoreSplit stored.** The
  rule above stopped new bad rows and left the old ones on disk, so opening `/basket` greeted
  anyone with a basket from an earlier build with "bread -- This unit does not fit this item"
  and a dead Compare button, over a basket they had not touched. `sanitizeItems` now
  **repairs** on load (`repairItem`): a unit the item cannot be measured in is replaced by the
  category default, carrying the quantity across when the two units measure the same thing
  (500 g of bread stays 500 g) and falling back to the staple's default quantity when they do
  not, because no number of pounds is what "1 count" meant. An unreadable quantity becomes the
  staple's default, and anything under the row's minimum is raised to it. Only a query naming
  no staple survives as an error, because that one really is the shopper's. A row that is
  still unpriceable is marked in place and **blocks** Compare; it is never dropped from the
  request, because a total for four of the five things a shopper chose, with nothing on screen
  saying which was left out, is worse than a disabled button.
- **A quantity has a floor, and a unit change converts rather than relabels.** `withUnit`
  converts the amount into the new unit and holds it at the minimum: swapping the word alone
  turned 1 lb of bread into 1 oz, a sixteenth of the bread chosen by nobody. `minimumFor` is
  **one of the finest unit the row offers** -- a gram for anything weighed, a millilitre for
  milk, one egg for eggs -- and is a floor on what counts as a quantity at all, rejecting
  zero, a negative and a number too small to survive the four decimals a row is stored at.
  The tempting rule was one of the _comparison_ unit (1 oz of bread, 1 lb of rice), and it is
  wrong: the backend covers any positive quantity with `packs = max(1, ceil(needed / package
size))`, so two quarts of milk and half a pound of butter are requests it answers correctly,
  and a gallon floor and a pound floor would have silently rewritten both. No pack size was
  consulted for any of it -- a loaf is about 20 oz and a stick of butter is 4, and neither
  number appears in this repo. Each unit also carries a `step`, the stepper's increment only:
  a quantity converted out of another unit rarely lands on the grid and is still valid.

## A basket travels in a link

- **A basket travels in a link; nothing it was told about prices does.** `Share basket`
  encodes the priceable rows as `{v, i: [[query, quantity, unit], ...]}` in base64url on
  `/basket?b=`, which is deterministic, about 250 characters for the whole staple list, and
  needs no server, no token and no row in a table -- a share that outlives the browser tab
  is a retention decision nobody asked for. It carries **only** what the shopper decided.
  The prices, the stores, the open/closed state and the whole one-shop-or-two answer are
  left out on purpose: they are facts about one moment and one neighbourhood, and the
  receiver gets their own. The ZIP is left out for the same reason, and because it is the
  one piece of this that says something about a person. Only the rows that can be priced go
  in, and `Share basket` is disabled by the same rows that disable Compare: a link carrying
  four of the five things on screen, with nothing saying which was left out, is the fault
  this page already refuses to commit against a total. A quantity over `MAX_QUANTITY` is
  refused on the way in, because the basket's floor is one-sided and a crafted `1e305` would
  otherwise be a _valid_ row that rounds to `Infinity`. Decoding is `lib/share.ts` and
  trusts none of it -- length first, then base64url, then `JSON.parse` into a value checked
  field by field, then `sanitizeItems`, which already owns unit validity, the quantity floor
  and merging duplicates, so a shared row can be no stranger than a stored one. A row naming
  nothing StoreSplit can price is dropped rather than carried, because the query field is
  the one place in a link where text could be written to be read rather than priced.
- **A shared basket is offered, never applied over one that exists.** `useSharedLink`
  resolves the `?b=` once, against `currentBasket()` rather than the rendered `items`: the
  server renders an empty basket, hydration has to match it, and an effect trusting the
  rendered value would see `[]` over a full basket and replace somebody's shopping list
  without asking. It is a `useSyncExternalStore` for the same reason `useZipKnown` is -- the
  answer can only exist after hydration, and `setState` in an effect to say so is what
  `react-hooks/set-state-in-effect` refuses. An empty basket is filled and told so; a basket
  that exists gets the offer, named and itemised, with `Open shared basket` beside `Keep my
basket`. The parameter is stripped as soon as it is read, so a reload does not re-ask and
  the address bar does not keep describing a basket the shopper has since edited.
- **A basket that arrived in a link is compared without being asked to be.** The shopper
  followed a link to see what someone else's basket costs _here_, so asking them to press
  Compare over a basket they did not write is asking them to confirm the thing they already
  clicked. Every other comparison on this page is still theirs to start, and the link's
  comparison runs exactly once. It **waits** rather than gives up: the commonest shared link
  of all is somebody's first visit, which has no ZIP yet and the location dialog in front of
  it, so the phase stays `opening` until there is somewhere to compare against and choosing
  a location is what releases it. The effect stands down entirely if the shopper got there
  first. `compare` takes the request as an argument rather than closing over it, so it is
  stable enough to be that effect's dependency -- the shape `useSearch::run` already uses --
  and the one `set-state-in-effect` disable in this repo sits on that call, with its reason
  written beside it.
- **A link is a one-time instruction, and `phase` is what makes it one.** How far a link has
  got (`pending` -> `offered`/`opening` -> `said` -> `done`) lives in the store beside the
  link, not in
  `BasketView`'s state, because the module outlives a client-side navigation and the
  component does not. Held in `useState`, the phase reset to `pending` on the way back from
  `/`, and the effect applied the same link a second time -- over whatever had been edited
  since, silently, because `?b=` was long gone from the address bar and the conflict check
  never ran again; an answered offer was re-asked the same way. Two rules follow from the
  same place: the effect acts only while the phase is `pending`, and `Clear basket` retires
  the outcome line but **not** an offer still waiting for an answer, because clearing to make
  room for the shared basket is the likeliest reason to press it and the link it came from
  can no longer be recovered. Without the phase the automatic comparison would re-run on
  every return to `/basket` as well, which is a request per visit for an answer already on
  screen.
- **The clipboard is attempted, and the dialog reports what happened.** `Share basket` writes
  the link inside the click, never in an effect the click schedules, because a clipboard
  write is granted on the gesture. Where it succeeds the dialog is a receipt ("Basket link
  copied"); where the browser refuses -- an insecure origin, a denied permission, an
  unfocused document -- the same dialog opens saying "Copy this link to share your basket."
  over a readonly field that selects itself. One boolean decides the sentence and the
  button, so neither can claim a copy that did not happen.
