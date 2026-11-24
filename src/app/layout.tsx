import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brightwater Plumbing team app",
  description: "The open-source AI employee, running a synthetic sample business.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
