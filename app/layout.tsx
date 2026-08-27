import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Imago",
  description:
    "Upload a set of photos, find the strongest subset for your narrative, and get a professionally enhanced final set.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
