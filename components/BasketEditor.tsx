"use client";

import { useState, type FormEvent } from "react";
import {
  MAX_BASKET_ITEMS,
  STAPLES,
  createItem,
  defaultsFor,
  itemProblem,
  problemMessage,
  unitOption,
  unitsFor,
  withUnit,
  type BasketAction,
  type BasketItem,
} from "@/lib/basket";
import { titleCaseName } from "@/lib/format";
import styles from "./BasketEditor.module.css";

interface Props {
  items: BasketItem[];
  dispatch: (action: BasketAction) => void;
  disabled?: boolean;
}

export function BasketEditor({ items, dispatch, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<string>("count");
  const full = items.length >= MAX_BASKET_ITEMS;
  // The units offered follow the item being typed, so an impossible pairing is never on
  // screen to be chosen. An empty list means the query names no staple, which the Add
  // button reports rather than the unit control.
  const units = unitsFor(query);

  const draft = { id: "draft", query, quantity: Number(quantity), unit };
  const draftProblem = query.trim() ? itemProblem(draft) : null;

  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!query.trim() || !Number.isFinite(qty) || qty <= 0) return;
    dispatch({ type: "add", item: createItem(query, qty, unit) });
    setQuery("");
    setQuantity("1");
    setUnit("count");
  };

  /** The same conversion a saved row gets: the amount is kept, only how it is written moves. */
  const changeDraftUnit = (next: string) => {
    const converted = withUnit({ ...draft, quantity: Number(quantity) || 0 }, next);
    setUnit(next);
    if (converted.unit === next && Number.isFinite(converted.quantity)) {
      setQuantity(String(converted.quantity));
    }
  };

  return (
    <div className={styles.editor}>
      <div className={styles.chips} aria-label="Add a staple">
        {STAPLES.map((staple) => (
          <button
            key={staple.query}
            type="button"
            className="chip"
            disabled={disabled || full}
            onClick={() => dispatch({ type: "add", item: createItem(staple.query) })}
          >
            + {titleCaseName(staple.query)}
          </button>
        ))}
      </div>

      {/* `noValidate`, because `step` is a validity *constraint* and not merely the stepper's
          increment: a quantity carried over from another unit (16 oz of bread is 453.5924 g)
          sits between two steps of any grid, and the browser would refuse to submit a row
          that is perfectly priceable. `draftProblem` is the gate instead -- it knows this
          item's real floor, which is the only thing a quantity here can be wrong about, and
          it can say which number it wants rather than only refusing. */}
      <form className={styles.form} onSubmit={addCustom} noValidate>
        <label className={styles.field}>
          <span className={styles.label}>Item</span>
          <input
            value={query}
            placeholder="e.g. Whole Milk"
            list="staple-queries"
            onChange={(e) => {
              setQuery(e.target.value);
              const d = defaultsFor(e.target.value);
              setUnit(d.unit);
              setQuantity(String(d.quantity));
            }}
            disabled={disabled}
          />
          <datalist id="staple-queries">
            {/* The value is what lands in the field, and `normalizeQuery` lowercases it back
                into the canonical key on the way to the API -- so a shopper picking from this
                list reads "Chicken Breast" and the request still carries `chicken breast`. */}
            {STAPLES.map((s) => (
              <option key={s.query} value={titleCaseName(s.query)} />
            ))}
          </datalist>
        </label>
        <label className={`${styles.field} ${styles.qty}`}>
          <span className={styles.label}>Qty</span>
          <input
            type="number"
            // No `min` beside it: HTML anchors the step grid to `min`, so a floor of
            // 0.0022 lb turned every round quantity into a step mismatch -- typing "bread"
            // filled in its own default of 1 lb and the browser then refused to add it,
            // offering "0.5022 and 1.0022". Anchored at zero, every staple's default sits on
            // its own grid, and `itemProblem` owns the floor.
            step={unitOption(query, unit)?.step ?? "any"}
            inputMode="decimal"
            value={quantity}
            aria-invalid={draftProblem === "quantity" || draftProblem === "minimum" || undefined}
            aria-describedby={draftProblem ? "basket-draft-problem" : undefined}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={disabled}
          />
        </label>
        <label className={`${styles.field} ${styles.unit}`}>
          <span className={styles.label}>Unit</span>
          <select
            value={unit}
            onChange={(e) => changeDraftUnit(e.target.value)}
            disabled={disabled || units.length === 0}
          >
            {units.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
            {units.length === 0 ? <option value={unit}>{unit}</option> : null}
          </select>
        </label>
        <button
          type="submit"
          className="btn"
          disabled={disabled || full || !query.trim() || draftProblem !== null}
        >
          Add
        </button>
      </form>

      {/* Said before the row exists, so a quantity under the minimum is never added and then
          reported. The staple chips and the defaults cannot reach this. */}
      {draftProblem ? (
        <p className={styles.problem} id="basket-draft-problem" role="status">
          {problemMessage(draft, draftProblem)}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="muted small">Your basket is empty. Add a few staples to compare stores.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <BasketRow key={item.id} item={item} dispatch={dispatch} disabled={disabled} />
          ))}
        </ul>
      )}
      {full ? (
        <p className="small muted">Basket limit of {MAX_BASKET_ITEMS} items reached.</p>
      ) : null}
    </div>
  );
}

