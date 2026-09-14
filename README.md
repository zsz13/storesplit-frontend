# StoreSplit — frontend

The web client for StoreSplit, a grocery price comparison that shows where a basket of
staples is actually cheapest near you — normalized to comparable units, tied to a specific
store, and honest about what it does not know.

The API and data pipeline live in
[storesplit-backend](https://github.com/zsz13/storesplit-backend). This app renders what that
API returns; it does no scraping, matching, or price arithmetic of its own.

**Stack:** Next.js 16 (App Router), React 19, TypeScript strict, CSS Modules, Vitest +
Testing Library, ESLint, Prettier, Docker.

**Scale:** 2 routes · 31 components · 15 lib modules · ~7,400 lines of TypeScript · 348 tests
across 20 files · three runtime dependencies (`next`, `react`, `react-dom`) — no UI, chart,
state, or icon library.

---

## What it does

- **Search.** A ZIP — or the browser's location, resolved to a ZIP by the backend — a staple,
  and every nearby store's price for it. One card per canonical product, **unit price
  leading, pack price as context**.
- **Exact-store context.** Every price names the physical store it came from, with distance
  and address. Nothing is averaged across branches of a chain.
- **Honest availability.** In stock, out of stock, and two deliberately distinct kinds of
  "unknown" — a reading that failed, versus a retailer that publishes no stock at all.
- **Open now.** Store hours per store, decided in that store's own timezone, with a filter
  and a dialog naming which stores were excluded and when they reopen.
- **Basket optimization.** Build a list with quantities and units, then compare the cheapest
  single store against the cheapest split across stores, with the saving and the extra stop
  both stated.
- **Basket unit repair.** Each staple offers only the units it can be measured in; a unit
  change converts rather than relabels, and legacy rows are repaired rather than dropped.
- **Shareable baskets.** A basket encodes into a link. It carries items only — the recipient's
  basket is repriced for their own location.
- **Per-store price history.** A chart of unit price over time for one exact store, drawn as
  steps rather than a slope.
- **First-visit location flow.** No default ZIP is assumed; the app asks, and remembers.
- **Responsive.** Built and verified from ~375px phone width upward.

## Why I built it

I wanted to know which nearby store was cheapest for a week's staples, and I could not find a
consumer web tool that combined the things I actually needed: prices for the _specific_ store
I would drive to, normalized to comparable units, honest about stock, aware of opening hours,
and able to tell me whether splitting a basket across two stores was worth the second stop.

Plenty of grocery sites and apps exist, and several do parts of this well. This is not a claim
that nothing comparable exists anywhere — only that I had not found a web application that put
this particular workflow together in the way I wanted, so I built one.

## An agent-engineering project

StoreSplit is a personal, hobby-scale engineering project built in my free time, and also a
real test environment for my local AI coding-agent setup.

**StoreSplit was implemented through coding agents working under my direction.** I did not
hand-type the implementation line by line, and this repository does not pretend otherwise.

What that means in practice: I identified the problem, defined the product and its
requirements, chose the architecture and the invariants the interface has to hold, decomposed
the work into agent-executable tasks, designed the prompts and constraints, reviewed what came
back, **rejected what was wrong**, drove debugging and root-cause investigation through the
agents, and defined the validation every change had to survive before it landed.

**Agent-built does not mean unreviewed or blindly accepted.** Changes went through structured
review loops — adversarial review by independent reviewer agents, a dead-code audit, a
complexity/simplification review, and visual review of the rendered interface in a real
browser — and through deterministic gates that do not care what produced the diff: Vitest,
ESLint, `tsc --noEmit`, Prettier, and a production build. Agent output that failed a gate,
contradicted an invariant, or proposed an abstraction the architecture did not need was
rejected rather than merged.

My role: product opportunity and requirements · interface architecture and component
boundaries · the design brief · task decomposition · prompt and constraint design · review and
rejection of agent output · debugging direction · validation requirements and review loops ·
test strategy, including what must be provable without a DOM.

[DESIGN-BRIEF.md](DESIGN-BRIEF.md) is the visual and product direction, written first and used
as the constraint agents had to satisfy rather than a description written afterwards.

→ Full detail in [docs/agent-engineering.md](docs/agent-engineering.md). The reusable agent
configuration lives in [zsz13/claude-code-config](https://github.com/zsz13/claude-code-config).

**On measurements:** measuring StoreSplit is not the same as measuring agent effectiveness. No
claim is made here that agents made development faster or produced better code than a human
would have — I have not run the controlled comparison that would support it. Benchmark
methodology for the agent workflows belongs in
[claude-code-config](https://github.com/zsz13/claude-code-config).

---

## Key engineering challenges

| Challenge                                    | Why it is hard                                                                                                                                                                                                                                                                           | Detail                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Two kinds of "unknown"**                   | A retailer that publishes inventory and gave an unreadable answer has something missing; one that publishes none anywhere has nothing missing at all — the price and the store are real. Wording both as "Stock unknown" reads as a fault on our side _and_ as doubt about a solid offer | [ux-and-semantics.md](docs/ux-and-semantics.md) |
| **The clock belongs to the shop**            | Open/closed is decided on the server in the store's own timezone. Re-deriving it from the browser's clock would answer for the shopper's timezone, not the shop's                                                                                                                        | [ux-and-semantics.md](docs/ux-and-semantics.md) |
| **A price is a step, not a slope**           | Nothing was charged between two observations except the earlier price. Interpolating between $4.99 and $5.49 would draw fourteen prices nobody ever paid                                                                                                                                 | [ux-and-semantics.md](docs/ux-and-semantics.md) |
| **Unit-price hierarchy**                     | $0.42/egg is the fact that decides; $4.99 is what you hand over. Both are always shown, always in that order, and a price is never displayed without its basis                                                                                                                           | [ux-and-semantics.md](docs/ux-and-semantics.md) |
| **Share links refuse what they cannot name** | A link is pasted into messages and opened weeks later, so an unrecognized version is refused whole rather than partially read, and an over-long parameter is rejected before it is decoded                                                                                               | [ux-and-semantics.md](docs/ux-and-semantics.md) |
| **Filtering belongs to the backend**         | Availability and "open now" decide which offer is _cheapest_, so filtering rows in the browser would strand the badge on a row no longer shown                                                                                                                                           | [ux-and-semantics.md](docs/ux-and-semantics.md) |
| **Stale prices are shown, not hidden**       | Freshness reports how old the data is and whether a refresh is running; withholding the best answer anyone has would be worse than labelling it                                                                                                                                          | [ux-and-semantics.md](docs/ux-and-semantics.md) |
| **Copy is tested**                           | Copy is where a rule quietly stops being followed, so the user-facing text rules — no em dash, no implementation jargon — are enforced by `tests/copy.test.ts` rather than trusted                                                                                                       | [ux-and-semantics.md](docs/ux-and-semantics.md) |

**No component library.** CSS Modules beside each component, a five-glyph hand-authored inline
SVG icon set, and a hand-drawn chart. The chart arithmetic lives apart from the component,
because "lowest in 30 days" is a claim a shopper reads as fact and has to be testable without
a DOM.

---

## Quick start

**Prerequisites:** Node.js 22 and pnpm 12 (`corepack enable`), and the backend API running at
`http://localhost:8000` — see the [backend README](https://github.com/zsz13/storesplit-backend).

```bash
pnpm install
cp .env.example .env.local   # optional; defaults to http://localhost:8000
pnpm dev                     # http://localhost:3000
```

```bash
pnpm build && pnpm start     # production build
```

The browser calls the backend directly, so it must be reachable at `NEXT_PUBLIC_API_URL` and
allow `http://localhost:3000` in CORS (it does by default). The full stack — Postgres, backend
and this app — runs from the backend repository with `docker compose up --build`.

Routes, module layout, environment variables and the container build are in
[docs/architecture.md](docs/architecture.md).

## Validation and quality gates

```bash
pnpm test          # Vitest — 348 tests across 20 files
pnpm lint          # ESLint (next + typescript + prettier compatibility)
pnpm typecheck     # tsc --noEmit
pnpm format:check  # Prettier
pnpm build         # production build
```

All five must pass before a change is finished. Tests mock `@/lib/api` and **never hit the
real backend**; pure helpers are covered with deterministic inputs, passing `now` explicitly
so relative times are not clock-dependent.

## Documentation

| Document                                        | Contents                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Interface semantics](docs/ux-and-semantics.md) | Availability wording, store-local clocks, the price chart, share links, tested copy |
| [Architecture](docs/architecture.md)            | Routes, module layout, environment variables, Docker                                |
| [Design brief](DESIGN-BRIEF.md)                 | Visual and product direction, written before implementation                         |
| [Agent engineering](docs/agent-engineering.md)  | What agent-built means here, the review loops, what is and is not measured          |

Agent instructions are in [`CLAUDE.md`](CLAUDE.md), with area detail in
[`.claude/rules/`](.claude/rules/); [`.claude/rules/README.md`](.claude/rules/README.md)
explains why they are split that way.

## Licensing

**Not open source.** This repository is public so the work can be read and evaluated — for
technical review, assessment, and study. Viewing, evaluating, and building it locally are
permitted. Copying it for reuse, modifying it, redistributing it, deploying it, or
incorporating it into another product or service require prior written permission.

Third-party dependencies are not redistributed here and keep their own licences. Retailer and
company names identify which store a price came from; StoreSplit is not affiliated with,
endorsed by, or connected to any retailer named here or shown in the interface.

See [LICENSE](LICENSE) for the full terms.
