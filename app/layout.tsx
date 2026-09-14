import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Footer } from "@/components/Footer";
import { LocationDialog } from "@/components/LocationDialog";
import "./globals.css";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "StoreSplit",
  description:
    "Compare grocery staple prices across nearby stores by unit price, from each retailer's own site.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={styles.body}>
        <a className={styles.skip} href="#main">
          Skip to results
        </a>
        <AppHeader />
        <main id="main" className={`container ${styles.main}`}>
          {children}
        </main>
        <Footer />
        {/* Rendered once for the whole app: the ZIP is shared by both pages, so the question
            about it is asked in one place. It opens itself only when there is no valid one. */}
        <LocationDialog />
      </body>
    </html>
  );
}
