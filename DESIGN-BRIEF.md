# StoreSplit design brief

## Product

A price board for grocery staples. It answers one question — _which store near me sells this
cheapest, per unit, right now_ — from prices collected off retailers' own sites. It sells
nothing; every path out of it leads to the retailer.

## Audience

A household shopper planning a week's staples. Short sessions, often on a phone, often
standing in a kitchen or a car park. Price-motivated and rightly suspicious of stale numbers.

## Primary job

The results screen must let someone compare a staple across every nearby store, by unit
price, without scrolling and without expanding anything. Everything else is secondary.

## Design principles

1. **The unit price is the comparison; the pack price is context.** $0.42/egg is the fact
   that decides; $4.99 is what you hand over. Both are shown, always, in that hierarchy.
2. **One product, one row.** A canonical product occupies one card no matter how many stores
   carry it. Density is a feature: the screen exists to hold many comparable things.
3. **Progressive disclosure.** Collapsed shows the answer. Expanded shows the evidence —
   every retailer, every store, every price.
4. **Honest state.** Freshness, availability and "we don't know" are first-class and legible.
   Nothing unbuyable is ever dressed as an answer.

## Anti-goals

- **Not a storefront.** No hero imagery, no promotional urgency, no "deals!".
- **Not a dashboard.** No KPI tiles, no sparklines, and no chart on the results page.
  **Amended 2026-09-13:** one chart now exists, and only one — the price history a shopper
  opens from a card. The anti-goal stands for the surfaces it was written about: the results
  screen is still a price board, and nothing here is rendered as a chart, a tile or a trend
  line by default. What changed is that "how has this moved?" turned out to be a question
  this audience actually asks and StoreSplit already had the data to answer. So the chart is
  behind a deliberate action, lives in a modal, and is held to the same rules as the rest of
  the app: unit price in the headline slot, honest about what is not known, and silent about
  trends it cannot support. See **The price chart** below for the rules it obeys.
- **Not a marketplace.** There is no cart and no buy button; StoreSplit is not in the
  transaction.
- **No retailer mimicry.** Retailer names are set as plain text, never in their brand type or
  colors.

## Visual direction

A comparison table that happens to be made of cards. Structure is carried by hairline rules,
not by shadows and not by boxes inside boxes. Each result is a row: a small square product
thumbnail, a text column that can wrap, and a right-aligned price block set in tabular
numerals so digits line up down the page and the eye can scan a column of prices.

The ground is a warm neutral so retailer photography — almost all of it shot on white — sits
on the page without glowing. Green is the only accent and it is rationed to three jobs: the
best price, the active control, and the primary action. Availability uses its own muted
status colors and is never signalled by color alone.

**Revised 2026-09-12 — a card is two bands, and the second one is the shop.** The first
version was too plain to be read as a product: a column of identical hairline rows with a
wide dead gap between each title and its price, and no way to act on a result without
opening a disclosure first. The comparison is unchanged — same ranking, same unit price in
the headline slot. What changed is that every card now carries a **store strip** below the
price, on the sunken ground: which branch, whether it is open right now, a map link and a
link to the item. It is the same component in search results, in the expanded offer rows
and in every basket line, so "where is it and is it open" cannot be answered three
different ways on three screens.

The ground went one shade deeper (`#f2f3ef`) and cards gained a single hairline of contact
shadow, because a white card on a near-white ground was a border and nothing else. Structure
is still the border; the shadow is what it sits on. Radius went 10px → 12px on cards.

## Typography roles

System stack, no webfont: this is a utility that must paint instantly, and a font download
would be the slowest thing on the page.

| role    | setting                                 | used for                        |
| ------- | --------------------------------------- | ------------------------------- |
| display | 1.75rem / 1.15 / 680 / -0.02em          | page title only                 |
| heading | 1.0625rem / 1.3 / 620 / -0.01em         | product name                    |
| body    | 0.9375rem / 1.45 / 400                  | prose, offer rows               |
| label   | 0.75rem / 1.2 / 600 / 0.04em, uppercase | column headers, section labels  |
| unit    | 1.25rem / 650, tabular                  | the unit price — the comparison |
| price   | 0.8125rem / 560, tabular                | the pack price — the context    |
| mono    | 0.8125rem, tabular                      | ZIP codes, SKUs                 |

## Color roles

Semantic only at call sites. `--surface`, `--surface-raised`, `--surface-sunken`; `--text`,
`--text-muted`, `--text-faint`; `--border-subtle`, `--border`, `--border-strong`; `--accent`
and its soft/strong/text variants; `--positive` (in stock), `--caution` (unknown), `--critical`
(out of stock), `--sale` (a price below its regular). Light only, matching the existing app —
dark is not in scope and half-doing it would ship contrast bugs.

## Spacing and layout rhythm

4px base: 4, 8, 12, 16, 24, 32, 48. Page max width 1120px. Cards are full-bleed rows on
mobile and a 3-column grid (`thumb | text | price`) from 720px up.

## Surface, radius, shadow

Hairline `--border-subtle` carries almost all structure. Radius: 12px cards, 8px controls
and thumbnails, 999px pills. A card's structure is still its border — but it also gets
`--shadow-card`, one hairline of contact shade, because a white card on a near-white ground
was a border and nothing else and a page of twenty read as ruled paper. That is the whole
shadow budget for a resting card; `--shadow-card-hover` answers a pointer, and
`--shadow-float` is still reserved for the one element that genuinely floats, the sticky
header. Nothing else casts anything.

