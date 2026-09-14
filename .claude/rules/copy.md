---
paths:
  - "components/**"
  - "app/**/*.tsx"
  - "lib/format.ts"
  - "lib/links.ts"
  - "tests/copy.test.ts"
  - "tests/links.test.ts"
---

# User-facing copy and links

Copy is where a rule quietly stops being followed, so the rules here are tested rather than
trusted. Root `CLAUDE.md` states the two that always apply (no em dash, no implementation
jargon).

## Links

- **A product link is rendered only if `productLinkHref` returns a URL.** It requires an
  absolute https URL with a path, no credentials, no backslash, and a host equal to the
  `retailer_host` the API supplies for that store. Never put `offer.product_url` straight into
  an `href`: a relative or object-shaped value resolves against StoreSplit's own origin and
  looks like a real destination. `mapsLinkHref` is the same gate for `StoreOut.maps_url`,
  against Google's own map hosts -- the backend built that URL, but an `href` is a
  destination wherever it came from.

## Product naming

- **A canonical name is matched lowercase and displayed cased.** `normalized_name` is the
  backend's `normalize_title` output -- lowercased, depunctuated, brand-stripped -- built so
  two retailers' titles can be _matched_, and never a display string: "premium med grain rice"
  set as a product heading reads like a database row. `titleCaseName` in `lib/format.ts` is
  the only place that is repaired -- reached through `productTitle` and `brandLabel`, or
  directly where a basket line already has the stored string -- so a search card, a basket
  line and the price-history dialog cannot case one product three ways. Three rules keep it from shouting: a word already carrying a capital, or starting with
  a digit, is left exactly as it is (so a fixture, and any future backend that preserves
  retailer casing, needs no change here); a known token is cased as that token, from a short
  list every entry of which actually occurs in `canonical_products` (`USDA`, `UHT`, `GMO`,
  `DHA`, `A2`, the egg grade `AA`); and a minor word is lowercased only when it is neither
  first nor last, which is what makes "365 by Whole Foods Market". **`OfferOut.title` is
  untouched** -- that is the retailer's own wording, and it is the string a shopper sees again
  on the retailer's own page. **A staple's own query is cased the same way**: the chips that
  add one, a basket row, the shared-basket preview, the results lines and the "no Rice" a
  store is missing all run the stored key through `titleCaseName`, so `chicken breast` is
  "Chicken Breast" everywhere it is read and `chicken breast` everywhere it is sent. The
  add-form's `datalist` offers the cased spelling too, because `normalizeQuery` lowercases
  whatever lands in the field on the way to the API. `humanize` is gone: it capitalised the
  first letter only, which is how the same noun came to be "Chicken breast" on one screen and
  "Chicken Breast" one screen away.

## The copy rules are tested

- **The copy rules are tested, because copy is where a rule quietly stops being followed.**
  `tests/copy.test.ts` parses every file under `app/`, `components/` and `lib/` with the
  TypeScript compiler and reads the text out of string literals, template chunks and JSX
  prose -- a parse rather than a grep, because the distinction that matters is exactly the
  one a regular expression cannot draw between an em dash in a comment and the same
  character in a sentence. Two rules hold. **No em dash in user-facing text**: it is the
  punctuation of generated prose, it is on no keyboard a shopper has, and at 13px it is the
  hyphen it should have been; every sentence that had one reads better as two sentences or
  a comma. (The en dash stays where it is a numeric range -- "$1.89 - $2.49" is what it is
  for.) And **no naming the page's own furniture**: "change it in the header" asks somebody
  to translate a layout word into a place to click and stops being true the day the control
  moves, so the action goes in the sentence as a button. `focusZipField` in `lib/zip.ts` is
  what those buttons do -- it puts the cursor in the one ZIP field and selects it -- and the
  field's id lives there too so nothing has to describe where it is.
