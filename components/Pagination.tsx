"use client";

import type { PageOut } from "@/lib/api";
import { ChevronLeft, ChevronRight } from "./Icon";
import styles from "./Pagination.module.css";

interface Props {
  page: PageOut;
  onPage: (page: number) => void;
}

/**
 * Pages of canonical products, never of offers.
 *
 * A product's own offers all live on its card, so a page boundary can never fall between
 * two prices for the same thing -- which would be the one place a comparison must not break.
 */
export function Pagination({ page, onPage }: Props) {
  if (page.total_pages <= 1) return null;

  return (
    <nav className={styles.nav} aria-label="Results pages">
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => onPage(page.page - 1)}
        disabled={!page.has_previous}
      >
        <ChevronLeft />
        Previous
      </button>

      <span className={`${styles.status} tabular`} aria-live="polite">
        Page {page.page} of {page.total_pages}
        <span className={styles.total}>
          {page.total_products} product{page.total_products === 1 ? "" : "s"}
        </span>
      </span>

      <button
        type="button"
        className="btn btn-sm"
        onClick={() => onPage(page.page + 1)}
        disabled={!page.has_next}
      >
        Next
        <ChevronRight />
      </button>
    </nav>
  );
}