## Motion

120ms `ease-out` for state changes, 180ms for the offer-table expand (grid-template-rows, so
it animates without measuring). Nothing animates on entry; a list of prices that fades in is
a list of prices you cannot read yet. `prefers-reduced-motion` collapses every duration to 0.

## Iconography

Inline SVG only, 16px, `currentColor`, stroke 1.5 — chevron, spinner, external link, search,
location. No icon font, no icon package.

## Content and copy tone

Terse and factual. Numbers over adjectives. Buttons name the action (`Compare offers`,
`Refresh prices`). Empty states say what is missing and what to do about it. Errors say what
failed and leave the last good data on screen.

## Responsive strategy

Mobile-first and mobile-primary — this gets used in a shop. One column below 720px with the
price block under the title; the 3-column card row from 720px; the offer table becomes
stacked labelled rows below 640px. Nothing scrolls horizontally at any width.

## Accessibility baseline

Semantic landmarks, a real `<button aria-expanded aria-controls>` for every disclosure,
filters as a `radiogroup`, visible focus rings on every interactive element, 44px touch targets
(`--tap`; secondary controls in a spaced group use `--tap-sm`, 36px, which clears the 24px
floor with their gaps), `alt` on every product image, status conveyed by text as well as color, and a live
region announcing refresh and result counts.

## Second signature element

**The store strip.** Retailer, branch, open-or-closed, Maps, View item — one row, one
component, every surface. A shopper comparing eggs and a shopper reading a basket are the
same person one screen apart.

## Signature element

**Every price is written twice, and the unit price is the one set large.** The list is ranked
by unit price, so the unit price is the number that occupies the headline slot and can be
scanned straight down the column; the pack price — what you hand over — sits directly beneath
it as context. Both are always present, in that order, on the card and on every offer row
inside it. It is the product's entire thesis — _compare per unit, not per package_ — turned
into a layout convention you cannot look away from. Setting the pack price large instead is
the mistake this exists to prevent: it makes the cheapest-per-unit card carry the biggest
number on the page, and the ranking read as no ranking at all.

## The first question

Before any of this there is one screen, and it asks where the shopper is. Every price
StoreSplit shows is for the shops near one ZIP code, and the app used to answer that question
for people: an unset ZIP rendered as `94105`, so a visitor in Chicago got a correct, useless
page with nothing on it admitting a default had been chosen.

The rules it obeys are the app's own. It is asked **once** -- only while there is no valid
stored ZIP -- so it is never a toll a returning shopper pays. The browser's location prompt is
raised only after the shopper presses the button that asks for it, because a permission dialog
that appears on load is the one people refuse without reading. Both answers are offered as
equals, a rule between them rather than a fallback under one. It is a native `<dialog>`, so
the focus trap, `Esc` and the inert background are the platform's, and it is dismissible,
because a modal with no exit is a trap and both pages carry the same prompt underneath it. The
one decorative element, the pin on its accent disc, is there so the question is recognised
before it is read; everything else is the hairline, the one floating shadow and the single
green primary action the rest of the app already uses.

And the header keeps the answer changeable: the ZIP field is the one persistent control, now
with a locate crosshair inside its border. The crosshair is deliberately not the pin beside
it -- one marks a place, the other finds it, and two identical glyphs in one control say
nothing.

## The price chart

The single exception to "not a dashboard", and the constraints that keep it one.

- **It is opened, never shown.** A `Price history` action on the card's store strip, quieter
  than the disclosure beside it. Nothing on the results page is a chart until a shopper asks
  for one, and the dialog is not mounted — and no query is made — until they do.
- **The axis is the unit price.** The same number the card sets large and the list is ranked
  by. The pack price travels in the tooltip as context. Two measures on one axis is the
  mistake the whole product exists to prevent, and a chart is not exempt from it.
- **A series is one retailer's SKU at one physical store.** Never a retailer, never a
  canonical product. Averaging two branches would draw a price nobody was charged.
- **A price is a step, not a slope.** The line holds flat and turns at the moment of the
  change. A diagonal between $4.99 and $5.49 draws fourteen prices nobody ever paid.
- **No trend from too few points.** With one observation per store the chart draws points and
  says so — "Not enough history yet", or "No price change in the last 30 days" when the
  price is old and simply steady. The two sentences are different on purpose: one is a gap,
  the other is an answer. A summary (lowest, highest, change) appears only once something has
  actually been seen to move, and the change is always a single store's, never the gap
  between two.
- **A delisted offer ends where it ended.** A series with no current price stops at its last
  observation rather than being drawn forward to today.
- **Colour is the one place the accent is not the rule.** Series use Okabe–Ito's
  colourblind-safe four (`#0072b2`, `#d55e00`, `#009e73`, `#cc79a7`), validated for lightness,
  chroma, all-pairs CVD separation and contrast against the card surface. The app's green is
  deliberately not among them: it is rationed to best price, active control and primary
  action, and a line that happened to be green would read as a verdict. Four lines draw at
  once and the rest fold into the legend; a fifth series repeats the palette with a dash
  rather than inventing an unvalidated fifth hue.
- **Identity is never colour alone.** A legend is always present with more than one series,
  every line is directly labelled at its end on wide screens, and the same readings exist as
  a screen-reader table. The chart takes keyboard focus and arrow keys walk the observations.
- **Everything else is the app's own language.** Hairline grid, tabular figures, the one
  floating shadow for the dialog, 120ms state transitions, and nothing wider than the screen
  at 375px.
