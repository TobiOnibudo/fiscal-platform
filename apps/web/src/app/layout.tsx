import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fiscal | Financial review",
  description:
    "Review reported financial statements and their source evidence.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
