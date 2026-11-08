import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
// Hand lettering for the lesson illustrations: Caveat (SIL Open Font License, fonts/Caveat-OFL.txt),
// served from the app. Google Fonts sometimes serves its files under a URL that the build's font
// loader rejects, which failed builds that had not changed.
const hand = localFont({
  src: [
    { path: "./fonts/caveat-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/caveat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-hand",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Aline — cricket shot analysis", template: "%s · Aline" },
  description:
    "Shot analysis for cricket: the front-foot and the back-foot defence. Reconstruct body, bat and ball, confirm the shot before grading it, then train one measurable priority.",
  applicationName: "Aline",
  appleWebApp: { capable: true, title: "Aline", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e3eadf" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Applies a saved light/dark choice before first paint (no flash). Default: follow the device.
const themeScript = `try{var t=localStorage.getItem("align.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${hand.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
