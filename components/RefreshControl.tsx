"use client";

import { useCountdown } from "@/lib/useCountdown";
import type { FreshnessOut } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { RefreshIcon } from "./Icon";
import { RelativeTime } from "./RelativeTime";
import styles from "./RefreshControl.module.css";

interface Props {
  freshness: FreshnessOut | null;
  onRefresh: () => void;
  /** True between the click and the response, before `refreshing` comes back true. */
  pending?: boolean;
  /**
   * When the cooldown ends, in `Date.now()` milliseconds. Anchored by the caller at the
   * moment the API answered, so the countdown is immune to clock skew against the server.
   */
  cooldownEndsAt?: number | null;
  /** Set when the request to start a refresh itself failed (backend down, timeout). */
  requestError?: string | null;
}

/**
 * How old the prices are, and the one control that does something about it.
 *
 * Four states, all driven from `freshness` alone so a reload or a second tab shows the same
 * thing this one does:
 *
 * - **idle** -- "Updated 4 min ago" and an enabled `Refresh prices`.
 * - **refreshing** -- a spinner and `Refreshing...`, whoever started it. The results stay on
 *   screen underneath; this is revalidation, not loading.
 * - **cooling down** -- disabled, counting down `Refresh available in 4:32` against the
 *   browser clock. The API enforces the same window, so this is a courtesy rather than the
 *   protection: reloading the page will not re-arm the button.
 * - **failed** -- a compact line naming what went wrong, beside results that are still the
 *   last valid ones.
 */
export function RefreshControl({
  freshness,
  onRefresh,
  pending = false,
  cooldownEndsAt = null,
  requestError = null,
}: Props) {
  const remaining = useCountdown(cooldownEndsAt);

  if (!freshness) return null;

  const refreshing = freshness.refreshing || pending;
  const coolingDown = !refreshing && remaining > 0;
  const disabled = refreshing || coolingDown;

  return (
    <div className={styles.wrap}>
      <div className={styles.status}>
        {/*
          The status line reports how old the data is; the button reports what the control is
          doing. Saying "Refreshing…" in both put the same word on screen twice.
        */}
        <span
          className={styles.age}
          data-stale={freshness.is_stale && !refreshing ? "" : undefined}
        >
          {freshness.last_updated_at ? (
            <RelativeTime at={freshness.last_updated_at} prefix="Updated" />
          ) : (
            <>Not collected yet</>
          )}
        </span>
        {requestError ? (
          <span className={styles.error} role="alert" title={requestError}>
            Could not start a refresh. Showing the prices from before
          </span>
        ) : freshness.last_error && !refreshing ? (
          <span className={styles.error} title={freshness.last_error}>
            Last refresh failed. Showing the prices from before
          </span>
        ) : null}
      </div>

      <button
        type="button"
        className={`btn btn-sm ${styles.button}`}
        onClick={onRefresh}
        disabled={disabled}
        aria-describedby={coolingDown ? "refresh-cooldown" : undefined}
      >
        {refreshing ? null : <RefreshIcon />}
        {coolingDown ? (
          <span className="tabular" id="refresh-cooldown">
            Refresh available in {formatDuration(remaining)}
          </span>
        ) : refreshing ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Refreshing…
          </>
        ) : (
          <>Refresh prices</>
        )}
      </button>

      {/* Announced once when it changes, rather than on every countdown tick. */}
      <span className="sr-only" role="status">
        {refreshing ? "Refreshing prices" : freshness.is_stale ? "Prices may be out of date" : ""}
      </span>
    </div>
  );
}
