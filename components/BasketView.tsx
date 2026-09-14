"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  compareBasket,
  errorMessage,
  type BasketRequest,
  type BasketResponse,
} from "@/lib/api";
import { invalidItems, toBasketRequest, unitOption, validItems } from "@/lib/basket";
import { formatQuantity, titleCaseName } from "@/lib/format";
import { openStores } from "@/lib/openNow";
import { basketShareUrl, copyText } from "@/lib/share";
import { useBasket } from "@/lib/useBasket";
import { setSharedLinkPhase, useSharedLink } from "@/lib/useSharedLink";
import { focusZipField, useZip, useZipKnown } from "@/lib/zip";
import { BasketEditor } from "./BasketEditor";
import { BasketResults } from "./BasketResults";
import { ClosedStoresDialog } from "./ClosedStoresDialog";
import { ErrorMessage } from "./ErrorMessage";
import { LocationPrompt } from "./LocationPrompt";
import { OpenNowFilter } from "./OpenNowFilter";
import { ShareBasketDialog } from "./ShareBasketDialog";
import styles from "./BasketView.module.css";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; status_code: number | null }
  | { status: "done"; data: BasketResponse; requestKey: string };

export function BasketView() {
  const [zip] = useZip();
  const known = useZipKnown();
  const [items, dispatch] = useBasket();
  const [state, setState] = useState<State>({ status: "idle" });
  const [openNow, setOpenNow] = useState(false);
  const [closedDialogDismissed, setClosedDialogDismissed] = useState(false);
  const [share, setShare] = useState<{ url: string; copied: boolean } | null>(null);
  const link = useSharedLink();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Act on the link, once `useSharedLink` has said what it is, and only ever once.
   *
   * `phase` is the guard, and it lives in the store rather than here: this component
   * remounts on every client-side navigation back to `/basket`, and an effect keyed on
   * component state alone would apply the same link again, over whatever had been edited
   * in between, without asking.
   *
   * The parameter is stripped as soon as it has been read. Leaving it in the address bar
   * would re-ask the question on every reload, and would hand the shopper a URL that stops
   * describing what they are looking at the moment they edit a row. A basket with nothing
   * to overwrite is filled here; a conflict waits for a button, which is a shopper's
   * decision and not an effect's.
   */
  useEffect(() => {
    if (link?.phase !== "pending") return;
    window.history.replaceState(null, "", window.location.pathname);
    if (link.kind === "open") dispatch({ type: "replace", items: link.items });
    setSharedLinkPhase(
      link.kind === "conflict" ? "offered" : link.kind === "open" ? "opening" : "said",
    );
  }, [link, dispatch]);

  // At most one of the three is ever on screen, and which one is the link's own phase.
  const offered = link?.kind === "conflict" && link.phase === "offered" ? link.items : null;
  const opened =
    link && link.kind !== "unreadable" && (link.phase === "opening" || link.phase === "said")
      ? link.items
      : null;
  const unreadable = link?.kind === "unreadable" && link.phase === "said";

  const sendable = validItems(items);
  // Rows that cannot be priced are not removed and not sent: they block the comparison
  // until the shopper fixes or removes them. Quietly dropping one would return a total for
  // four of the five things they chose, with nothing on screen saying which was left out.
  const blocking = invalidItems(items);
  const request = toBasketRequest(zip, items, openNow);
  const requestKey = JSON.stringify(request);
  const stale = state.status === "done" && state.requestKey !== requestKey;
  const stores = state.status === "done" ? state.data.stores : [];
  // Same three conditions as the search view, and for the same reason: unknown-hours stores
  // are kept by the filter, so a basket can price perfectly well while nothing is confirmed
  // open. The dialog is for the case where the filter left nothing to compare.
  const everythingClosed =
    state.status === "done" &&
    state.data.open_now &&
    stores.length > 0 &&
    openStores(stores).length === 0 &&
    state.data.single_store_options.length === 0;

  /** Whether there is anything to compare, and anywhere to compare it against. */
  const canCompare = Boolean(zip) && sendable.length > 0 && blocking.length === 0;

  /**
   * Takes what to send rather than closing over it, which is what makes it stable enough to
   * be an effect's dependency -- `request` is a fresh object every render, so a `compare`
   * that closed over it would be a new function every render and re-run anything keyed on
   * it. The same shape `useSearch::run` uses, for the same reason.
   */
  const compare = useCallback(async (payload: BasketRequest, key: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading" });
    try {
      const data = await compareBasket(payload, controller.signal);
      if (controller.signal.aborted) return;
      setState({ status: "done", data, requestKey: key });
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        status: "error",
        message: errorMessage(err),
        status_code: err instanceof ApiError ? err.status : null,
      });
    }
  }, []);

  /**
   * A basket that arrived in a link is compared without being asked to be.
   *
   * The shopper followed a link to see what someone else's basket costs *here*, so making
   * them press Compare over a basket they did not write is asking them to confirm the thing
   * they already clicked. Every other comparison on this page is still theirs to start.
   *
   * It waits rather than gives up. A first-time visitor arriving on a shared link has no ZIP
   * yet -- the location dialog is in front of them -- so the phase stays `opening` until
   * there is somewhere to compare against, and choosing a ZIP is what releases it. That is
   * also why this lives in the link's phase and not in a ref: the ref would reset on the
   * walk back from `/`, and the page would re-compare a basket the shopper had moved on
   * from every time they returned to it.
   */
  useEffect(() => {
    if (link?.phase !== "opening") return;
    // Somebody got there first: the shopper pressed Compare themselves, or edited the
    // basket into something that failed. Either way the link has had its say.
    if (state.status !== "idle") {
      setSharedLinkPhase("said");
      return;
    }
    if (!canCompare) return;
    setSharedLinkPhase("said");
    // `set-state-in-effect` is disabled for this line, not waived: `compare` sets `loading`
    // before it awaits, and the rule cannot see that this is a *fetch* started by something
    // outside React -- a URL the shopper followed -- which is the case its own guidance
    // sends to an effect. The cascade it guards against is impossible here because the
    // phase has already moved to `said` in a store that outlives this component, so there
    // is no second pass to cascade into.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void compare(request, requestKey);
  }, [link, state.status, canCompare, request, requestKey, compare]);

  /**
   * The link is built and copied inside the click, never in an effect the click schedules:
   * a clipboard write is granted on the user's gesture, and a browser that has already
   * returned to its own loop refuses one. Only the rows that can actually be priced go into
   * it -- a link carrying a row the sender has yet to fix is a chore, not a basket.
   */
  const shareBasket = async () => {
    const url = basketShareUrl(window.location.origin, sendable);
    setShare({ url, copied: await copyText(url) });
  };

  const copyShareLink = async () => {
    if (!share) return;
    const copied = await copyText(share.url);
    // Updated from whatever is current rather than from the `share` this closure captured:
    // a browser that stalls on the clipboard can leave this awaiting until after the dialog
    // has been closed, and writing the captured value back would reopen it.
    setShare((current) => (current ? { ...current, copied } : null));
  };

  return (
    <div className="stack">
      <section className={styles.hero}>
        <h1>Compare your basket</h1>
        <p className="muted">
          Add the staples you need and see whether one store or a split across stores is cheapest
          near you.
        </p>
      </section>

      {/* The basket itself is worth building without a ZIP -- it is a shopping list, and it
          persists -- so only the comparison waits for one. */}
      {zip || !known ? null : (
        <LocationPrompt lede="A basket is compared against the shops near one ZIP code." />
      )}

      {/* A shared basket replaces a basket somebody built, so it asks first and shows what it
          is offering. Only an empty basket is filled without a question, because there is
          nothing there to lose. */}
      {offered ? (
        <section className={`card ${styles.shared}`} aria-labelledby="shared-basket-title">
          <h2 id="shared-basket-title" className={styles.sharedTitle}>
            Someone shared a basket with you
          </h2>
          <p className={styles.sharedLede}>
            {items.length > 0
              ? `Opening it replaces the ${items.length} ${items.length === 1 ? "item" : "items"} in your basket.`
              : "Your basket is empty, so nothing of yours is replaced."}{" "}
            Prices and nearby stores are worked out for your location either way.
          </p>
          <ul className={styles.sharedList}>
            {offered.map((item) => (
              <li key={item.id}>
                <span className={styles.sharedName}>{titleCaseName(item.query)}</span>
                <span className="muted">
                  {formatQuantity(item.quantity)}{" "}
                  {unitOption(item.query, item.unit)?.label ?? item.unit}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.sharedActions}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                dispatch({ type: "replace", items: offered });
                setState({ status: "idle" });
                // `opening`, not `said`: accepting the offer owes the same comparison an
                // empty basket got, and the effect above runs it once the rows have landed.
                setSharedLinkPhase("opening");
              }}
            >
              Open shared basket
            </button>
            <button type="button" className="btn" onClick={() => setSharedLinkPhase("done")}>
              Keep my basket
            </button>
          </div>
        </section>
      ) : null}

      {opened ? (
        <p className={styles.sharedNote} role="status">
          Shared basket opened, {opened.length} {opened.length === 1 ? "item" : "items"}.{" "}
          {/* Not "prices below": the results live in this component's state, so walking to
              the search page and back leaves the basket and this line with nothing under
              them. What the sentence is actually for survives that -- where the basket came
              from, and whose location its numbers answer for. */}
          {zip
            ? "Prices are worked out for your location, not the sender's."
            : "Choose a location and it will be priced for you."}
        </p>
      ) : null}

      {unreadable ? (
        <p className={styles.sharedBad} role="status">
          That basket link could not be read. Ask whoever sent it for a new one, or add the items
          below.
        </p>
      ) : null}

      <section className={`card ${styles.editorCard}`}>
        {zip ? (
          <p className={styles.forZip}>
            Comparing stores near <span className="mono">{zip}</span>.{" "}
            <button type="button" className={styles.changeZip} onClick={focusZipField}>
              Change ZIP
            </button>
          </p>
        ) : null}
        <BasketEditor items={items} dispatch={dispatch} disabled={state.status === "loading"} />
        <div className={styles.actions}>
          <OpenNowFilter
            value={openNow}
            onChange={(next) => {
              setClosedDialogDismissed(false);
              setOpenNow(next);
            }}
            openCount={openStores(stores).length}
            storeCount={stores.length}
            disabled={state.status === "loading"}
          />
          <span className={styles.spacer} />
          {/* A fragment, not a wrapper: both stay direct children of the grid that lays the
              three actions out on a phone. */}
          {items.length > 0 ? (
            <>
              <button
                type="button"
                className={`btn btn-sm ${styles.clear}`}
                onClick={() => {
                  dispatch({ type: "clear" });
                  setState({ status: "idle" });
                  // Anything but an offer still waiting for an answer. Clearing to make
                  // room for the shared basket is the likeliest reason to press this, and
                  // the link it came from has already been stripped from the address bar,
                  // so dismissing the offer here would lose it with no way back.
                  if (link && link.phase !== "offered") setSharedLinkPhase("done");
                }}
                disabled={state.status === "loading"}
              >
                Clear basket
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void shareBasket()}
                // Blocked by the same rows that block Compare. A link carries only the
                // priceable rows, so sharing over an unfixed one would quietly send a
                // shorter basket than the one on screen, with nothing saying which row
                // was left out -- the thing this page refuses to do to a total.
                disabled={
                  sendable.length === 0 || blocking.length > 0 || state.status === "loading"
                }
              >
                Share basket
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void compare(request, requestKey)}
            disabled={!canCompare || state.status === "loading"}
            aria-describedby={blocking.length > 0 ? "basket-blocked" : undefined}
          >
            {state.status === "loading" ? (
              <>
                <span className="spinner" aria-hidden="true" /> Comparing…
              </>
            ) : (
              `Compare ${sendable.length > 0 ? `${sendable.length} item${sendable.length === 1 ? "" : "s"}` : ""}`
            )}
          </button>
        </div>
        {/* Why Compare is disabled, said once for the basket. Each offending row says what
            is wrong with it individually, right where it can be fixed. */}
        {blocking.length > 0 ? (
          <p className={styles.blocked} id="basket-blocked" role="status">
            {blocking.length === 1 ? "One item needs" : `${blocking.length} items need`} fixing or
            removing before this basket can be compared or shared.
          </p>
        ) : null}
      </section>

      <ShareBasketDialog
        url={share?.url ?? null}
        copied={share?.copied ?? false}
        onCopy={() => void copyShareLink()}
        onClose={() => setShare(null)}
      />

      <ClosedStoresDialog
        stores={stores}
        open={everythingClosed && !closedDialogDismissed}
        onClose={() => setClosedDialogDismissed(true)}
        onShowAll={() => {
          setClosedDialogDismissed(true);
          setOpenNow(false);
        }}
      />

      {state.status === "error" ? (
        <ErrorMessage
          title={
            state.status_code === 422
              ? "The backend could not price this basket"
              : state.status_code === null
                ? "Backend unreachable"
                : "Comparison failed"
          }
        >
          <p>{state.message}</p>
          {state.status_code === 422 ? (
            <p className="small muted">
              Check that each item is a supported staple and that its unit makes sense for it (eggs
              are counted, milk is by volume, bread by weight in oz, the rest by lb).
            </p>
          ) : null}
        </ErrorMessage>
      ) : null}

      {state.status === "done" ? (
        <>
          {stale ? (
            <p className="small muted">
              Results reflect the basket at the time you pressed Compare. Press Compare again after
              editing items.
            </p>
          ) : null}
          <BasketResults data={state.data} />
        </>
      ) : null}
    </div>
  );
}
