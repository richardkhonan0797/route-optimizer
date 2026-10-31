import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Rute Antar",
  description: "Susun pengantaran distribusi dari satu gudang.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
