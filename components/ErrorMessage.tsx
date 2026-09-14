import type { ReactNode } from "react";
import styles from "./ErrorMessage.module.css";

/** A failure that says what happened and leaves a way forward. */
export function ErrorMessage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={`card ${styles.error}`} role="alert">
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