/**
 * One editable line, and whatever is wrong with it.
 *
 * A row that cannot be priced is marked here and left in place. It is not dropped from the
 * request, and `BasketView` refuses to compare while one exists, so the shopper decides
 * whether to fix it or remove it. Silently omitting it would return a total for four of the
 * five things they chose with nothing on screen saying so.
 *
 * What *is* repaired, and repaired before this component ever sees it, is a row StoreSplit
 * itself broke: `sanitizeItems` rewrites a legacy `bread / count` into the category default
 * on load. What is left here is a shopper's own doing, which is the only thing worth
 * stopping the basket for.
 */
function BasketRow({
  item,
  dispatch,
  disabled,
}: {
  item: BasketItem;
  dispatch: (action: BasketAction) => void;
  disabled?: boolean;
}) {
  const problem = itemProblem(item);
  const units = unitsFor(item.query);
  const messageId = `basket-problem-${item.id}`;

  return (
    <li className={styles.item} data-invalid={problem ? "" : undefined}>
      <span className={styles.itemName}>{titleCaseName(item.query)}</span>
      <input
        aria-label={`Quantity of ${titleCaseName(item.query)}`}
        aria-invalid={problem === "quantity" || problem === "minimum" || undefined}
        aria-describedby={problem ? messageId : undefined}
        className={styles.itemQty}
        type="number"
        // `step` is the stepper's increment, and there is deliberately no `min` beside it:
        // HTML anchors the step grid to `min`, so a floor of 0.0022 lb would make the up
        // arrow offer 1.5022 lb instead of 1.5. `itemProblem` owns the floor, and unlike a
        // control it can name the number it wants.
        step={unitOption(item.query, item.unit)?.step ?? "any"}
        inputMode="decimal"
        value={item.quantity}
        disabled={disabled}
        onChange={(e) => {
          const qty = Number(e.target.value);
          dispatch({
            type: "update",
            id: item.id,
            patch: { quantity: Number.isFinite(qty) ? qty : 0 },
          });
        }}
      />
      <select
        aria-label={`Unit of ${titleCaseName(item.query)}`}
        aria-invalid={problem === "unit" || undefined}
        aria-describedby={problem ? messageId : undefined}
        className={styles.itemUnit}
        value={item.unit}
        disabled={disabled || units.length === 0}
        // The amount is what the shopper chose; the unit is only how it is written. Swapping
        // the word alone would turn 1 lb of bread into 1 oz -- a sixteenth of the bread,
        // decided by nobody. `withUnit` converts it and holds it at the item's minimum.
        onChange={(e) => {
          const next = withUnit(item, e.target.value);
          dispatch({
            type: "update",
            id: item.id,
            patch: { unit: next.unit, quantity: next.quantity },
          });
        }}
      >
        {units.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
        {/* A unit outside this item's list is what a stored basket from an older build can
            still hold. It is kept selectable so the row shows what it really is, rather
            than snapping to a value nobody chose and pricing that instead. */}
        {units.some((u) => u.value === item.unit) ? null : (
          <option value={item.unit}>{item.unit}</option>
        )}
      </select>
      <button
        type="button"
        className={`btn btn-sm ${styles.remove}`}
        aria-label={`Remove ${titleCaseName(item.query)}`}
        disabled={disabled}
        onClick={() => dispatch({ type: "remove", id: item.id })}
      >
        ×
      </button>
      {problem ? (
        <p className={styles.problem} id={messageId}>
          {problemMessage(item, problem)}
        </p>
      ) : null}
    </li>
  );
}
