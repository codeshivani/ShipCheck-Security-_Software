import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipCheck — Secure Code. Ship Confidently.",
  description:
    "ShipCheck security scanning with connected login, profile, scan history and repository management.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-sc-bg text-sc-text">{children}</body>
    </html>
  );
}
