"use client";

import { useRef } from "react";
import type { AvailabilityFilter as Filter } from "@/lib/api";
import styles from "./AvailabilityFilter.module.css";

const OPTIONS: { value: Filter; label: string }[] = [
  { value: "in_stock", label: "In stock" },
  { value: "unknown", label: "Unconfirmed" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "all", label: "All" },
];

interface Props {
  value: Filter;
  onChange: (next: Filter) => void;
}

/**
 * Which offers to compare. A `radiogroup`, because these are four mutually exclusive views
 * of one result set and arrow keys should move between them.
 *
 * The backend applies the filter: it also decides which offer is cheapest, so hiding rows in
 * the browser would leave a badge on an offer the filter had just removed.
 */
export function AvailabilityFilter({ value, onChange }: Props) {
  const groupRef = useRef<HTMLDivElement>(null);

  /**
   * Move the selection and take focus with it.
   *
   * Roving tabindex means only the checked radio is tabbable, so leaving focus on the button
   * that was just unchecked strands the keyboard user on a control that reports itself
   * unchecked and cannot be tabbed back to.
   */
  const select = (next: Filter) => {
    onChange(next);
    const index = OPTIONS.findIndex((o) => o.value === next);
    groupRef.current?.querySelectorAll("button")[index]?.focus();
  };

  return (
    <div className={styles.group} role="radiogroup" aria-label="Availability" ref={groupRef}>
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className={`chip ${styles.chip}`}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const step =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : 0;
            if (step === 0) return;
            event.preventDefault();
            const index = OPTIONS.findIndex((o) => o.value === value);
            select(OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length].value);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
