import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

interface Props {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

/** Says what is missing and offers the next step; never just "no results". */
export function EmptyState({ title, children, action }: Props) {
  return (
    <div className={`card ${styles.empty}`}>
      <h3 className={styles.title}>{title}</h3>
      {children ? <p className={styles.body}>{children}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
