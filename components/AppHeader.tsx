"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useZip } from "@/lib/zip";
import { ZipInput } from "./ZipInput";
import styles from "./AppHeader.module.css";

const NAV = [
  { href: "/", label: "Compare prices" },
  { href: "/basket", label: "Basket" },
];

/**
 * The one persistent surface: what this is, where you are, and which ZIP everything below is
 * answering for.
 *
 * Sticky, because the ZIP is the parameter every number on the page depends on and it must
 * stay reachable while scrolling a long list of results. It takes its shadow only once the
 * page has scrolled -- the single floating element in the system.
 */
export function AppHeader() {
  const pathname = usePathname();
  const [zip, setZip] = useZip();

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          StoreSplit
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navLink}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.zip}>
          <ZipInput key={zip} value={zip} onChange={setZip} compact />
        </div>
      </div>
    </header>
  );
}
