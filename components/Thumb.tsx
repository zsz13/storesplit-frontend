"use client";

import { useState } from "react";
import { ImageIcon } from "./Icon";
import styles from "./Thumb.module.css";

interface Props {
  src: string | null;
  alt: string;
  /** `card` on a result row, `row` inside the offer table. */
  size?: "card" | "row";
}

/**
 * A retailer product photo, or a placeholder that occupies exactly the same box.
 *
 * The box is always drawn, at a fixed size, whether or not there is an image: a thumbnail
 * that appears when it loads would reflow every row beneath it. Images are lazy and
 * `decoding="async"` because a result page carries twenty of them from ten different CDNs,
 * and none of them is the reason anyone came to the page.
 *
 * A broken URL is treated exactly as a missing one. The backend validates image URLs at
 * ingest, so this is the second gate rather than the only one -- a CDN that 404s today
 * still must not leave a torn icon in the middle of a price comparison.
 */
export function Thumb({ src, alt, size = "card" }: Props) {
  const [failed, setFailed] = useState(false);
  const usable = src && !failed;

  return (
    <div className={`${styles.thumb} ${size === "row" ? styles.row : styles.card}`}>
      {usable ? (
        /* These are third-party retailer CDN images. `next/image` would route them through
           this app's optimizer, which means proxying and caching another company's assets on
           our own origin for no benefit -- they are already small thumbnails, lazy, and off
           the critical path. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.img}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.placeholder} aria-hidden="true">
          <ImageIcon size={size === "row" ? 14 : 18} />
        </span>
      )}
    </div>
  );
}
