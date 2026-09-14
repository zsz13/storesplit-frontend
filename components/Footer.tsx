import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.inner}`}>
        <p className={styles.note}>
          Prices are collected from retailers&rsquo; own sites on demand and may be stale or
          incomplete. Always confirm in store.
        </p>
        <p className={styles.note}>StoreSplit is not affiliated with any retailer.</p>
      </div>
    </footer>
  );
}
