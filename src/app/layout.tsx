import type { Metadata, Viewport } from "next";
import "./globals.css";

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#5b4bf5"/>
          <stop offset="1" stop-color="#ef5da8"/>
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#g)"/>
      <text x="16" y="22" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#fff" text-anchor="middle">K</text>
    </svg>`,
  );

export const metadata: Metadata = {
  title: "Kairo",
  description: "A personal AI assistant.",
  icons: [{ url: FAVICON, type: "image/svg+xml" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
