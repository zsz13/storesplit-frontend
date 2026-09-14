"use client";

import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format";
import { useNow } from "@/lib/useNow";

interface Props {
  at: string | null | undefined;
  className?: string;
  /** Text before the time, e.g. "Updated". */
  prefix?: string;
}

/**
 * A collection time as "5 min ago", with the exact moment on hover.
 *
 * Owns the one awkward part of relative time: `useNow` returns null on the server and until
 * hydration, deliberately, because a server-rendered "5 min ago" is already wrong by the time
 * the browser paints it and would mismatch during hydration. Rendering the element but not
 * its text keeps the formatter a pure function of `(iso, now)` and keeps that decision in
 * one place instead of at every call site.
 */
export function RelativeTime({ at, className, prefix }: Props) {
  const now = useNow();
  if (!at) return null;
  return (
    <time className={className} dateTime={at} title={formatAbsoluteTime(at)}>
      {prefix ? `${prefix} ` : ""}
      {now === null ? "" : formatRelativeTime(at, now)}
    </time>
  );
}
