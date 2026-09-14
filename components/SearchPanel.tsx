"use client";

import { useState } from "react";
import { STAPLE_QUERIES } from "@/lib/basket";
import { titleCaseName } from "@/lib/format";
import { SearchIcon } from "./Icon";
import styles from "./SearchPanel.module.css";

interface Props {
  activeQuery?: string;
  onSearch: (query: string) => void;
}

/**
 * The search itself: a field, and the seven staples StoreSplit actually compares.
 *
 * The chips are the primary path, not a shortcut. Only these categories have a normalized
 * comparison unit behind them, so offering them by name is more honest than an open field
 * that quietly fails on "kumquat".
 */
export function SearchPanel({ activeQuery, onSearch }: Props) {
  const [draft, setDraft] = useState(activeQuery ?? "");
  const [lastQuery, setLastQuery] = useState(activeQuery);

  // Following a chip must move the field with it, so the two never disagree about what is on
  // screen. Adjusted during render, guarded by the value it was derived from -- React's
  // documented way to reset state from a prop, and one render cheaper than an effect.
  if (activeQuery !== lastQuery) {
    setLastQuery(activeQuery);
    if (activeQuery !== undefined) setDraft(activeQuery);
  }

  return (
    <section className={styles.panel} aria-label="Search">
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          const query = draft.trim();
          if (query) onSearch(query);
        }}
        role="search"
      >
        <div className={styles.field}>
          <SearchIcon className={styles.icon} />
          <input
            type="search"
            className={styles.input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search a staple: Eggs, Milk, Bread…"
            aria-label="Search for a staple"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
          Search
        </button>
      </form>

      <div className={styles.rail} role="group" aria-label="Staples">
        {STAPLE_QUERIES.map((staple) => (
          <button
            key={staple}
            type="button"
            className={`chip ${styles.chip}`}
            aria-pressed={activeQuery?.toLowerCase() === staple.toLowerCase()}
            onClick={() => onSearch(staple)}
          >
            {titleCaseName(staple)}
          </button>
        ))}
      </div>
    </section>
  );
}
