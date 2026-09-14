import { MAX_BASKET_ITEMS, sanitizeItems, stapleFor, type BasketItem } from "@/lib/basket";

/** The query parameter a shared basket arrives in: `/basket?b=...`. */
export const SHARE_PARAM = "b";

/**
 * The encoding's version, carried inside the payload rather than in the parameter name.
 *
 * A link is a thing people paste into messages and open weeks later, so the decoder has to
 * be able to say "I do not know this shape" instead of guessing at it. Anything that is not
 * this number is refused whole; there is no partial read of a format this build cannot name.
 */
const SHARE_VERSION = 1;

/**
 * Longer than any honest basket, and the first thing checked on the way in.
 *
 * Thirty rows encode to well under a kilobyte, so a parameter past this is not a basket that
 * got large -- it is somebody's idea of a payload, and there is no reason to base64-decode it
 * to find that out.
 */
const MAX_ENCODED_LENGTH = 4096;

/**
 * More of one staple than a shopping trip has ever meant: a tonne of rice, a thousand litres
 * of milk.
 *
 * A ceiling exists because the basket's own floor is one-sided -- `atLeastMinimum` raises a
 * quantity and never lowers one, and `itemProblem` asks only that it be above zero -- so
 * without this a crafted `1e305` is a *valid* row. It rounds to `Infinity` inside
 * `roundQuantity`, which is then printed as "-" in the offer's preview while the basket that
 * opens holds the staple default: a preview that disagrees with what it is previewing. The
 * cap is on the way **in** only. A shopper's own basket is never rewritten by it.
 */
const MAX_QUANTITY = 1_000_000;

/** One shared line: the query, the quantity, and the unit the quantity is written in. */
type SharedRow = [query: string, quantity: number, unit: string];

/**
 * A basket as a link.
 *
 * It carries **only** what a shopper decided: which staples, how much of each, and in what
 * unit. Every price, every store, every "open now" and the whole one-shop-or-two answer are
 * deliberately absent, because they are facts about a moment and a location that belong to
 * whoever opens the link, not to whoever sent it. A frozen total shared on Monday is a lie
 * by Tuesday, and it would be a lie about the receiver's neighbourhood on either day. The
 * ZIP is left out for the same reason, and because it is the one piece of this that says
 * something about a person.
 *
 * The shape is `{ v, i }` over base64url: deterministic (same basket, same string), short
 * enough for the seven-staple basket to fit in about 250 characters of URL, and opaque
 * enough that nobody mistakes it for an API. No server, no token, no row in a table --
 * there is nothing here worth persisting, and a share that outlives the browser tab is a
 * retention decision nobody asked for.
 */
export function encodeBasket(items: readonly BasketItem[]): string {
  const rows: SharedRow[] = items.map((item) => [item.query, item.quantity, item.unit]);
  return toBase64Url(JSON.stringify({ v: SHARE_VERSION, i: rows }));
}

/**
 * The basket a link is carrying, or `null` when it is not carrying one.
 *
 * Everything here arrives from a stranger's URL bar, so nothing is trusted and nothing is
 * evaluated: the payload is JSON, read with `JSON.parse` into a value that is then checked
 * field by field, and the rows that survive go through `sanitizeItems` -- the same repair
 * every basket already gets on load, which owns unit validity, the quantity floor, merging
 * duplicates and the thirty-item cap. A unit this build cannot measure the item in is
 * therefore replaced by the item's own default rather than refused, exactly as a basket
 * saved by an older build is.
 *
 * Rows naming something StoreSplit cannot price are dropped rather than carried. A query
 * that matches no staple can only ever arrive on screen as a row marked "Not a staple
 * StoreSplit compares" that blocks Compare until it is deleted -- so sending one is sending
 * a chore, and the field is the one place in a link where arbitrary text could be written to
 * be read rather than to be priced.
 */
export function decodeBasket(value: string): BasketItem[] | null {
  if (!value || value.length > MAX_ENCODED_LENGTH) return null;
  const json = fromBase64Url(value);
  if (json === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { v, i } = parsed as { v?: unknown; i?: unknown };
  if (v !== SHARE_VERSION || !Array.isArray(i)) return null;

  const items = sanitizeItems(
    i
      .slice(0, MAX_BASKET_ITEMS)
      .filter(isSharedRow)
      .filter(([query]) => stapleFor(query) !== undefined)
      .map(([query, quantity, unit]) => ({ query, quantity, unit })),
  );
  return items.length > 0 ? items : null;
}

function isSharedRow(row: unknown): row is SharedRow {
  return (
    Array.isArray(row) &&
    typeof row[0] === "string" &&
    typeof row[1] === "number" &&
    Number.isFinite(row[1]) &&
    // Only the ceiling. A negative or a zero is left to `sanitizeItems`, which repairs one
    // to the staple's own default -- the row was still a row somebody meant to send.
    row[1] <= MAX_QUANTITY &&
    typeof row[2] === "string"
  );
}

/** The link itself. `origin` is the browser's, so a preview host shares a preview link. */
export function basketShareUrl(origin: string, items: readonly BasketItem[]): string {
  return `${origin}/basket?${SHARE_PARAM}=${encodeBasket(items)}`;
}

/**
 * Put text on the clipboard, and say whether it got there.
 *
 * It answers `false` rather than throwing for all three ways this fails in practice -- an
 * insecure origin where `navigator.clipboard` is simply absent, a permission the browser
 * refuses, and a document that is not focused -- because the caller's job in every one of
 * them is the same: show the link and let the shopper copy it themselves.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** UTF-8, then base64url: the alphabet a query string carries without escaping any of it. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** `null` for anything that is not base64url, before `atob` is asked to have an opinion. */
function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}
