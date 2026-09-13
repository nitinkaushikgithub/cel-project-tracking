import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CEL Project Monitoring",
  description: "Internal project activity tracking and alerts for CEL",
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
