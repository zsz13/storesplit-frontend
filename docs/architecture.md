# Frontend architecture

Routes, module layout, configuration and container build. See [README](../README.md) for the
overview.

## Pages

- `/` Search: ZIP input (persisted in localStorage), quick-pick staples, products with every
  offer, normalized unit prices, cheapest highlights, freshness, and a button to collect prices
  for the ZIP when no data exists.
- `/basket` Basket: build a list of items with quantities and units (persisted in
  localStorage), then compare the cheapest single store against the cheapest split.

## Module layout

```
app/          App Router pages, layout, global CSS
components/   Small reusable UI pieces (CSS modules next to each component)
lib/api.ts    Typed API client and all response types
lib/format.ts Display formatting (money, unit price labels, relative time)
lib/basket.ts Basket item helpers and reducer
lib/storage.ts localStorage helpers
tests/        Vitest + Testing Library tests
```

---

## Environment variables

| Variable              | Default                 | Purpose                                    |
| --------------------- | ----------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL of the backend API (browser-side) |

`NEXT_PUBLIC_*` variables are inlined at build time, so change them before `pnpm build` or pass
them as a Docker build argument.

## Docker

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 -t storesplit-frontend .
docker run --rm -p 3000:3000 storesplit-frontend
```

The full stack (Postgres, backend, frontend) runs from the backend repository:

```bash
cd ../storesplit-backend && docker compose up --build
```

That compose file builds this directory (`../storesplit-frontend`) with
`NEXT_PUBLIC_API_URL=http://localhost:8000`.
