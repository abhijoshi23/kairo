import type { Metadata, Viewport } from "next";
import "./globals.css";

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#5b4bf5"/>
          <stop offset="0.85" stop-color="#ef5da8"/>
        </linearGradient>
        <radialGradient id="h" cx="0.3" cy="0.26" r="0.55">
          <stop offset="0" stop-color="#fff" stop-opacity="0.45"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#g)"/>
      <circle cx="16" cy="16" r="16" fill="url(#h)"/>
      <text x="16" y="22" font-family="system-ui, sans-serif" font-size="17" font-weight="700" fill="#fff" text-anchor="middle">K</text>
    </svg>`,
  );

// Applied before first paint so switching themes never flashes the old one
// on reload. Reads the same localStorage key ThemeToggle writes to; absent
// or "system" leaves data-theme unset, and globals.css falls back to
// prefers-color-scheme.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("kairo:theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
