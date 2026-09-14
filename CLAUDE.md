# StoreSplit frontend

## Purpose

Next.js (App Router, TypeScript strict) UI for StoreSplit, a local-only grocery price
comparison MVP. Two pages: `/` searches a staple near a ZIP and lists every offer with
normalized unit prices; `/basket` compares a basket across one store vs. a split.

## API boundary

- The frontend talks ONLY to the backend HTTP API (`../storesplit-backend`). Base URL comes
  from `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`), inlined at build time; the
  browser calls the API directly.
- Every request and response type lives in `lib/api.ts`, mirroring the backend's
  `app/schemas.py`. Decimals arrive as strings ("4.99"), timestamps as ISO 8601. Keep them as
  strings in state; format only for display.
- `ApiError` carries `status` and the FastAPI `detail`; `errorMessage()` turns any error into
  user text. Collection is asked for with `refreshPrices()` (`POST /products/refresh`), which
  returns at once and runs in the background, so no browser request waits a minute.
- **Scraping, matching, unit conversion, unit prices, cheapest flags, totals and savings are
  computed by the backend. Do not reimplement price math here; only parse for display.**

## Where the detailed rules live

This file stays small on purpose: it holds what applies to nearly every task. Area detail is
in `.claude/rules/`, scoped by path — **read the matching file before editing those paths.**

| Touching                               | Read                                       |
| -------------------------------------- | ------------------------------------------ |
| basket, units, shared links            | `.claude/rules/basket-and-sharing.md`      |
| stock wording, open/closed, store rows | `.claude/rules/availability-and-stores.md` |
| prices, bases, the history chart       | `.claude/rules/prices-and-history.md`      |
| ZIP, location, results, freshness      | `.claude/rules/search-and-location.md`     |
| any user-facing text or link           | `.claude/rules/copy.md`                    |
| CSS, the app shell                     | `.claude/rules/styling.md`                 |

`DESIGN-BRIEF.md` is the visual and product direction. Read it before changing the look of
anything.

## Invariants

These hold regardless of which file is open. Each is expanded in the scoped rule above.

- **The backend decides; this app renders.** Availability filtering, "open now", cheapest
  flags and every total are the backend's, because they decide which offer wins. Filtering
  rows in the browser would strand a badge on a row no longer shown.
- **The three availability states stay semantically distinct, and `unknown` is two
  situations.** `stock_reporting` separates "a reading failed" from "this retailer publishes
  no stock anywhere"; they are never worded the same. Neither changes any ranking.
- **A store is an exact store.** Every price, every open/closed answer and every history
  series belongs to one physical store, and nothing merges two of them.
- **Open/closed comes from the store's own clock**, decided by the backend in the store's
  timezone. Never re-derive it from the browser's clock.
- **The unit price is the comparison; the pack price is context.** Both are always shown, in
  that order. A price is never displayed without its basis.
- **A basket row offers only the units its item can be measured in**, with a floor, and a
  unit change converts rather than relabels. Legacy rows are repaired, never silently dropped.
- **A shared link carries items only.** No prices, no ZIP, no store: the recipient's basket
  is repriced for their own location. A link is offered, never applied over an existing
  basket.
- **No em dash in user-facing copy**, and no implementation jargon in anything a shopper
  reads. Both are enforced by `tests/copy.test.ts`.

## Organization

```
app/            layout.tsx (header/footer shell), page.tsx (/), basket/page.tsx, globals.css
components/     one component per file with a sibling CSS module
lib/api.ts      typed fetch client (timeout, ApiError) + all types
lib/availability.ts  the only place a stock state becomes words; the two kinds of `unknown`
lib/basket.ts   BasketItem, staples, per-item units/steps/minimums, conversion, legacy-row
                repair, basketReducer, per-row validation, request builder
lib/share.ts    a basket as a `?b=` link: encode, decode, validate, and the clipboard
lib/format.ts   money, unit price label, package size, times, hours, address, name casing
lib/links.ts    productLinkHref / mapsLinkHref: the rules a URL must pass to become an href
lib/openNow.ts  reading the backend's open/closed answer: grouping, ordering, next openings
lib/priceHistory.ts  chart arithmetic: series colours, step paths, scales, ticks, summary
lib/zip.ts      useZip, useLocate, focusZipField
lib/useSearch.ts     search state, pagination, and the stale-while-revalidate poll
lib/storage.ts  localStorage helpers that never throw
tests/          Vitest + Testing Library (jsdom)
```

- Pages are server components that render one client view component. Mark a component
  `"use client"` only when it needs state, effects or browser APIs.
- Prefer simple reusable components over premature abstractions; no shared "ui kit" layer.

## Commands

```bash
pnpm install
pnpm dev            # :3000, needs backend at :8000
pnpm build && pnpm start
pnpm lint / pnpm format / pnpm format:check / pnpm typecheck
pnpm test           # vitest run
```

All of lint, typecheck, format:check, test and build must pass before finishing a change.

## Testing

- Vitest with jsdom, `tests/setup.ts` loads jest-dom matchers. Tests live in `tests/`.
- Cover pure helpers (`lib/format.ts`, `lib/basket.ts`) with deterministic inputs (pass `now`
  explicitly for relative times) and components by mocking `@/lib/api` with `vi.mock`.
- Never hit the real backend from tests.

## Review workflow

implementation → validation → dead-code audit when triggered → Ponytail review when
triggered → re-validation → adversarial jury for non-trivial or high-risk work, plus visual
review in a real browser for UI changes.

Triggers and procedures are defined in the skills and in `~/github/CLAUDE.md`; do not restate
them here. Never commit or push with a known failing check, and never bypass a failing hook.

## Docker and boundaries

- `Dockerfile`: multi-stage `node:22-alpine` with pnpm via corepack, `output: "standalone"`,
  build arg + env `NEXT_PUBLIC_API_URL`, runs `node server.js` on :3000. The full stack is
  `cd ../storesplit-backend && docker compose up --build`.
- Only this repository is in scope. Read the backend's `app/schemas.py` and `app/api/*.py` to
  learn the contract; never modify the backend from here.
- No auth, state libraries, or extra dependencies without a concrete reason. "Maps" is a
  plain link to Google Maps built by the backend — no map SDK, no tiles, no API key.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
