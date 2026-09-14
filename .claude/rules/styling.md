---
paths:
  - "**/*.css"
  - "app/layout.tsx"
  - "app/globals.css"
  - "DESIGN-BRIEF.md"
---

# Styling and the app shell

- The visual direction is written down in `DESIGN-BRIEF.md`. Read it before changing the look
  of anything: it says what the accent is rationed to, why structure is borders rather than
  shadows, and what this product is deliberately not.
- **The app shell is a grid, and `.container` never sets vertical padding.**
  `app/layout.module.css` is `grid-template-rows: auto 1fr auto` on `min-height: 100dvh`, so
  the footer keeps its height on a short page and follows content on a long one. It was a
  column flexbox, and a flex item shrinks: with `main` held at its content height the footer
  absorbed the deficit and rendered 19px tall. `.container` uses `padding-inline`, never the
  `padding` shorthand -- it is combined with a module class on almost every element that uses
  it, both have the same specificity, and the emitted order follows the import graph, so a
  shorthand silently reset `Footer.module.css`'s vertical padding (which loads before
  `globals.css`) while leaving `layout.module.css`'s alone (which loads after).
- Plain CSS: design tokens (color, space, radius, motion) as CSS variables in
  `app/globals.css`, a few global utility classes (`.card`, `.btn`, `.chip`, `.muted`,
  `.label`, `.tabular`, `.skeleton`, `.stack`), and a CSS module per component. No Tailwind,
  no UI kit, no CSS-in-JS, no animation libraries.
- `[hidden] { display: none !important }` is in `globals.css` on purpose: a module class that
  sets `display` otherwise beats the attribute, and a disclosure ships permanently open.
- `.mono`/`.tabular` carry `white-space: nowrap` to counterweight the `overflow-wrap: anywhere`
  that stops long retailer titles pushing the page sideways -- without it, "$1.89" wraps.
- Responsive via flex/grid and small `@media` overrides in modules. Mobile is the primary
  viewport. Nothing scrolls horizontally at any width; the browser check asserts it.
