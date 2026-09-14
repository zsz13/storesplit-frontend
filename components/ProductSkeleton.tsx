import styles from "./ProductSkeleton.module.css";

/**
 * Placeholders shaped like the cards that will replace them.
 *
 * The geometry matches `ProductCard` exactly -- same thumbnail box, same two text lines,
 * same price column -- so results arriving do not move anything already on screen.
 */
export function ProductSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={styles.list} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`card ${styles.card}`}>
          <div className={`skeleton ${styles.thumb}`} />
          <div className={styles.text}>
            <div className={`skeleton ${styles.brand}`} />
            <div className={`skeleton ${styles.name}`} />
            <div className={`skeleton ${styles.facts}`} />
          </div>
          <div className={styles.price}>
            <div className={`skeleton ${styles.priceMain}`} />
            <div className={`skeleton ${styles.priceUnit}`} />
          </div>
        </div>
      ))}
    </div>
  );
}
