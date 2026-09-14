# Interface semantics

The decisions that shape what a shopper is told, and why each is worded the way it is. These
are the parts of the client that carry meaning rather than layout; the visual direction is in
[DESIGN-BRIEF.md](../DESIGN-BRIEF.md).

The parts of this client worth reading:

**Two kinds of "unknown" (`lib/availability.ts`).** A retailer that publishes per-store
inventory and gave an unreadable answer has something missing. A retailer that publishes no
inventory anywhere — Trader Joe's sells nothing online — has nothing missing at all: the price
is real, the store really carries it, only the shelf count does not exist. Wording both as
"Stock unknown" read as a fault on our side _and_ as doubt about a solid offer. One module
turns that distinction into words, so a card, an offer row, and a basket line cannot word it
three ways. It changes what the shopper is told, never what they are recommended.

**The clock belongs to the shop, not the shopper (`lib/openNow.ts`).** Open/closed is decided
on the server, in the store's own timezone. Nothing here re-derives it from the browser's
clock. The module sorts and groups that answer and never computes one.

**A price is a step, not a slope (`lib/priceHistory.ts`).** Nothing was charged between two
observations except the earlier price, so the chart holds flat and turns at the change.
Interpolating between $4.99 and $5.49 would draw fourteen prices nobody ever paid. The axis is
the unit price — the only figure comparable across pack sizes and per-pound rates — and the
pack price travels in the tooltip, never plotted. The arithmetic is pure and lives apart from
the component, because "lowest in 30 days" is a claim a shopper reads as fact and has to be
testable without a DOM.

**Share links refuse what they cannot name (`lib/share.ts`).** The encoding carries its
version inside the payload. A link is something people paste into messages and open weeks
later, so an unrecognized version is refused whole rather than partially read. An
over-long parameter is rejected before it is base64-decoded, because a payload past that
length is not a basket that got large.

**The unit price is the comparison; the pack price is context.** $0.42/egg decides; $4.99 is
what you hand over. Both are always shown, always in that order.

**No component library.** CSS Modules beside each component, a five-glyph hand-authored inline
SVG icon set, and a hand-drawn chart. Three runtime dependencies total.

---
